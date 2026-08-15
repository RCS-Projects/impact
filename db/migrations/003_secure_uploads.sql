ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS claim_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer;

CREATE INDEX IF NOT EXISTS uploads_claim_idx ON uploads (claim_hash, expires_at);
