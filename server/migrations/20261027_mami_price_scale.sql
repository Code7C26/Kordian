BEGIN;

CREATE OR REPLACE FUNCTION catalog_normalize_offer_price(p_source text, p_price numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_source, ''))) = 'mami' AND p_price > 0 AND p_price < 100
      THEN round(p_price * 1000, 2)
    WHEN lower(btrim(coalesce(p_source, ''))) = 'disco' AND p_price > 0 AND p_price < 100
      THEN round(p_price * 100, 2)
    ELSE p_price
  END;
$function$;

CREATE OR REPLACE FUNCTION catalog_latest_offer_price_change(p_offer_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH history_raw AS MATERIALIZED (
  SELECT
    ph.observed_at,
    ph.id,
    ph.source,
    catalog_normalize_offer_price(p.source, ph.cash_price) AS price,
    floor(ln(catalog_normalize_offer_price(p.source, ph.cash_price)) / ln(100))::integer AS price_bucket
  FROM price_history ph
  JOIN offers o ON o.id = ph.offer_id
  JOIN products p ON p.id = o.product_id
  WHERE ph.offer_id = p_offer_id
    AND ph.cash_price > 0
    AND ph.source <> 'price_token_normalization'
),
history_valid AS (
  SELECT current_point.*
  FROM history_raw current_point
  WHERE NOT EXISTS (
    SELECT 1
    FROM history_raw neighbor
    WHERE neighbor.id <> current_point.id
      AND neighbor.price_bucket BETWEEN current_point.price_bucket - 2 AND current_point.price_bucket + 2
      AND (
        abs(current_point.price / neighbor.price - 100) < 0.01
        OR abs(current_point.price / neighbor.price - 0.01) < 0.000001
      )
  )
),
history_ordered AS (
  SELECT
    history_valid.*,
    lag(price) OVER (ORDER BY observed_at, id) AS previous_price,
    row_number() OVER (ORDER BY observed_at DESC, id DESC) AS latest_rank
  FROM history_valid
)
SELECT CASE
  WHEN source IN ('disco_public_search', 'disco_sync', 'mami_import', 'mami_sync')
    AND previous_price > 0
    AND price <> previous_price
  THEN round(((price - previous_price) / previous_price) * 100, 2)
  ELSE NULL
END
FROM history_ordered
WHERE latest_rank = 1;
$function$;

CREATE OR REPLACE FUNCTION refresh_catalog_offer_price_summary(p_offer_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO catalog_offer_price_summary (
    offer_id, product_id, normalized_price, price_change_percentage, updated_at
  )
  SELECT
    o.id,
    o.product_id,
    catalog_normalize_offer_price(p.source, o.cash_price),
    catalog_latest_offer_price_change(o.id),
    now()
  FROM offers o
  JOIN products p ON p.id = o.product_id
  WHERE o.id = p_offer_id
  ON CONFLICT (offer_id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    normalized_price = EXCLUDED.normalized_price,
    price_change_percentage = EXCLUDED.price_change_percentage,
    updated_at = EXCLUDED.updated_at;

  IF NOT FOUND THEN
    DELETE FROM catalog_offer_price_summary WHERE offer_id = p_offer_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION catalog_normalize_offer_price(text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_latest_offer_price_change(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION refresh_catalog_offer_price_summary(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_latest_offer_price_change(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_catalog_offer_price_summary(bigint) TO service_role;

DO $backfill$
DECLARE
  offer_row record;
BEGIN
  FOR offer_row IN SELECT id FROM offers ORDER BY id LOOP
    PERFORM refresh_catalog_offer_price_summary(offer_row.id);
  END LOOP;
END;
$backfill$;

COMMIT;