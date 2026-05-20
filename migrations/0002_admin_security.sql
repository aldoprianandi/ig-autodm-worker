CREATE TABLE admin_rate_limits (
  key_hash TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key_hash, window_start)
);

CREATE TABLE admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_key_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  action TEXT NOT NULL,
  status INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX admin_audit_logs_created_idx ON admin_audit_logs (created_at DESC);
