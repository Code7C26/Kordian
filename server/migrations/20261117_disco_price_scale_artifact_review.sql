BEGIN;

SET LOCAL lock_timeout = '3s';

DO $preflight$
DECLARE
  v_missing_columns text;
BEGIN
  WITH required_columns(table_name, column_name) AS (
    VALUES
      ('price_history', 'id'),
      ('price_history', 'product_id'),
      ('price_history', 'offer_id'),
      ('price_history', 'observed_at'),
      ('price_history', 'cash_price'),
      ('price_history', 'source'),
      ('products', 'id'),
      ('products', 'name'),
      ('products', 'ean'),
      ('products', 'source'),
      ('offers', 'id'),
      ('offers', 'product_id'),
      ('offers', 'supermarket')
  )
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO v_missing_columns
  FROM required_columns AS required
  LEFT JOIN information_schema.columns AS columns
    ON columns.table_schema = 'public'
    AND columns.table_name = required.table_name
    AND columns.column_name = required.column_name
  WHERE columns.column_name IS NULL;

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply price scale review migration; missing columns: %', v_missing_columns;
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.price_history_scale_artifact_reviews (
  price_history_id uuid PRIMARY KEY,
  reference_history_id uuid NOT NULL,
  product_id bigint NOT NULL,
  offer_id bigint NOT NULL,
  product_name text,
  product_ean text,
  token_price numeric NOT NULL CHECK (token_price > 0),
  reference_price numeric NOT NULL CHECK (reference_price > 0),
  normalized_token_price numeric NOT NULL CHECK (normalized_token_price > 0),
  normalized_reference_price numeric NOT NULL CHECK (normalized_reference_price > 0),
  scale_ratio numeric NOT NULL CHECK (scale_ratio BETWEEN 90 AND 110),
  observed_at timestamptz NOT NULL,
  reference_observed_at timestamptz NOT NULL,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'confirmed', 'rejected')),
  rule_version text NOT NULL DEFAULT 'disco-price-scale-v1',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  review_note text
);

CREATE INDEX IF NOT EXISTS price_history_scale_artifact_reviews_pending_idx
  ON public.price_history_scale_artifact_reviews (recorded_at, product_id)
  WHERE decision = 'pending';

ALTER TABLE public.price_history_scale_artifact_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.price_history_scale_artifact_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.price_history_scale_artifact_reviews TO service_role;

DROP POLICY IF EXISTS price_history_scale_artifact_reviews_service_role
  ON public.price_history_scale_artifact_reviews;
CREATE POLICY price_history_scale_artifact_reviews_service_role
  ON public.price_history_scale_artifact_reviews
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

WITH source_pairs AS (
  SELECT
    token.id AS price_history_id,
    reference.id AS reference_history_id,
    token.product_id,
    token.offer_id,
    product.name AS product_name,
    product.ean AS product_ean,
    token.cash_price AS token_price,
    reference.cash_price AS reference_price,
    CASE
      WHEN product.source = 'mami' AND token.cash_price < 100
        THEN round(token.cash_price * 1000, 2)
      WHEN product.source = 'disco' AND token.cash_price < 100
        THEN round(token.cash_price * 100, 2)
      ELSE token.cash_price
    END AS normalized_token_price,
    CASE
      WHEN product.source = 'mami' AND reference.cash_price < 100
        THEN round(reference.cash_price * 1000, 2)
      WHEN product.source = 'disco' AND reference.cash_price < 100
        THEN round(reference.cash_price * 100, 2)
      ELSE reference.cash_price
    END AS normalized_reference_price,
    token.observed_at,
    reference.observed_at AS reference_observed_at,
    abs(extract(epoch FROM token.observed_at - reference.observed_at)) AS age_seconds
  FROM public.price_history AS token
  JOIN public.price_history AS reference
    ON reference.offer_id = token.offer_id
    AND reference.source = 'disco_public_search'
    AND reference.observed_at BETWEEN token.observed_at - interval '30 days'
                                  AND token.observed_at + interval '30 days'
    AND reference.product_id = token.product_id
  JOIN public.products AS product
    ON product.id = token.product_id
  JOIN public.offers AS offer
    ON offer.id = token.offer_id
    AND offer.product_id = token.product_id
    AND offer.supermarket = 'Disco'
  WHERE token.source = 'price_token_normalization'
    AND token.offer_id IS NOT NULL
    AND token.cash_price > 0
    AND reference.cash_price > 0
),
candidates AS (
  SELECT
    source_pairs.*,
    greatest(normalized_token_price, normalized_reference_price)
      / nullif(least(normalized_token_price, normalized_reference_price), 0) AS scale_ratio
  FROM source_pairs
  WHERE normalized_token_price > 0
    AND normalized_reference_price > 0
),
nearest_reference AS (
  SELECT DISTINCT ON (price_history_id)
    price_history_id,
    reference_history_id,
    product_id,
    offer_id,
    product_name,
    product_ean,
    token_price,
    reference_price,
    normalized_token_price,
    normalized_reference_price,
    scale_ratio,
    observed_at,
    reference_observed_at
  FROM candidates
  WHERE scale_ratio BETWEEN 90 AND 110
  ORDER BY price_history_id, age_seconds, reference_history_id
)
INSERT INTO public.price_history_scale_artifact_reviews (
  price_history_id,
  reference_history_id,
  product_id,
  offer_id,
  product_name,
  product_ean,
  token_price,
  reference_price,
  normalized_token_price,
  normalized_reference_price,
  scale_ratio,
  observed_at,
  reference_observed_at
)
SELECT
  price_history_id,
  reference_history_id,
  product_id,
  offer_id,
  product_name,
  product_ean,
  token_price,
  reference_price,
  normalized_token_price,
  normalized_reference_price,
  scale_ratio,
  observed_at,
  reference_observed_at
FROM nearest_reference
ON CONFLICT (price_history_id) DO NOTHING;

COMMIT;
