CREATE TABLE message_variant_templates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'comment_reply')),
  text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, text)
);

CREATE INDEX message_variant_templates_kind_idx
  ON message_variant_templates (kind, enabled, updated_at DESC);
