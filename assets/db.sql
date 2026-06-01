CREATE TABLE IF NOT EXISTS sessions (
  user_id TEXT PRIMARY KEY,
  session_string TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  props_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_chats (
  telegram_id BIGINT PRIMARY KEY,
  group_title TEXT NOT NULL DEFAULT '',
  monitor_user_id BIGINT,
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_participant_count INTEGER,
  last_count_check_at TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_member_exports (
  id BIGSERIAL PRIMARY KEY,
  requested_by_user_id BIGINT NOT NULL,
  requested_by_username TEXT NOT NULL DEFAULT '',
  group_telegram_id BIGINT NOT NULL,
  group_title TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_member_exports_requested_by_idx
  ON group_member_exports (requested_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS group_member_exports_group_idx
  ON group_member_exports (group_telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_member_export_members (
  id BIGSERIAL PRIMARY KEY,
  export_id BIGINT NOT NULL REFERENCES group_member_exports(id) ON DELETE CASCADE,
  member_user_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  is_premium BOOLEAN,
  phone TEXT,
  still_in_gc BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_member_export_members_export_idx
  ON group_member_export_members (export_id);

-- Upgrades for databases created before live membership tracking.
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS group_title TEXT NOT NULL DEFAULT '';
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS monitor_user_id BIGINT;
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS last_participant_count INTEGER;
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS last_count_check_at TIMESTAMPTZ;
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ;

ALTER TABLE group_member_export_members ADD COLUMN IF NOT EXISTS still_in_gc BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS group_chats_sync_idx
  ON group_chats (sync_enabled, monitor_user_id)
  WHERE sync_enabled = TRUE AND monitor_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS group_chat_members (
  group_telegram_id BIGINT NOT NULL REFERENCES group_chats(telegram_id) ON DELETE CASCADE,
  member_user_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  is_premium BOOLEAN,
  phone TEXT,
  still_in_gc BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_in_gc_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_telegram_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS group_chat_members_group_still_in_idx
  ON group_chat_members (group_telegram_id, still_in_gc);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sessions_set_updated_at ON sessions;
CREATE TRIGGER sessions_set_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS group_chats_set_updated_at ON group_chats;
CREATE TRIGGER group_chats_set_updated_at
BEFORE UPDATE ON group_chats
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS group_chat_members_set_updated_at ON group_chat_members;
CREATE TRIGGER group_chat_members_set_updated_at
BEFORE UPDATE ON group_chat_members
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
