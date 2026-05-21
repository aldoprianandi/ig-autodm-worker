CREATE TABLE data_deletion_requests (
  request_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX data_deletion_requests_created_idx
  ON data_deletion_requests (created_at);
