CREATE INDEX IF NOT EXISTS message_variant_templates_enabled_kind_idx
  ON message_variant_templates (enabled, kind, updated_at DESC, text);
