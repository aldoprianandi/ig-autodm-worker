CREATE INDEX deliveries_type_status_updated_idx
  ON deliveries (delivery_type, status, updated_at, campaign_id, ig_user_id);

CREATE INDEX contact_states_ig_user_updated_idx
  ON contact_states (ig_user_id, updated_at DESC, campaign_id, state);

CREATE INDEX campaigns_enabled_created_idx
  ON campaigns (enabled, created_at DESC);

CREATE INDEX webhook_events_processed_at_idx
  ON webhook_events (processed_at);

CREATE INDEX deliveries_created_at_idx
  ON deliveries (created_at);

CREATE INDEX contact_states_updated_at_idx
  ON contact_states (updated_at);

CREATE INDEX admin_rate_limits_window_start_idx
  ON admin_rate_limits (window_start);

CREATE TABLE instagram_tokens (
  id TEXT PRIMARY KEY,
  encrypted_token TEXT NOT NULL,
  iv TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  refreshed_at TEXT,
  refresh_after TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE operational_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX operational_events_created_idx
  ON operational_events (created_at DESC);

CREATE TABLE outbound_rate_limits (
  bucket TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX outbound_rate_limits_window_start_idx
  ON outbound_rate_limits (window_start);
