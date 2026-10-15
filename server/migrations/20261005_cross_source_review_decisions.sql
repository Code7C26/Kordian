BEGIN;

CREATE TABLE IF NOT EXISTS cross_source_review_decisions (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null unique,
  source text not null default 'cross_source',
  mami_product_id bigint,
  disco_product_id bigint,
  status text not null check (status in ('match', 'no_match', 'revisión')),
  reason_codes jsonb not null default '[]'::jsonb,
  confidence text not null default 'media',
  evidence jsonb not null default '{}'::jsonb,
  admin_username text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS cross_source_review_decisions_status_idx
  ON cross_source_review_decisions (status);

CREATE INDEX IF NOT EXISTS cross_source_review_decisions_updated_idx
  ON cross_source_review_decisions (updated_at desc);

ALTER TABLE cross_source_review_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cross_source_review_decisions_read ON cross_source_review_decisions;
CREATE POLICY cross_source_review_decisions_read
  ON cross_source_review_decisions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS cross_source_review_decisions_insert ON cross_source_review_decisions;
CREATE POLICY cross_source_review_decisions_insert
  ON cross_source_review_decisions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS cross_source_review_decisions_update ON cross_source_review_decisions;
CREATE POLICY cross_source_review_decisions_update
  ON cross_source_review_decisions
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS cross_source_review_decisions_delete ON cross_source_review_decisions;
CREATE POLICY cross_source_review_decisions_delete
  ON cross_source_review_decisions
  FOR DELETE TO anon, authenticated
  USING (true);

COMMIT;
