BEGIN;

CREATE TABLE IF NOT EXISTS public.product_match_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_key text NOT NULL UNIQUE,
  source text NOT NULL,
  source_product_id text NOT NULL,
  source_sku text,
  local_product_id bigint REFERENCES public.products(id) ON DELETE CASCADE,
  decision_type text NOT NULL CHECK (decision_type IN ('match', 'no_match', 'no_comparable')),
  status text NOT NULL CHECK (status IN ('approved', 'rejected')),
  source_snapshot jsonb NOT NULL,
  local_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision_type = 'no_comparable' AND local_product_id IS NULL)
    OR (decision_type <> 'no_comparable' AND local_product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS product_match_review_decisions_source_product_idx
  ON public.product_match_review_decisions (source, source_product_id);

CREATE INDEX IF NOT EXISTS product_match_review_decisions_status_idx
  ON public.product_match_review_decisions (status, updated_at DESC);

ALTER TABLE public.product_match_review_decisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.product_match_review_decisions TO service_role;

COMMIT;
