BEGIN;

CREATE TABLE IF NOT EXISTS catalog_taxonomy_review_decisions (
  product_id bigint PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('resolved', 'dismissed')),
  admin_username text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_taxonomy_review_decisions_status_idx
  ON catalog_taxonomy_review_decisions (status, updated_at DESC);

ALTER TABLE catalog_taxonomy_review_decisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_taxonomy_review_decisions TO service_role;

COMMIT;
