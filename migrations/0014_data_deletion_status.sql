ALTER TABLE data_deletion_requests ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE data_deletion_requests ADD COLUMN confirmation_code TEXT;
ALTER TABLE data_deletion_requests ADD COLUMN completed_at TEXT;
ALTER TABLE data_deletion_requests ADD COLUMN updated_at TEXT;

UPDATE data_deletion_requests
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE INDEX data_deletion_requests_status_updated_idx
  ON data_deletion_requests (status, updated_at);

