'use client';

/**
 * MessagingWidget — floating support chat for anonymous customers.
 *
 * States:
 *   closed   → just the FAB button
 *   open     → pre-chat form (name + first message) or active chat thread
 *   chatting → live support room with Socket.io
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { startSupportRoom, getSocket, type MessageEvent } from '@/lib/messaging-client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Bubble ────────────────────────────────────────────────────────────────────

function SupportBubble({ msg, isGuest }: { msg: MessageEvent; isGuest: boolean }) {
  const body = (msg.content as any)?.body ?? '';
  return (
    <div className={`flex gap-2 items-end ${isGuest ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        style={isGuest
          ? { background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }
          : { background: 'var(--color-accent)', color: '#fff' }
        }
      >
        {isGuest ? 'Y' : msg.senderName.charAt(0).toUpperCase()}
      </div>
      <div className={`max-w-[75%] flex flex-col gap-0.5 ${isGuest ? 'items-end' : 'items-start'}`}>
        {!isGuest && (
          <span className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>
            {msg.senderName} · Support
          </span>
        )}
        <div
          className="px-3 py-2 rounded-2xl text-sm leading-relaxed"
          style={isGuest ? {
            background:            'var(--color-primary)',
            color:                 'var(--color-primary-fg)',
            borderBottomRightRadius: 4,
          } : {
            background:           'var(--color-surface)',
            color:                'var(--color-text)',
            border:               '1px solid var(--color-border)',
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

// ── Main widget ───────────────────────────────────────────────────────────────

interface Props {
  slug: string;
  /** Customise button text */
  buttonLabel?: string;
  /** Customise bot name shown to customer */
  supportName?: string;
}

export function MessagingWidget({ slug, buttonLabel = 'Support', supportName = 'Support' }: Props) {
  const [open,        setOpen]        = useState(false);
  const [phase,       setPhase]       = useState<'form' | 'chatting'>('form');
  const [displayName, setDisplayName] = useState('');
  const [firstMsg,    setFirstMsg]    = useState('');
  const [starting,    setStarting]    = useState(false);
  const [roomId,      setRoomId]      = useState<string | null>(null);
  const [messages,    setMessages]    = useState<MessageEvent[]>([]);
  const [input,       setInput]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [typingAgent, setTypingAgent] = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingAgent]);

  // ── Socket events once in a room ─────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const socket = getSocket(slug, undefined, displayName);

    socket.on('new_message', (msg: MessageEvent) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]);
    });

    socket.on('user_typing', ({ roomId: rId }: { roomId: string }) => {
      if (rId === roomId) setTypingAgent(true);
    });

    socket.on('user_stop_typing', ({ roomId: rId }: { roomId: string }) => {
      if (rId === roomId) setTypingAgent(false);
    });

    return () => {
      socket.off('new_message');
      socket.off('user_typing');
      socket.off('user_stop_typing');
    };
  }, [roomId, slug, displayName]);

  // ── Start support session ───────────────────────────────────────────────────
  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!firstMsg.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const guestName = displayName.trim() || 'Guest';
      const { roomId: rid } = await startSupportRoom(slug, guestName, firstMsg.trim());
      setRoomId(rid);

      // Join the room via socket
      const socket = getSocket(slug, undefined, guestName);
      socket.emit('join_support_room', { roomId: rid }, (res: { ok: boolean }) => {
        if (!res.ok) console.warn('[widget] join_support_room failed');
      });

      // Seed local messages with the first message
      setMessages([{
        id:          'local-1',
        roomId:      rid,
        senderId:    null,
        senderName:  guestName,
        eventType:   'm.room.message',
        content:     { msgtype: 'm.text', body: firstMsg.trim() },
        relatesToId: null,
        createdAt:   new Date().toISOString(),
      }]);

      setPhase('chatting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start support chat');
    } finally {
      setStarting(false);
    }
  }

  // ── Send follow-up messages ─────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const body = input.trim();
    if (!body || !roomId || sending) return;

    const guestName = displayName.trim() || 'Guest';
    const socket = getSocket(slug, undefined, guestName);
    setSending(true);
    socket.emit(
      'send_message',
      { roomId, body },
      (res: { ok: boolean; event?: MessageEvent }) => {
        setSending(false);
        if (res.ok && res.event) {
          setMessages((prev) => prev.find((m) => m.id === res.event!.id) ? prev : [...prev, res.event!]);
        }
      },
    );
    setInput('');
  }, [input, roomId, sending, slug, displayName]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="flex flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            width:       360,
            height:      520,
            background:  'var(--color-bg)',
            border:      '1px solid var(--color-border)',
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between flex-shrink-0"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="font-semibold text-sm">{supportName} Chat</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-lg leading-none opacity-80 hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>

          {/* Body */}
          {phase === 'form' ? (
            /* Pre-chat form */
            <form onSubmit={handleStart} className="flex flex-col flex-1 overflow-y-auto p-5 gap-4">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Hi there! Fill in your details and we&apos;ll connect you with our team.
              </p>

              {error && (
                <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                  {error}
                </div>
              )}

              <input
                type="text"
                placeholder="Your name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
              />

              <textarea
                placeholder="How can we help you today?"
                value={firstMsg}
                onChange={(e) => setFirstMsg(e.target.value)}
                required
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
              />

              <button
                type="submit"
                disabled={starting || !firstMsg.trim()}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-60"
                style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
              >
                {starting ? 'Starting chat…' : 'Start Chat'}
              </button>
            </form>
          ) : (
            /* Active chat */
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.map((msg) => (
                  <SupportBubble
                    key={msg.id}
                    msg={msg}
                    isGuest={msg.senderId === null && msg.senderName === (displayName.trim() || 'Guest')}
                  />
                ))}
                {typingAgent && (
                  <div className="flex gap-2 items-center">
                    <div
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}
                    >
                      S
                    </div>
                    <span className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
                      Support is typing…
                    </span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div
                className="px-3 py-3 flex gap-2 items-center flex-shrink-0"
                style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type a message…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
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
                  className="px-3 py-2 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
                >
                  {sending ? '…' : '↑'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FAB button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
      >
        <span>{open ? '×' : '💬'}</span>
        <span>{open ? 'Close' : buttonLabel}</span>
      </button>
    </div>
  );
}
