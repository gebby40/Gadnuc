/**
 * Client-side messaging helpers.
 *
 * Socket.io is connected once per page session and shared via a module-level ref.
 * Re-exports the MessageEvent type for components.
 */

import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

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

export interface Room {
  id:           string;
  name:         string;
  topic:        string | null;
  room_type:    'channel' | 'direct' | 'support';
  is_public:    boolean;
  role:         string;
  last_read_at: string | null;
  unread_count: number;
  created_at:   string;
  updated_at:   string;
}

// ── Auth token helpers ────────────────────────────────────────────────────────

const TOKEN_KEY = 'gadnuc_access_token';

export function saveToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function loadToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

// ── Operator login ────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_INVENTORY_URL ?? 'http://localhost:3001';

export async function loginOperator(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
    body:    JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Login failed');
  }
  const body = await res.json();
  return { token: body.accessToken, user: body.user };
}

// ── REST messaging helpers ────────────────────────────────────────────────────

function headers(tenantSlug: string, token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type':  'application/json',
    'x-tenant-slug': tenantSlug,
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export async function fetchRooms(tenantSlug: string, token: string): Promise<Room[]> {
  const res = await fetch(`${API_BASE}/api/messaging/rooms`, {
    headers: headers(tenantSlug, token),
    cache:   'no-store',
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.data ?? [];
}

export async function fetchMessages(
  tenantSlug: string,
  roomId: string,
  token: string,
  before?: string,
): Promise<MessageEvent[]> {
  const qs = new URLSearchParams({ limit: '50' });
  if (before) qs.set('before', before);
  const res = await fetch(`${API_BASE}/api/messaging/rooms/${roomId}/messages?${qs}`, {
    headers: headers(tenantSlug, token),
    cache:   'no-store',
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.data ?? [];
}

export async function markRead(tenantSlug: string, roomId: string, token: string): Promise<void> {
  await fetch(`${API_BASE}/api/messaging/rooms/${roomId}/read`, {
    method:  'PUT',
    headers: headers(tenantSlug, token),
  }).catch(() => {/* non-critical */});
}

export async function startSupportRoom(
  tenantSlug: string,
  displayName: string,
  message: string,
): Promise<{ roomId: string; name: string }> {
  const res = await fetch(`${API_BASE}/api/messaging/support`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
    body:    JSON.stringify({ displayName, message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Could not start support chat');
  }
  const body = await res.json();
  return body.data;
}

// ── Socket.io connection ──────────────────────────────────────────────────────

let _socket: Socket | null = null;

export function getSocket(tenantSlug: string, token?: string, displayName?: string): Socket {
  if (_socket?.connected) return _socket;

  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }

  _socket = io(WS_URL, {
    path:       '/ws/messaging',
    transports: ['websocket', 'polling'],
    query:      { tenantSlug },
    auth: token
      ? { token }
      : { tenantSlug, displayName: displayName ?? 'Guest' },
    autoConnect: true,
  });

  return _socket;
}

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
}
