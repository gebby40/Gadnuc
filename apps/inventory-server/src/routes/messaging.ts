/**
 * Messaging REST API — Matrix-inspired rooms/events
 *
 * All routes (except POST /support) require authentication.
 * All routes are gated behind featureGuard('matrix') (professional/enterprise).
 *
 * Routes:
 *   GET    /api/messaging/rooms                  — list rooms the caller is a member of
 *   POST   /api/messaging/rooms                  — create a room
 *   GET    /api/messaging/rooms/:id              — get room details
 *   DELETE /api/messaging/rooms/:id              — delete room (owner/admin only)
 *   GET    /api/messaging/rooms/:id/messages     — paginated message history
 *   POST   /api/messaging/rooms/:id/invite       — invite a user to a room
 *   POST   /api/messaging/rooms/:id/leave        — leave a room
 *   PUT    /api/messaging/rooms/:id/read         — mark room as read
 *   DELETE /api/messaging/rooms/:id/messages/:msgId — redact a message
 *   POST   /api/messaging/support                — anonymous start/resume support room
 */

import { Router, type Request, type Response } from 'express';
import { z }                 from 'zod';
import { requireAuth }       from '@gadnuc/auth';
import { withTenantSchema }  from '@gadnuc/db';
import { broadcastToRoom }   from '../services/messaging-socket.js';

export const messagingRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function tenantSlug(req: Request): string {
  return (req.tenant?.slug ?? req.user?.tenantSlug)!;
}

function userId(req: Request): string {
  return req.user!.userId;
}

// ── Validation schemas ────────────────────────────────────────────────────────

const createRoomSchema = z.object({
  name:      z.string().min(1).max(100),
  topic:     z.string().max(500).optional(),
  roomType:  z.enum(['channel', 'direct']).default('channel'),
  isPublic:  z.boolean().default(false),
  memberIds: z.array(z.string().uuid()).optional(),
});

const sendMessageSchema = z.object({
  body:        z.string().min(1).max(10_000),
  msgtype:     z.string().default('m.text'),
  relatesToId: z.string().uuid().optional(),
});

const inviteSchema = z.object({
  userId: z.string().uuid(),
  role:   z.enum(['owner', 'moderator', 'member']).default('member'),
});

const supportSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  message:     z.string().min(1).max(5_000),
});

// ── GET /api/messaging/rooms ──────────────────────────────────────────────────

