CREATE UNIQUE INDEX data_deletion_requests_confirmation_code_idx
  ON data_deletion_requests (confirmation_code)
  WHERE confirmation_code IS NOT NULL;
