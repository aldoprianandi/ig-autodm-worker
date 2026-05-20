CREATE TABLE admin_sessions (
  id_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  actor_key_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX admin_sessions_expires_idx
  ON admin_sessions (expires_at);

CREATE INDEX admin_sessions_actor_idx
  ON admin_sessions (actor_key_hash, last_seen_at DESC);
