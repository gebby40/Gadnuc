-- Migration 006: Per-tenant team messaging (Matrix-inspired)
-- Tables are added to the tenant_template schema and back-patched to all
-- existing tenant_* schemas via the DO $$ loop at the bottom.

-- ─── Messaging rooms ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_template.messaging_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  topic       TEXT,
  room_type   TEXT NOT NULL DEFAULT 'channel'
                CHECK (room_type IN ('channel', 'direct', 'support')),
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES tenant_template.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_rooms_type
  ON tenant_template.messaging_rooms(room_type);

-- ─── Room membership ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_template.messaging_members (
  room_id       UUID NOT NULL REFERENCES tenant_template.messaging_rooms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES tenant_template.users(id)           ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner', 'moderator', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at  TIMESTAMPTZ,                  -- for unread-count calculation
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_members_user
  ON tenant_template.messaging_members(user_id);

-- ─── Message events ──────────────────────────────────────────────────────────
-- Inspired by the Matrix protocol's room-event model.
CREATE TABLE IF NOT EXISTS tenant_template.messaging_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES tenant_template.messaging_rooms(id) ON DELETE CASCADE,
  sender_id    UUID REFERENCES tenant_template.users(id) ON DELETE SET NULL,
  sender_name  TEXT,                          -- cached display name (used for guest/support senders)
  event_type   TEXT NOT NULL DEFAULT 'm.room.message'
                 CHECK (event_type IN (
                   'm.room.message',          -- chat message
                   'm.room.create',           -- room created event
                   'm.room.member',           -- join / leave event
                   'm.room.topic',            -- topic changed
                   'm.room.redaction'         -- message redacted
                 )),
  content      JSONB NOT NULL DEFAULT '{}',  -- { msgtype, body } for messages
  relates_to   UUID REFERENCES tenant_template.messaging_events(id) ON DELETE SET NULL,
  is_redacted  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_events_room
  ON tenant_template.messaging_events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_events_sender
  ON tenant_template.messaging_events(sender_id);

-- ─── Patch existing tenant schemas ───────────────────────────────────────────
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.messaging_rooms (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
        topic      TEXT,
        room_type  TEXT NOT NULL DEFAULT %L
                     CHECK (room_type IN (''channel'', ''direct'', ''support'')),
        is_public  BOOLEAN NOT NULL DEFAULT false,
        created_by UUID REFERENCES %I.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )', s, 'channel', s);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.messaging_members (
        room_id      UUID NOT NULL REFERENCES %I.messaging_rooms(id) ON DELETE CASCADE,
        user_id      UUID NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
        role         TEXT NOT NULL DEFAULT ''member''
                       CHECK (role IN (''owner'', ''moderator'', ''member'')),
        joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_read_at TIMESTAMPTZ,
        PRIMARY KEY (room_id, user_id)
      )', s, s, s);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.messaging_events (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id     UUID NOT NULL REFERENCES %I.messaging_rooms(id) ON DELETE CASCADE,
        sender_id   UUID REFERENCES %I.users(id) ON DELETE SET NULL,
        sender_name TEXT,
        event_type  TEXT NOT NULL DEFAULT %L
                      CHECK (event_type IN (
                        %L, %L, %L, %L, %L
                      )),
        content     JSONB NOT NULL DEFAULT %L,
        relates_to  UUID REFERENCES %I.messaging_events(id) ON DELETE SET NULL,
        is_redacted BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )', s, s, s,
        'm.room.message',
        'm.room.message', 'm.room.create', 'm.room.member', 'm.room.topic', 'm.room.redaction',
        '{}',
      s);

    -- Create #general channel for this tenant
    EXECUTE format('
      INSERT INTO %I.messaging_rooms (name, topic, room_type, is_public)
      VALUES (''general'', ''General team discussion'', ''channel'', false)
      ON CONFLICT DO NOTHING
    ', s);

  END LOOP;
END
$$;
