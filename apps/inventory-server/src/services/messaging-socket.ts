/**
 * Real-time messaging via Socket.io
 *
 * Architecture:
 *  - Single namespace: /messaging
 *  - JWT auth on handshake (operators); anonymous allowed for support rooms
 *  - Socket.io rooms keyed as `{tenantSlug}:{roomId}` for tenant isolation
 *
 * Client → Server events:
 *   join_rooms         — auto-join all rooms the user is a member of
 *   send_message       — post a message (ack returns the created event)
 *   typing_start       — broadcast typing indicator to room
 *   typing_stop        — broadcast typing stopped
 *   mark_read          — update last_read_at for this user in a room
 *
 * Server → Client events:
 *   new_message        — a message was posted in a room
 *   user_typing        — someone is typing
 *   user_stop_typing   — someone stopped typing
 *   room_updated       — room name/topic changed
 *   presence           — user online/offline
 *   error              — socket-level error
 */

import { Server as SocketServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyAccessToken } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';
import { wsConnections, messagingMessagesSent } from '../metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MessageEvent {
  id:          string;
  roomId:      string;
  senderId:    string | null;
  senderName:  string;
  eventType:   string;
  content:     Record<string, unknown>;
  relatesToId: string | null;
  createdAt:   string;
}

interface SocketData {
  userId:      string | null;
  tenantSlug:  string;
  tenantId:    string;
  role:        string;
  displayName: string;
  isAnonymous: boolean;
}

// ── Singleton ref ─────────────────────────────────────────────────────────────
let _io: SocketServer | null = null;

export function getMessagingIO(): SocketServer | null {
  return _io;
}

