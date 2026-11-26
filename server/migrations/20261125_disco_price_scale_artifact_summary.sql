BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_latest_offer_price_change(p_offer_id bigint)
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
    p.source AS product_source,
    public.catalog_normalize_offer_price(p.source, ph.cash_price) AS price,
    public.catalog_normalize_offer_price(p.source, o.cash_price) AS current_price,
    floor(ln(public.catalog_normalize_offer_price(p.source, ph.cash_price)) / ln(100))::integer AS price_bucket
  FROM public.price_history AS ph
  JOIN public.offers AS o ON o.id = ph.offer_id
  JOIN public.products AS p ON p.id = o.product_id
  WHERE ph.offer_id = p_offer_id
    AND ph.cash_price > 0
    AND ph.source <> 'price_token_normalization'
),
history_valid AS (
  SELECT current_point.*
  FROM history_raw AS current_point
  WHERE NOT (
    lower(btrim(coalesce(current_point.product_source, ''))) = 'disco'
    AND current_point.price > current_point.current_price
    AND current_point.price / nullif(current_point.current_price, 0) BETWEEN 85 AND 110
  )
  AND NOT EXISTS (
    SELECT 1
    FROM history_raw AS neighbor
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

REVOKE ALL ON FUNCTION public.catalog_latest_offer_price_change(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_latest_offer_price_change(bigint)
  TO service_role;

DO $backfill$
DECLARE
  offer_row record;
BEGIN
  FOR offer_row IN
    SELECT id FROM public.offers ORDER BY id
  LOOP
    PERFORM public.refresh_catalog_offer_price_summary(offer_row.id);
  END LOOP;
END;
$backfill$;

COMMIT;