messagingRouter.get('/rooms', requireAuth, async (req: Request, res: Response) => {
  try {
    const rooms = await withTenantSchema(tenantSlug(req), async (db) => {
      const { rows } = await db.query(
        `SELECT r.id, r.name, r.topic, r.room_type, r.is_public,
                r.created_at, r.updated_at, mm.role, mm.last_read_at,
                (SELECT COUNT(*) FROM messaging_events me
                   WHERE me.room_id = r.id AND me.is_redacted = false
                     AND (mm.last_read_at IS NULL OR me.created_at > mm.last_read_at)
                ) AS unread_count
         FROM messaging_rooms r
         JOIN messaging_members mm ON mm.room_id = r.id
         WHERE mm.user_id = $1
         ORDER BY r.updated_at DESC`,
        [userId(req)],
      );
      return rows;
    });
    res.json({ data: rooms });
  } catch (err) {
    console.error('[messaging] list rooms error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/messaging/rooms ─────────────────────────────────────────────────

messagingRouter.post('/rooms', requireAuth, async (req: Request, res: Response) => {
  const parse = createRoomSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { name, topic, roomType, isPublic, memberIds } = parse.data;
  const slug = tenantSlug(req);
  const uid  = userId(req);

  try {
    const room = await withTenantSchema(slug, async (db) => {
      // Create room
      const { rows: [r] } = await db.query(
        `INSERT INTO messaging_rooms (name, topic, room_type, is_public, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, topic ?? null, roomType, isPublic, uid],
      );

      // Add creator as owner
      await db.query(
        `INSERT INTO messaging_members (room_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [r.id, uid],
      );

      // Optionally add initial members
      if (memberIds?.length) {
        for (const memberId of memberIds) {
          if (memberId === uid) continue;
          await db.query(
            `INSERT INTO messaging_members (room_id, user_id, role)
             VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
            [r.id, memberId],
          ).catch(() => {/* ignore invalid user ids */});
        }
      }

      // Emit m.room.create event
      await db.query(
        `INSERT INTO messaging_events (room_id, sender_id, sender_name, event_type, content)
         VALUES ($1, $2, (SELECT email FROM users WHERE id = $2), 'm.room.create', $3)`,
        [r.id, uid, JSON.stringify({ creator: uid })],
      );

      return r;
    });

    res.status(201).json({ data: room });
  } catch (err) {
    console.error('[messaging] create room error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/messaging/rooms/:id ──────────────────────────────────────────────

messagingRouter.get('/rooms/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const room = await withTenantSchema(tenantSlug(req), async (db) => {
      const { rows } = await db.query(
        `SELECT r.*, mm.role, mm.last_read_at
         FROM messaging_rooms r
         JOIN messaging_members mm ON mm.room_id = r.id AND mm.user_id = $2
         WHERE r.id = $1`,
        [req.params.id, userId(req)],
      );
      return rows[0] ?? null;
    });

    if (!room) { res.status(404).json({ error: 'Room not found or not a member' }); return; }
    res.json({ data: room });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/messaging/rooms/:id ──────────────────────────────────────────

messagingRouter.delete('/rooms/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await withTenantSchema(tenantSlug(req), async (db) => {
      // Only owner or admin can delete
      const { rows: [membership] } = await db.query(
        `SELECT role FROM messaging_members WHERE room_id = $1 AND user_id = $2`,
        [req.params.id, userId(req)],
      );
      if (!membership) throw Object.assign(new Error('Not a member'), { status: 404 });
      if (membership.role !== 'owner' && req.user?.role !== 'admin') {
        throw Object.assign(new Error('Only the room owner can delete it'), { status: 403 });
      }
      await db.query(`DELETE FROM messaging_rooms WHERE id = $1`, [req.params.id]);
    });
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  }
});

// ── GET /api/messaging/rooms/:id/messages ─────────────────────────────────────

messagingRouter.get('/rooms/:id/messages', requireAuth, async (req: Request, res: Response) => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? 50), 10), 200);
  const before = req.query.before as string | undefined; // cursor: ISO timestamp

  try {
    const messages = await withTenantSchema(tenantSlug(req), async (db) => {
      // Verify membership
      const { rows: [m] } = await db.query(
        `SELECT 1 FROM messaging_members WHERE room_id = $1 AND user_id = $2`,
        [req.params.id, userId(req)],
      );
      if (!m) throw Object.assign(new Error('Not a member'), { status: 403 });

      const { rows } = await db.query(
        `SELECT id, room_id, sender_id, sender_name, event_type, content,
                relates_to AS "relates_to_id", is_redacted, created_at
         FROM messaging_events
         WHERE room_id = $1
           AND event_type = 'm.room.message'
           AND ($3::timestamptz IS NULL OR created_at < $3)
         ORDER BY created_at DESC
         LIMIT $2`,
        [req.params.id, limit, before ?? null],
      );
      return rows.reverse(); // oldest-first for display
    });
    res.json({ data: messages, limit });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  }
});

// ── POST /api/messaging/rooms/:id/messages ────────────────────────────────────
// REST fallback for send_message (socket path is preferred)

messagingRouter.post('/rooms/:id/messages', requireAuth, async (req: Request, res: Response) => {
  const parse = sendMessageSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { body, msgtype, relatesToId } = parse.data;
  const slug = tenantSlug(req);
  const uid  = userId(req);

  try {
    const event = await withTenantSchema(slug, async (db) => {
      const { rows: [m] } = await db.query(
        `SELECT 1 FROM messaging_members WHERE room_id = $1 AND user_id = $2`,
        [req.params.id, uid],
      );
      if (!m) throw Object.assign(new Error('Not a member'), { status: 403 });

      const { rows: [u] } = await db.query(`SELECT email FROM users WHERE id = $1`, [uid]);
      const content = { msgtype, body };

      const { rows: [evt] } = await db.query(
        `INSERT INTO messaging_events
           (room_id, sender_id, sender_name, event_type, content, relates_to)
         VALUES ($1, $2, $3, 'm.room.message', $4, $5)
         RETURNING id, room_id, sender_id, sender_name, event_type, content,
                   relates_to AS "relates_to_id", created_at`,
        [req.params.id, uid, u?.email ?? 'Unknown', JSON.stringify(content), relatesToId ?? null],
      );
      return evt;
    });

    const msgEvent = {
      id:          event.id,
      roomId:      event.room_id,
      senderId:    event.sender_id,
      senderName:  event.sender_name,
      eventType:   event.event_type,
      content:     event.content,
      relatesToId: event.relates_to_id,
      createdAt:   event.created_at,
    };

    // Broadcast via Socket.io if connected
    broadcastToRoom(slug, req.params.id, 'new_message', msgEvent);

    res.status(201).json({ data: msgEvent });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  }
});

// ── POST /api/messaging/rooms/:id/invite ─────────────────────────────────────

messagingRouter.post('/rooms/:id/invite', requireAuth, async (req: Request, res: Response) => {
  const parse = inviteSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  try {
    await withTenantSchema(tenantSlug(req), async (db) => {
      // Inviter must be owner or moderator
      const { rows: [self] } = await db.query(
        `SELECT role FROM messaging_members WHERE room_id = $1 AND user_id = $2`,
        [req.params.id, userId(req)],
      );
      if (!self) throw Object.assign(new Error('Not a member'), { status: 403 });
      if (!['owner', 'moderator'].includes(self.role)) {
        throw Object.assign(new Error('Only owners/moderators can invite'), { status: 403 });
      }

      await db.query(
        `INSERT INTO messaging_members (room_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, user_id) DO UPDATE SET role = $3`,
        [req.params.id, parse.data.userId, parse.data.role],
      );

      // Emit m.room.member event
      await db.query(
        `INSERT INTO messaging_events (room_id, sender_id, sender_name, event_type, content)
         VALUES ($1, $2, (SELECT email FROM users WHERE id = $2), 'm.room.member', $3)`,
        [req.params.id, userId(req), JSON.stringify({ membership: 'invite', invitee: parse.data.userId })],
      );
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  }
});

// ── POST /api/messaging/rooms/:id/leave ──────────────────────────────────────

messagingRouter.post('/rooms/:id/leave', requireAuth, async (req: Request, res: Response) => {
  try {
    await withTenantSchema(tenantSlug(req), async (db) => {
      const { rowCount } = await db.query(
        `DELETE FROM messaging_members WHERE room_id = $1 AND user_id = $2`,
        [req.params.id, userId(req)],
      );
      if (!rowCount) throw Object.assign(new Error('Not a member'), { status: 404 });

      await db.query(
        `INSERT INTO messaging_events (room_id, sender_id, sender_name, event_type, content)
         VALUES ($1, $2, (SELECT email FROM users WHERE id = $2), 'm.room.member', $3)`,
        [req.params.id, userId(req), JSON.stringify({ membership: 'leave' })],
      );
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  }
});

// ── PUT /api/messaging/rooms/:id/read ────────────────────────────────────────

messagingRouter.put('/rooms/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    await withTenantSchema(tenantSlug(req), async (db) => {
      await db.query(
        `UPDATE messaging_members SET last_read_at = now()
         WHERE room_id = $1 AND user_id = $2`,
        [req.params.id, userId(req)],
      );
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/messaging/rooms/:id/messages/:msgId — redact ─────────────────

messagingRouter.delete('/rooms/:id/messages/:msgId', requireAuth, async (req: Request, res: Response) => {
  const slug = tenantSlug(req);
  const uid  = userId(req);
  const role = req.user?.role;

  try {
    await withTenantSchema(slug, async (db) => {
      const { rows: [evt] } = await db.query(
        `SELECT sender_id FROM messaging_events WHERE id = $1 AND room_id = $2`,
        [req.params.msgId, req.params.id],
      );
      if (!evt) throw Object.assign(new Error('Message not found'), { status: 404 });

      const isOwner = evt.sender_id === uid;
      const isAdmin = role === 'admin';
      if (!isOwner && !isAdmin) {
        // Check if moderator of this room
        const { rows: [m] } = await db.query(
          `SELECT role FROM messaging_members WHERE room_id = $1 AND user_id = $2`,
          [req.params.id, uid],
        );
        if (!m || !['owner', 'moderator'].includes(m.role)) {
          throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
        }
      }

      await db.query(
        `UPDATE messaging_events
         SET is_redacted = true,
             content = '{"msgtype":"m.bad.encrypted","body":"[redacted]"}'::jsonb
         WHERE id = $1`,
        [req.params.msgId],
      );
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  }
});

// ── POST /api/messaging/support — anonymous customer starts support chat ──────
// No requireAuth — anonymous callers allowed.

messagingRouter.post('/support', async (req: Request, res: Response) => {
  const parse = supportSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const slug        = tenantSlug(req);
  const displayName = parse.data.displayName ?? 'Guest';
  const msgBody     = parse.data.message;

  if (!slug) { res.status(400).json({ error: 'Tenant slug required' }); return; }

  try {
    const result = await withTenantSchema(slug, async (db) => {
      // Create a new support room
      const { rows: [room] } = await db.query(
        `INSERT INTO messaging_rooms (name, topic, room_type, is_public)
         VALUES ($1, 'Customer support session', 'support', false)
         RETURNING id, name, room_type`,
        [`Support: ${displayName}`],
      );

      // Insert opening message
      const { rows: [evt] } = await db.query(
        `INSERT INTO messaging_events
           (room_id, sender_id, sender_name, event_type, content)
         VALUES ($1, NULL, $2, 'm.room.message', $3)
         RETURNING id, room_id, sender_id, sender_name, event_type, content, created_at`,
        [room.id, displayName, JSON.stringify({ msgtype: 'm.text', body: msgBody })],
      );

      return { room, event: evt };
    });

    // Notify any connected operators
    broadcastToRoom(slug, result.room.id, 'new_message', {
      id:          result.event.id,
      roomId:      result.event.room_id,
      senderId:    null,
      senderName:  displayName,
      eventType:   result.event.event_type,
      content:     result.event.content,
      relatesToId: null,
      createdAt:   result.event.created_at,
    });

    res.status(201).json({
      data: {
        roomId: result.room.id,
        name:   result.room.name,
      },
    });
  } catch (err) {
    console.error('[messaging] support create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