// ── Factory ───────────────────────────────────────────────────────────────────
export function createMessagingSocket(httpServer: HttpServer): SocketServer {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .filter(Boolean);

  const io = new SocketServer(httpServer, {
    path:        '/ws/messaging',
    cors: {
      origin:      allowedOrigins.length ? allowedOrigins : '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  _io = io;

  // ── Auth middleware ─────────────────────────────────────────────────────────
  io.use(async (socket: Socket, next: (err?: Error) => void) => {
    const token      = (socket.handshake.auth as any)?.token as string | undefined;
    const tenantSlug = ((socket.handshake.query as any)?.tenantSlug as string)
                    ?? ((socket.handshake.auth as any)?.tenantSlug as string);

    if (!tenantSlug) {
      return next(new Error('tenantSlug required'));
    }

    if (!token) {
      // Anonymous — allowed only for support rooms
      const displayName = ((socket.handshake.auth as any)?.displayName as string) ?? 'Guest';
      (socket as any).data = {
        userId:      null,
        tenantSlug,
        tenantId:    '',
        role:        'guest',
        displayName,
        isAnonymous: true,
      } satisfies SocketData;
      return next();
    }

    try {
      const clean   = token.replace(/^Bearer\s+/i, '');
      const payload = await verifyAccessToken(clean);

      if (payload.tenantSlug !== tenantSlug) {
        return next(new Error('Token tenant mismatch'));
      }

      (socket as any).data = {
        userId:      payload.sub,
        tenantSlug:  payload.tenantSlug,
        tenantId:    payload.tenantId,
        role:        payload.role,
        displayName: payload.email,
        isAnonymous: false,
      } satisfies SocketData;

      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const data = (socket as any).data as SocketData;

    wsConnections.inc();

    console.log(
      `[messaging] connected: ${data.isAnonymous ? 'anon' : data.userId} @ ${data.tenantSlug}`,
    );

    // Presence broadcast
    if (!data.isAnonymous) {
      socket.broadcast.emit('presence', {
        userId: data.userId,
        status: 'online',
      });
    }

    // ── join_rooms: auto-join all rooms this user is a member of ───────────
    socket.on('join_rooms', async (callback: (r: { ok: boolean; rooms?: string[] }) => void) => {
      if (data.isAnonymous) {
        callback({ ok: false });
        return;
      }

      try {
        const rooms = await withTenantSchema(data.tenantSlug, async (db: any) => {
          const { rows } = await db.query(
            `SELECT mm.room_id
             FROM messaging_members mm
             WHERE mm.user_id = $1`,
            [data.userId],
          );
          return rows as Array<{ room_id: string }>;
        });

        const roomKeys = (rooms as Array<{ room_id: string }>).map((r) => socketRoomKey(data.tenantSlug, r.room_id));
        await socket.join(roomKeys);
        callback({ ok: true, rooms: roomKeys });
      } catch (err) {
        console.error('[messaging] join_rooms error:', err);
        callback({ ok: false });
      }
    });

    // ── send_message ────────────────────────────────────────────────────────
    socket.on(
      'send_message',
      async (
        input: { roomId: string; body: string; msgtype?: string; relatesToId?: string },
        callback: (r: { ok: boolean; event?: MessageEvent; error?: string }) => void,
      ) => {
        if (!input?.roomId || !input?.body?.trim()) {
          callback({ ok: false, error: 'roomId and body are required' });
          return;
        }

        const isAnon = data.isAnonymous;
        const slug   = data.tenantSlug;

        try {
          const event = await withTenantSchema(slug, async (db: any) => {
            // Verify sender is a member (or anonymous in a support room)
            if (!isAnon) {
              const { rows: memberRows } = await db.query(
                'SELECT 1 FROM messaging_members WHERE room_id = $1 AND user_id = $2',
                [input.roomId, data.userId],
              );
              if (!memberRows.length) throw new Error('Not a member of this room');
            } else {
              const { rows: roomRows } = await db.query(
                `SELECT room_type FROM messaging_rooms WHERE id = $1`,
                [input.roomId],
              );
              if (!roomRows.length || roomRows[0].room_type !== 'support') {
                throw new Error('Anonymous messaging only allowed in support rooms');
              }
            }

            const content: Record<string, unknown> = {
              msgtype: input.msgtype ?? 'm.text',
              body:    input.body.trim(),
            };

            const { rows } = await db.query(
              `INSERT INTO messaging_events
                 (room_id, sender_id, sender_name, event_type, content, relates_to)
               VALUES ($1, $2, $3, 'm.room.message', $4, $5)
               RETURNING id, room_id, sender_id, sender_name, event_type, content,
                         relates_to AS "relates_to_id", created_at`,
              [
                input.roomId,
                data.userId ?? null,
                data.displayName,
                JSON.stringify(content),
                input.relatesToId ?? null,
              ],
            );

            return rows[0] as any;
          });

          const msgEvent: MessageEvent = {
            id:          event.id,
            roomId:      event.room_id,
            senderId:    event.sender_id,
            senderName:  event.sender_name,
            eventType:   event.event_type,
            content:     event.content,
            relatesToId: event.relates_to_id,
            createdAt:   event.created_at,
          };

          // Broadcast to room (including sender so all their tabs get it)
          io.to(socketRoomKey(slug, input.roomId)).emit('new_message', msgEvent);
          messagingMessagesSent.inc({ tenant_slug: slug });
          callback({ ok: true, event: msgEvent });
        } catch (err: any) {
          callback({ ok: false, error: err.message ?? 'Send failed' });
        }
      },
    );

    // ── typing_start ────────────────────────────────────────────────────────
    socket.on('typing_start', ({ roomId }: { roomId: string }) => {
      if (!roomId) return;
      socket.to(socketRoomKey(data.tenantSlug, roomId)).emit('user_typing', {
        roomId,
        userId:      data.userId,
        displayName: data.displayName,
      });
    });

    // ── typing_stop ─────────────────────────────────────────────────────────
    socket.on('typing_stop', ({ roomId }: { roomId: string }) => {
      if (!roomId) return;
      socket.to(socketRoomKey(data.tenantSlug, roomId)).emit('user_stop_typing', {
        roomId,
        userId: data.userId,
      });
    });

    // ── mark_read ───────────────────────────────────────────────────────────
    socket.on('mark_read', async ({ roomId }: { roomId: string }) => {
      if (!roomId || data.isAnonymous) return;
      try {
        await withTenantSchema(data.tenantSlug, async (db: any) => {
          await db.query(
            `UPDATE messaging_members SET last_read_at = now()
             WHERE room_id = $1 AND user_id = $2`,
            [roomId, data.userId],
          );
        });
      } catch {
        // non-critical
      }
    });

    // ── join_support_room: anonymous customer joins a support room ─────────
    socket.on(
      'join_support_room',
      async (
        { roomId }: { roomId: string },
        callback: (r: { ok: boolean; error?: string }) => void,
      ) => {
        try {
          await socket.join(socketRoomKey(data.tenantSlug, roomId));
          callback({ ok: true });
        } catch {
          callback({ ok: false, error: 'Could not join room' });
        }
      },
    );

    // ── disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      wsConnections.dec();
      if (!data.isAnonymous) {
        socket.broadcast.emit('presence', {
          userId: data.userId,
          status: 'offline',
        });
      }
    });
  });

  return io;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function socketRoomKey(tenantSlug: string, roomId: string): string {
  return `${tenantSlug}:${roomId}`;
}

/**
 * Broadcast a message to a room from server-side code (e.g. REST fallback).
 */
export function broadcastToRoom(
  tenantSlug: string,
  roomId: string,
  event: string,
  data: unknown,
): void {
  _io?.to(socketRoomKey(tenantSlug, roomId)).emit(event, data);
}
