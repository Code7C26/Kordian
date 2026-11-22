-- Cuantifica los puntos que sobreviven los filtros de escala del grafico.
-- Solo lectura. Ejecutar despues de audit_price_history_sources.sql.
WITH
stores(supermarket) AS (
  VALUES ('Mami'), ('Disco'), ('Carrefour')
),
offer_scope AS (
  SELECT
    offer.id AS offer_id,
    offer.product_id,
    offer.supermarket,
    offer.cash_price AS raw_current_price,
    product.name AS product_name,
    product.source AS product_source,
    product.source_product_id,
    CASE
      WHEN product.source = 'mami' AND offer.cash_price < 100 THEN offer.cash_price * 1000
      WHEN product.source = 'disco' AND offer.cash_price < 100 THEN offer.cash_price * 100
      ELSE offer.cash_price
    END AS normalized_current_price
  FROM public.offers offer
  JOIN stores ON stores.supermarket = offer.supermarket
  JOIN public.products product ON product.id = offer.product_id
),
history_values AS (
  SELECT
    offer.offer_id,
    offer.product_id,
    offer.supermarket,
    offer.product_name,
    offer.product_source,
    offer.source_product_id,
    offer.raw_current_price,
    offer.normalized_current_price,
    history.id AS history_id,
    history.cash_price AS raw_history_price,
    CASE
      WHEN offer.product_source = 'mami' AND history.cash_price < 100 THEN history.cash_price * 1000
      WHEN offer.product_source = 'disco' AND history.cash_price < 100 THEN history.cash_price * 100
      ELSE history.cash_price
    END AS normalized_history_price,
    history.observed_at,
    history.source AS history_source
  FROM offer_scope offer
  JOIN public.price_history history ON history.offer_id = offer.offer_id
),
history_ratios AS (
  SELECT
    history.*,
    history.normalized_history_price / nullif(history.normalized_current_price, 0) AS history_to_current_ratio
  FROM history_values history
),
classified_history AS (
  SELECT
    history.*,
    CASE
      WHEN history.history_source = 'price_token_normalization' THEN 'suppressed_token_normalization'
      WHEN history.history_to_current_ratio BETWEEN 95 AND 105
        OR history.history_to_current_ratio BETWEEN 1.0 / 105 AND 1.0 / 95
        OR history.history_to_current_ratio BETWEEN 950 AND 1050
        OR history.history_to_current_ratio BETWEEN 1.0 / 1050 AND 1.0 / 950
      THEN 'suppressed_scale_artifact'
      ELSE 'visible'
    END AS display_status
  FROM history_ratios history
),
latest_visible_history AS (
  SELECT DISTINCT ON (history.offer_id)
    history.*
  FROM classified_history history
  WHERE history.display_status = 'visible'
  ORDER BY history.offer_id, history.observed_at DESC, history.history_id DESC
),
offer_history_counts AS (
  SELECT
    history.offer_id,
    count(*) AS total_history_points,
    count(*) FILTER (WHERE history.display_status = 'suppressed_token_normalization') AS token_points_suppressed,
    count(*) FILTER (WHERE history.display_status = 'suppressed_scale_artifact') AS scale_points_suppressed,
    count(*) FILTER (WHERE history.display_status = 'visible') AS visible_history_points
  FROM classified_history history
  GROUP BY history.offer_id
),
store_summary AS (
  SELECT
    stores.supermarket,
    count(offer.offer_id) AS offer_count,
    count(offer.offer_id) FILTER (WHERE counts.offer_id IS NULL) AS offers_without_linked_history,
    count(offer.offer_id) FILTER (
      WHERE counts.offer_id IS NOT NULL AND coalesce(counts.visible_history_points, 0) = 0
    ) AS offers_without_visible_history,
    count(offer.offer_id) FILTER (
      WHERE latest.offer_id IS NOT NULL
        AND latest.normalized_history_price IS DISTINCT FROM offer.normalized_current_price
    ) AS latest_visible_price_mismatch_count,
    coalesce(sum(counts.total_history_points), 0) AS linked_history_points,
    coalesce(sum(counts.token_points_suppressed), 0) AS token_points_suppressed,
    coalesce(sum(counts.scale_points_suppressed), 0) AS scale_points_suppressed,
    coalesce(sum(counts.visible_history_points), 0) AS visible_history_points
  FROM stores
  LEFT JOIN offer_scope offer ON offer.supermarket = stores.supermarket
  LEFT JOIN offer_history_counts counts ON counts.offer_id = offer.offer_id
  LEFT JOIN latest_visible_history latest ON latest.offer_id = offer.offer_id
  GROUP BY stores.supermarket
),
ranked_visible_mismatches AS (
  SELECT
    latest.*,
    row_number() OVER (
      PARTITION BY latest.supermarket
      ORDER BY abs(latest.normalized_history_price / nullif(latest.normalized_current_price, 0) - 1) DESC,
        latest.offer_id
    ) AS sample_rank
  FROM latest_visible_history latest
  WHERE latest.normalized_history_price IS DISTINCT FROM latest.normalized_current_price
)
SELECT jsonb_pretty(jsonb_build_object(
  'display_integrity_by_store', (
    SELECT coalesce(
      jsonb_agg(to_jsonb(summary) ORDER BY summary.supermarket),
      '[]'::jsonb
    )
    FROM store_summary summary
  ),
  'latest_visible_price_mismatch_examples', (
    SELECT coalesce(
      jsonb_agg(to_jsonb(sample) ORDER BY sample.supermarket, sample.sample_rank),
      '[]'::jsonb
    )
    FROM (
      SELECT *
      FROM ranked_visible_mismatches
      WHERE sample_rank <= 20
    ) sample
  )
)) AS audit_report;
