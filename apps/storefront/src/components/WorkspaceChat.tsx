'use client';

/**
 * WorkspaceChat — real-time team messaging for authenticated operators.
 *
 * Renders:
 *   ├── Login gate (if no token stored)
 *   ├── Left sidebar: room list
 *   └── Right panel: message thread + input
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { decodeTokenPayload } from '@/lib/auth';
import {
  loginOperator, saveToken, loadToken, clearToken,
  fetchRooms, fetchMessages, markRead, getSocket, disconnectSocket,
  type Room, type MessageEvent,
} from '@/lib/messaging-client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString();
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginForm({ slug, onLogin }: { slug: string; onLogin: (token: string, email: string) => void }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await loginOperator(slug, email, password);
      saveToken(token);
      onLogin(token, user.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div
        className="w-full max-w-sm p-8 rounded-2xl"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <h2 className="text-xl font-bold mb-6 text-center" style={{ color: 'var(--color-text)' }}>
          Team Workspace Login
        </h2>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine }: { msg: MessageEvent; isMine: boolean }) {
  const body = (msg.content as any)?.body ?? '';
  if (msg.content && (msg.content as any).msgtype === 'm.bad.encrypted') {
    return (
      <div className="flex gap-2 items-start opacity-50">
        <div className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
          [message redacted]
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 items-end ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
      >
        {msg.senderName.charAt(0).toUpperCase()}
      </div>

      {/* Bubble */}
      <div className={`max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isMine && (
          <span className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>
            {msg.senderName}
          </span>
        )}
        <div
          className="px-3 py-2 rounded-2xl text-sm leading-relaxed"
          style={isMine ? {
            background: 'var(--color-primary)',
            color:      'var(--color-primary-fg)',
            borderBottomRightRadius: 4,
          } : {
            background: 'var(--color-surface)',
            color:      'var(--color-text)',
            border:     '1px solid var(--color-border)',
            borderBottomLeftRadius: 4,
          }}
        >
          {body}
        </div>
        <span className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator({ names }: { names: string[] }) {
  if (!names.length) return null;
  const label = names.length === 1
    ? `${names[0]} is typing…`
    : `${names.join(', ')} are typing…`;
  return (
    <p className="text-xs px-4 pb-1 italic" style={{ color: 'var(--color-text-muted)' }}>
      {label}
    </p>
  );
}

// ── Main WorkspaceChat component ──────────────────────────────────────────────

interface Props {
  slug: string;
}

export function WorkspaceChat({ slug }: Props) {
  const { token: authToken, user: authUser, isLoading: authLoading, login: authLogin, logout: authLogout } = useAuth();

  const [token,         setToken]         = useState<string | null>(null);
  const [myEmail,       setMyEmail]       = useState('');
  const [rooms,         setRooms]         = useState<Room[]>([]);
  const [activeRoom,    setActiveRoom]    = useState<Room | null>(null);
  const [messages,      setMessages]      = useState<MessageEvent[]>([]);
  const [typingNames,   setTypingNames]   = useState<string[]>([]);
  const [input,         setInput]         = useState('');
  const [sending,       setSending]       = useState(false);
  const [loadingRooms,  setLoadingRooms]  = useState(false);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);
  const [presence,      setPresence]      = useState<Record<string, 'online' | 'offline'>>({});

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync with AuthProvider (single sign-on) ────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (authToken) {
      setToken(authToken);
      if (authUser?.email) setMyEmail(authUser.email);
    } else {
      // Fallback: check workspace-specific stored token (direct access w/o dashboard)
      const stored = loadToken();
      if (stored) setToken(stored);
    }
  }, [authToken, authUser, authLoading]);

  // ── Connect socket + load rooms once we have a token ───────────────────────
  useEffect(() => {
    if (!token) return;

    setLoadingRooms(true);
    fetchRooms(slug, token).then((r) => {
      setRooms(r);
      if (r.length) setActiveRoom(r[0]);
      setLoadingRooms(false);
    });

    const socket = getSocket(slug, token);

    socket.once('connect', () => {
      socket.emit('join_rooms', (res: { ok: boolean }) => {
        if (!res.ok) console.warn('[workspace] join_rooms failed');
      });
    });

    socket.on('new_message', (msg: MessageEvent) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Update unread count if not in active room
      setRooms((prev) => prev.map((r) =>
        r.id === msg.roomId
          ? { ...r, unread_count: r.id === (activeRoom?.id) ? 0 : r.unread_count + 1 }
          : r,
      ));
    });

    socket.on('user_typing', ({ roomId, displayName }: { roomId: string; displayName: string }) => {
      if (roomId !== activeRoom?.id) return;
      setTypingNames((p) => p.includes(displayName) ? p : [...p, displayName]);
    });

    socket.on('user_stop_typing', ({ roomId, displayName }: { roomId: string; displayName: string }) => {
      if (roomId !== activeRoom?.id) return;
      setTypingNames((p) => p.filter((n) => n !== displayName));
    });

    socket.on('presence', ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
      setPresence((p) => ({ ...p, [userId]: status }));
    });

    return () => {
      socket.off('new_message');
      socket.off('user_typing');
      socket.off('user_stop_typing');
      socket.off('presence');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, slug]);

  // ── Load messages when active room changes ──────────────────────────────────
  useEffect(() => {
    if (!activeRoom || !token) return;
    setLoadingMsgs(true);
    setMessages([]);
    setTypingNames([]);
    fetchMessages(slug, activeRoom.id, token).then((msgs) => {
      setMessages(msgs);
      setLoadingMsgs(false);
      markRead(slug, activeRoom.id, token);
      // Reset unread count
      setRooms((prev) => prev.map((r) =>
        r.id === activeRoom.id ? { ...r, unread_count: 0 } : r,
      ));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.id]);

  // ── Scroll to bottom on new messages ───────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingNames]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const body = input.trim();
    if (!body || !activeRoom || sending) return;

    const socket = getSocket(slug, token ?? undefined);
    setSending(true);
    socket.emit(
      'send_message',
      { roomId: activeRoom.id, body },
      (res: { ok: boolean; event?: MessageEvent; error?: string }) => {
        setSending(false);
        if (res.ok && res.event) {
          setMessages((prev) =>
            prev.find((m) => m.id === res.event!.id) ? prev : [...prev, res.event!],
          );
        }
      },
    );
    setInput('');
  }, [input, activeRoom, sending, slug, token]);

  // ── Typing indicators ───────────────────────────────────────────────────────
  function handleInputChange(value: string) {
    setInput(value);
    if (!activeRoom) return;
    const socket = getSocket(slug, token ?? undefined);
    socket.emit('typing_start', { roomId: activeRoom.id });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing_stop', { roomId: activeRoom.id });
    }, 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleLogout() {
    clearToken();
    disconnectSocket();
    setToken(null);
    setRooms([]);
    setMessages([]);
    setActiveRoom(null);
    authLogout(); // Also clear main auth (single sign-out)
  }

  // ── Login gate ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    );
  }

  if (!token) {
    return (
      <LoginForm
        slug={slug}
        onLogin={(t, email) => {
          setToken(t);
          setMyEmail(email);
          // Sync with AuthProvider so dashboard also gets the session
          const decoded = decodeTokenPayload(t);
          if (decoded) authLogin(t, decoded);
        }}
      />
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full overflow-hidden rounded-xl"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col"
        style={{ borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
            # Workspace
          </span>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-xs opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ⏻
          </button>
        </div>

        {/* Room list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingRooms ? (
            <p className="px-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room)}
              className="w-full text-left px-4 py-1.5 flex items-center gap-2 transition-colors"
              style={{
                background:   room.id === activeRoom?.id ? 'var(--color-primary)' : 'transparent',
                color:        room.id === activeRoom?.id ? 'var(--color-primary-fg)' : 'var(--color-text)',
                borderRadius: 6,
              }}
            >
              <span className="flex-1 text-sm truncate">
                {room.room_type === 'direct' ? '@ ' : '# '}{room.name}
              </span>
              {room.unread_count > 0 && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--color-accent)', color: '#fff', minWidth: 18, textAlign: 'center' }}
                >
                  {room.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* My identity */}
        <div
          className="px-4 py-2 text-xs truncate"
          style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {myEmail || 'You'}
        </div>
      </aside>

      {/* ── Message panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeRoom ? (
          <>
            {/* Room header */}
            <div
              className="px-5 py-3 flex items-center gap-2 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                {activeRoom.room_type === 'direct' ? '@ ' : '# '}{activeRoom.name}
              </span>
              {activeRoom.topic && (
                <>
                  <span style={{ color: 'var(--color-border)' }}>·</span>
                  <span className="text-sm truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {activeRoom.topic}
                  </span>
                </>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loadingMsgs ? (
                <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No messages yet. Say hello! 👋
                </p>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const showDate = i === 0 || formatDate(messages[i - 1].createdAt) !== formatDate(msg.createdAt);
                    const isMine   = myEmail ? msg.senderName === myEmail : false;
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex items-center gap-2 my-3">
                            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                            <span className="text-xs px-2" style={{ color: 'var(--color-text-muted)' }}>
                              {formatDate(msg.createdAt)}
                            </span>
                            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                          </div>
                        )}
                        <MessageBubble msg={msg} isMine={isMine} />
                      </div>
                    );
                  })}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Typing indicator */}
            <TypingIndicator names={typingNames} />

            {/* Input */}
            <div
              className="px-4 py-3 flex gap-2 items-center flex-shrink-0"
              style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder={`Message #${activeRoom.name}`}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  border:     '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color:      'var(--color-text)',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
              >
                {sending ? '…' : '↑'}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Select a channel to start chatting
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
