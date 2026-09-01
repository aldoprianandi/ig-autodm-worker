CREATE INDEX IF NOT EXISTS deliveries_recovery_status_updated_idx
  ON deliveries (status, updated_at, attempt_count, delivery_type);

CREATE INDEX IF NOT EXISTS webhook_events_recovery_comment_idx
  ON webhook_events (campaign_id, ig_user_id, event_type, processed_at DESC);
