-- Chi Tiêu: initial schema. Timestamps are ISO-8601 UTC strings; every
-- day/week/month aggregation is done in application code using
-- Asia/Ho_Chi_Minh, not here.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL UNIQUE,
  username TEXT,
  name TEXT,
  reminder_enabled INTEGER NOT NULL DEFAULT 1,
  monthly_budget INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key TEXT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  keywords TEXT NOT NULL DEFAULT '[]',
  monthly_budget INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_fallback INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name)
);
CREATE INDEX idx_categories_user ON categories (user_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  category_id TEXT NOT NULL REFERENCES categories (id),
  note TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  source TEXT NOT NULL CHECK (source IN ('telegram', 'web', 'ios')),
  client_id TEXT NOT NULL,
  telegram_message_id INTEGER,
  telegram_reply_message_id INTEGER,
  item_index INTEGER NOT NULL DEFAULT 0,
  actual_synced_at TEXT,
  UNIQUE (user_id, client_id)
);
CREATE INDEX idx_transactions_user_occurred ON transactions (user_id, occurred_at);
CREATE INDEX idx_transactions_user_tg_message ON transactions (user_id, telegram_message_id);

CREATE TABLE keyword_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories (id),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, keyword)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  client TEXT NOT NULL CHECK (client IN ('web', 'ios')),
  device TEXT,
  last_used_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE pairing_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE notifications_sent (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  period TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, ref, period)
);
