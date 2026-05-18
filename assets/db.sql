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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_member_export_members_export_idx
  ON group_member_export_members (export_id);

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
