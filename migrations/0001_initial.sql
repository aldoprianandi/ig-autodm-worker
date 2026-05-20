CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  media_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  opening_text TEXT NOT NULL,
  button_title TEXT NOT NULL,
  button_payload TEXT NOT NULL,
  delivery_text TEXT NOT NULL,
  follow_gate_enabled INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX campaigns_media_enabled_idx ON campaigns (media_id, enabled);

CREATE TABLE contact_states (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  ig_user_id TEXT NOT NULL,
  username TEXT,
  state TEXT NOT NULL,
  last_comment_id TEXT,
  last_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, ig_user_id)
);

CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  campaign_id TEXT,
  ig_user_id TEXT,
  raw_hash TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  ig_user_id TEXT NOT NULL,
  delivery_type TEXT NOT NULL,
  status TEXT NOT NULL,
  meta_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, ig_user_id, delivery_type)
);
