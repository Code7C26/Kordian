-- Auditoria de solo lectura para Mami, Disco y Carrefour.
-- Ejecutar en SQL Editor de la base usada por la aplicacion y compartir audit_report.
WITH
database_info AS (
  SELECT
    current_database() AS database_name,
    current_user AS executed_as,
    now() AS captured_at
),
expected_objects(object_kind, object_name, is_present) AS (
  VALUES
    ('table', 'public.offers', to_regclass('public.offers') IS NOT NULL),
    ('table', 'public.products', to_regclass('public.products') IS NOT NULL),
    ('table', 'public.price_history', to_regclass('public.price_history') IS NOT NULL),
    ('table', 'public.price_update_log', to_regclass('public.price_update_log') IS NOT NULL),
    ('table', 'public.carrefour_sync_state', to_regclass('public.carrefour_sync_state') IS NOT NULL),
    (
      'function',
      'public.apply_catalog_price_sync(text,text,jsonb,jsonb,jsonb)',
      to_regprocedure('public.apply_catalog_price_sync(text,text,jsonb,jsonb,jsonb)') IS NOT NULL
    ),
    (
      'function',
      'public.apply_catalog_price_promotion_sync(text,text,jsonb,jsonb,jsonb,jsonb)',
      to_regprocedure('public.apply_catalog_price_promotion_sync(text,text,jsonb,jsonb,jsonb,jsonb)') IS NOT NULL
    )
),
object_report AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('kind', object_kind, 'object', object_name, 'present', is_present)
      ORDER BY object_kind, object_name
    ),
    '[]'::jsonb
  ) AS value
  FROM expected_objects
),
stores(supermarket) AS (
  VALUES ('Mami'), ('Disco'), ('Carrefour')
),
store_offers AS (
  SELECT offer.id, offer.product_id, offer.supermarket, offer.cash_price
  FROM public.offers offer
  JOIN stores ON stores.supermarket = offer.supermarket
),
history_summary AS (
  SELECT
    history.offer_id,
    count(*) AS history_points,
    max(history.observed_at) AS latest_history_at
  FROM public.price_history history
  JOIN store_offers offer ON offer.id = history.offer_id
  GROUP BY history.offer_id
),
latest_history AS (
  SELECT DISTINCT ON (history.offer_id)
    history.offer_id,
    history.cash_price,
    history.observed_at,
    history.source
  FROM public.price_history history
  JOIN store_offers offer ON offer.id = history.offer_id
  ORDER BY history.offer_id, history.observed_at DESC, history.id DESC
),
store_health AS (
  SELECT
    stores.supermarket,
    count(offer.id) AS offer_count,
    count(offer.id) FILTER (WHERE offer.cash_price > 0) AS positive_price_count,
    count(offer.id) FILTER (WHERE summary.offer_id IS NOT NULL) AS offers_with_history,
    count(offer.id) FILTER (WHERE summary.offer_id IS NULL) AS offers_without_linked_history,
    count(offer.id) FILTER (
      WHERE latest.offer_id IS NOT NULL
        AND latest.cash_price IS DISTINCT FROM offer.cash_price
    ) AS latest_history_price_mismatch_count,
    max(summary.latest_history_at) AS latest_history_at
  FROM stores
  LEFT JOIN store_offers offer ON offer.supermarket = stores.supermarket
  LEFT JOIN history_summary summary ON summary.offer_id = offer.id
  LEFT JOIN latest_history latest ON latest.offer_id = offer.id
  GROUP BY stores.supermarket
),
store_health_report AS (
  SELECT coalesce(
    jsonb_agg(to_jsonb(health) ORDER BY health.supermarket),
    '[]'::jsonb
  ) AS value
  FROM store_health health
),
history_sources AS (
  SELECT
    offer.supermarket,
    history.source,
    count(*) AS history_points,
    count(DISTINCT history.offer_id) AS offers_with_points,
    max(history.observed_at) AS latest_observed_at
  FROM public.price_history history
  JOIN store_offers offer ON offer.id = history.offer_id
  GROUP BY offer.supermarket, history.source
),
history_source_report AS (
  SELECT coalesce(
    jsonb_agg(
      to_jsonb(source_row)
      ORDER BY source_row.supermarket, source_row.latest_observed_at DESC NULLS LAST, source_row.source
    ),
    '[]'::jsonb
  ) AS value
  FROM history_sources source_row
),
recent_logs AS (
  SELECT
    log.updated_at,
    log.filters ->> 'source' AS source,
    log.products_updated,
    CASE
      WHEN jsonb_typeof(log.changes) = 'array' THEN jsonb_array_length(log.changes)
      ELSE 0
    END AS change_rows,
    CASE
      WHEN jsonb_typeof(log.filters -> 'errors') = 'array' THEN jsonb_array_length(log.filters -> 'errors')
      ELSE 0
    END AS error_count,
    CASE
      WHEN jsonb_typeof(log.filters -> 'suspicious') = 'array' THEN jsonb_array_length(log.filters -> 'suspicious')
      ELSE 0
    END AS suspicious_count,
    CASE
      WHEN jsonb_typeof(log.filters -> 'unavailable') = 'array' THEN jsonb_array_length(log.filters -> 'unavailable')
      ELSE 0
    END AS unavailable_count
  FROM public.price_update_log log
  WHERE log.updated_at >= now() - interval '90 days'
    AND log.filters ->> 'source' IN (
      'mami_import', 'mami_price_repair',
      'disco_import', 'disco_public_search', 'disco_sync',
      'carrefour_import', 'carrefour_sync'
    )
),
log_summary AS (
  SELECT
    source,
    count(*) AS batches_last_90_days,
    sum(products_updated) AS products_updated_last_90_days,
    max(updated_at) AS latest_batch_at,
    sum(error_count) AS reported_errors_last_90_days,
    sum(suspicious_count) AS reported_suspicious_last_90_days,
    sum(unavailable_count) AS reported_unavailable_last_90_days
  FROM recent_logs
  GROUP BY source
),
log_summary_report AS (
  SELECT coalesce(
    jsonb_agg(to_jsonb(summary) ORDER BY summary.source),
    '[]'::jsonb
  ) AS value
  FROM log_summary summary
),
recent_log_report AS (
  SELECT coalesce(
    jsonb_agg(to_jsonb(recent) ORDER BY recent.updated_at DESC),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT *
    FROM recent_logs
    ORDER BY updated_at DESC
    LIMIT 30
  ) recent
),
carrefour_sync_state_report AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sync_key', sync_state.sync_key,
        'last_offer_id', sync_state.last_offer_id,
        'updated_at', sync_state.updated_at
      )
      ORDER BY sync_state.sync_key
    ),
    '[]'::jsonb
  ) AS value
  FROM public.carrefour_sync_state sync_state
)
SELECT jsonb_pretty(jsonb_build_object(
  'database', (SELECT to_jsonb(info) FROM database_info info),
  'objects', (SELECT value FROM object_report),
  'offer_and_history_health', (SELECT value FROM store_health_report),
  'price_history_by_store_and_source', (SELECT value FROM history_source_report),
  'price_update_logs_by_source_last_90_days', (SELECT value FROM log_summary_report),
  'recent_price_update_logs', (SELECT value FROM recent_log_report),
  'carrefour_sync_state', (SELECT value FROM carrefour_sync_state_report)
)) AS audit_report;
