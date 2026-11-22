-- Auditoria Carrefour de solo lectura.
-- Un unico SELECT devuelve todas las secciones dentro de la columna audit_report.
-- Ejecutar en SQL Editor de la base que usa la aplicacion y compartir el JSON completo.
WITH
database_info AS (
  SELECT
    current_database() AS database_name,
    current_user AS executed_as,
    current_schema() AS current_schema,
    now() AS captured_at
),
expected_objects(object_kind, object_name, is_present) AS (
  VALUES
    ('table', 'products', to_regclass('public.products') IS NOT NULL),
    ('table', 'offers', to_regclass('public.offers') IS NOT NULL),
    ('table', 'categories', to_regclass('public.categories') IS NOT NULL),
    ('table', 'subcategories', to_regclass('public.subcategories') IS NOT NULL),
    ('table', 'price_history', to_regclass('public.price_history') IS NOT NULL),
    ('table', 'price_update_log', to_regclass('public.price_update_log') IS NOT NULL),
    ('table', 'carrefour_sync_state', to_regclass('public.carrefour_sync_state') IS NOT NULL),
    ('table', 'catalog_offer_price_summary', to_regclass('public.catalog_offer_price_summary') IS NOT NULL),
    (
      'function',
      'catalog_products_page',
      to_regprocedure('public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)') IS NOT NULL
    )
),
object_report AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind', object_kind,
        'object', object_name,
        'present', is_present
      )
      ORDER BY object_kind, object_name
    ),
    '[]'::jsonb
  ) AS value
  FROM expected_objects
),
expected_columns(table_name, column_name) AS (
  VALUES
    ('products', 'source'),
    ('products', 'source_product_id'),
    ('products', 'source_sku'),
    ('products', 'source_url'),
    ('products', 'ean'),
    ('products', 'category_id'),
    ('products', 'subcategory_id'),
    ('products', 'image'),
    ('offers', 'product_id'),
    ('offers', 'supermarket'),
    ('offers', 'cash_price'),
    ('offers', 'list_price'),
    ('offers', 'source_product_id'),
    ('offers', 'source_sku'),
    ('offers', 'source_url'),
    ('price_history', 'source'),
    ('price_history', 'observed_at'),
    ('price_history', 'offer_id'),
    ('price_update_log', 'filters'),
    ('price_update_log', 'changes'),
    ('price_update_log', 'updated_at'),
    ('carrefour_sync_state', 'sync_key'),
    ('carrefour_sync_state', 'last_offer_id'),
    ('carrefour_sync_state', 'updated_at')
),
column_report AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table', expected_columns.table_name,
        'column', expected_columns.column_name,
        'present', actual.column_name IS NOT NULL
      )
      ORDER BY expected_columns.table_name, expected_columns.column_name
    ),
    '[]'::jsonb
  ) AS value
  FROM expected_columns
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'public'
    AND actual.table_name = expected_columns.table_name
    AND actual.column_name = expected_columns.column_name
),
availability_report AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table', table_name,
        'column', column_name,
        'type', data_type
      )
      ORDER BY table_name, column_name
    ),
    jsonb_build_array(
      jsonb_build_object(
        'table', 'products/offers',
        'column', '(sin campos de actividad/disponibilidad)',
        'present', false
      )
    )
  ) AS value
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('products', 'offers')
    AND column_name ~* '(active|availab|stock|visible|enabled|habilitad)'
),
carrefour_products AS (
  SELECT *
  FROM public.products
  WHERE lower(btrim(coalesce(source, ''))) = 'carrefour'
),
carrefour_offers AS (
  SELECT offer.*, to_jsonb(offer) AS offer_json
  FROM public.offers offer
  WHERE lower(btrim(coalesce(supermarket, ''))) = 'carrefour'
),
catalog_counts AS (
  SELECT jsonb_build_object(
    'products_with_source_carrefour',
      (SELECT count(*) FROM carrefour_products),
    'carrefour_offer_rows',
      (SELECT count(*) FROM carrefour_offers),
    'products_with_carrefour_offer',
      (SELECT count(DISTINCT product_id)
       FROM carrefour_offers
       WHERE product_id IS NOT NULL),
    'source_carrefour_products_with_carrefour_offer',
      (SELECT count(DISTINCT product.id)
       FROM carrefour_products product
       JOIN carrefour_offers offer ON offer.product_id = product.id),
    'source_carrefour_products_without_carrefour_offer',
      (SELECT count(*)
       FROM carrefour_products product
       WHERE NOT EXISTS (
         SELECT 1
         FROM carrefour_offers offer
         WHERE offer.product_id = product.id
       )),
    'carrefour_offers_linked_to_other_source_products',
      (SELECT count(DISTINCT offer.product_id)
       FROM carrefour_offers offer
       JOIN public.products product ON product.id = offer.product_id
       WHERE lower(btrim(coalesce(product.source, ''))) <> 'carrefour'),
    'carrefour_offers_without_product',
      (SELECT count(*)
       FROM carrefour_offers offer
       LEFT JOIN public.products product ON product.id = offer.product_id
       WHERE product.id IS NULL),
    'carrefour_offers_with_positive_price',
      (SELECT count(*)
       FROM carrefour_offers
       WHERE cash_price IS NOT NULL AND cash_price > 0),
    'carrefour_offers_without_positive_price',
      (SELECT count(*)
       FROM carrefour_offers
       WHERE cash_price IS NULL OR cash_price <= 0),
    'valid_products_returned_by_catalog_rpc_for_carrefour',
      (public.catalog_products_page(
        p_page => 1,
        p_limit => 1,
        p_supermarket => 'Carrefour',
        p_valid_only => true
      ) ->> 'total')::bigint
  ) AS value
),
source_category_rows AS (
  SELECT
    coalesce(category.name, '(sin categoria)') AS category,
    coalesce(subcategory.name, '(sin subcategoria)') AS subcategory,
    count(DISTINCT product.id) AS products,
    count(DISTINCT offer.id) AS carrefour_offers,
    count(DISTINCT product.id) FILTER (WHERE offer.id IS NOT NULL) AS products_with_carrefour_offer,
    count(DISTINCT product.id) FILTER (WHERE offer.cash_price > 0) AS products_with_positive_carrefour_price,
    count(DISTINCT product.id) FILTER (
      WHERE product.source_product_id IS NULL OR btrim(product.source_product_id) = ''
    ) AS products_missing_source_id
  FROM carrefour_products product
  LEFT JOIN public.categories category ON category.id = product.category_id
  LEFT JOIN public.subcategories subcategory ON subcategory.id = product.subcategory_id
  LEFT JOIN carrefour_offers offer ON offer.product_id = product.id
  GROUP BY category.name, subcategory.name
),
source_category_report AS (
  SELECT coalesce(
    jsonb_agg(to_jsonb(rows) ORDER BY rows.products DESC, rows.category, rows.subcategory),
    '[]'::jsonb
  ) AS value
  FROM source_category_rows rows
),
offer_category_rows AS (
  SELECT
    coalesce(category.name, '(sin categoria)') AS category,
    coalesce(subcategory.name, '(sin subcategoria)') AS subcategory,
    coalesce(nullif(btrim(product.source), ''), '(sin source)') AS product_source,
    count(DISTINCT product.id) AS products,
    count(offer.id) AS carrefour_offers,
    count(offer.id) FILTER (WHERE offer.cash_price > 0) AS offers_with_positive_price
  FROM carrefour_offers offer
  LEFT JOIN public.products product ON product.id = offer.product_id
  LEFT JOIN public.categories category ON category.id = product.category_id
  LEFT JOIN public.subcategories subcategory ON subcategory.id = product.subcategory_id
  GROUP BY category.name, subcategory.name, product.source
),
offer_category_report AS (
  SELECT coalesce(
    jsonb_agg(to_jsonb(rows) ORDER BY rows.carrefour_offers DESC, rows.category, rows.subcategory),
    '[]'::jsonb
  ) AS value
  FROM offer_category_rows rows
),
carrefour_ean_checks AS (
  SELECT
    product.id,
    ((10 - (sum(
      substring(btrim(product.ean) FROM digit.position FOR 1)::integer
      * CASE
          WHEN (length(btrim(product.ean)) - digit.position) % 2 = 1 THEN 3
          ELSE 1
        END
    ) % 10)) % 10) AS expected_check_digit,
    right(btrim(product.ean), 1)::integer AS actual_check_digit
  FROM carrefour_products product
  CROSS JOIN LATERAL generate_series(1, length(btrim(product.ean)) - 1) AS digit(position)
  WHERE btrim(product.ean) ~ '^([0-9]{8}|[0-9]{12,14})$'
  GROUP BY product.id, product.ean
),
anomaly_rows(issue, affected_rows) AS (
  SELECT 'products_missing_source_product_id', count(*)
  FROM carrefour_products
  WHERE source_product_id IS NULL OR btrim(source_product_id) = ''
  UNION ALL
  SELECT 'products_missing_ean', count(*)
  FROM carrefour_products
  WHERE ean IS NULL OR btrim(ean) = ''
  UNION ALL
  SELECT 'products_ean_bad_length_or_non_numeric', count(*)
  FROM carrefour_products
  WHERE ean IS NOT NULL
    AND btrim(ean) <> ''
    AND btrim(ean) !~ '^([0-9]{8}|[0-9]{12,14})$'
  UNION ALL
  SELECT 'products_ean_invalid_check_digit', count(*)
  FROM carrefour_ean_checks
  WHERE expected_check_digit <> actual_check_digit
  UNION ALL
  SELECT 'products_missing_category', count(*)
  FROM carrefour_products
  WHERE category_id IS NULL
  UNION ALL
  SELECT 'products_missing_subcategory', count(*)
  FROM carrefour_products
  WHERE subcategory_id IS NULL
  UNION ALL
  SELECT 'products_with_subcategory_from_other_category', count(*)
  FROM carrefour_products product
  JOIN public.subcategories subcategory ON subcategory.id = product.subcategory_id
  WHERE subcategory.category_id IS DISTINCT FROM product.category_id
  UNION ALL
  SELECT 'products_without_carrefour_offer', count(*)
  FROM carrefour_products product
  WHERE NOT EXISTS (
    SELECT 1
    FROM carrefour_offers offer
    WHERE offer.product_id = product.id
  )
  UNION ALL
  SELECT 'duplicate_carrefour_source_product_id_groups', count(*)
  FROM (
    SELECT source_product_id
    FROM carrefour_products
    WHERE source_product_id IS NOT NULL AND btrim(source_product_id) <> ''
    GROUP BY source_product_id
    HAVING count(*) > 1
  ) duplicates
  UNION ALL
  SELECT 'duplicate_carrefour_ean_groups', count(*)
  FROM (
    SELECT btrim(ean) AS ean
    FROM carrefour_products
    WHERE ean IS NOT NULL AND btrim(ean) <> ''
    GROUP BY btrim(ean)
    HAVING count(*) > 1
  ) duplicates
  UNION ALL
  SELECT 'duplicate_carrefour_offers_per_product', count(*)
  FROM (
    SELECT product_id
    FROM carrefour_offers
    WHERE product_id IS NOT NULL
    GROUP BY product_id
    HAVING count(*) > 1
  ) duplicates
  UNION ALL
  SELECT 'carrefour_offers_missing_source_product_id', count(*)
  FROM carrefour_offers
  WHERE coalesce(offer_json ->> 'source_product_id', '') = ''
  UNION ALL
  SELECT 'carrefour_offers_without_positive_price', count(*)
  FROM carrefour_offers
  WHERE cash_price IS NULL OR cash_price <= 0
  UNION ALL
  SELECT 'carrefour_offer_source_id_differs_from_product', count(*)
  FROM carrefour_offers offer
  JOIN public.products product ON product.id = offer.product_id
  WHERE lower(btrim(coalesce(product.source, ''))) = 'carrefour'
    AND coalesce(offer.offer_json ->> 'source_product_id', '') <> ''
    AND coalesce(product.source_product_id, '') <> (offer.offer_json ->> 'source_product_id')
),
anomaly_report AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('issue', issue, 'affected_rows', affected_rows)
      ORDER BY issue
    ),
    '[]'::jsonb
  ) AS value
  FROM anomaly_rows
),
sync_runs AS (
  SELECT
    updated_at,
    coalesce(products_updated, 0) AS products_updated,
    CASE WHEN jsonb_typeof(changes) = 'array'
      THEN jsonb_array_length(changes) ELSE 0 END AS changed_rows,
    CASE WHEN jsonb_typeof(filters -> 'unavailable') = 'array'
      THEN jsonb_array_length(filters -> 'unavailable') ELSE 0 END AS unavailable_count,
    CASE WHEN jsonb_typeof(filters -> 'suspicious') = 'array'
      THEN jsonb_array_length(filters -> 'suspicious') ELSE 0 END AS suspicious_count,
    CASE WHEN jsonb_typeof(filters -> 'identityMismatch') = 'array'
      THEN jsonb_array_length(filters -> 'identityMismatch') ELSE 0 END AS identity_mismatch_count,
    CASE WHEN jsonb_typeof(filters -> 'needsReview') = 'array'
      THEN jsonb_array_length(filters -> 'needsReview') ELSE 0 END AS needs_review_count,
    CASE WHEN jsonb_typeof(filters -> 'errors') = 'array'
      THEN jsonb_array_length(filters -> 'errors') ELSE 0 END AS error_count
  FROM public.price_update_log
  WHERE filters ->> 'source' = 'carrefour_sync'
),
recent_sync_report AS (
  SELECT coalesce(
    jsonb_agg(to_jsonb(recent) ORDER BY recent.updated_at DESC),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT *
    FROM sync_runs
    ORDER BY updated_at DESC
    LIMIT 50
  ) recent
),
latest_sync_log AS (
  SELECT *
  FROM sync_runs
  ORDER BY updated_at DESC
  LIMIT 1
),
daily_sync_state AS (
  SELECT sync_key, last_offer_id, updated_at
  FROM public.carrefour_sync_state
  WHERE sync_key = 'daily'
  LIMIT 1
),
sync_summary AS (
  SELECT jsonb_build_object(
    'latest_sync_log_at', latest_sync_log.updated_at,
    'products_updated_in_latest_logged_batch', coalesce(latest_sync_log.products_updated, 0),
    'latest_logged_change_rows', coalesce(latest_sync_log.changed_rows, 0),
    'latest_unavailable_count', coalesce(latest_sync_log.unavailable_count, 0),
    'latest_suspicious_count', coalesce(latest_sync_log.suspicious_count, 0),
    'latest_identity_mismatch_count', coalesce(latest_sync_log.identity_mismatch_count, 0),
    'latest_needs_review_count', coalesce(latest_sync_log.needs_review_count, 0),
    'latest_error_count', coalesce(latest_sync_log.error_count, 0),
    'sync_cursor_last_offer_id', daily_sync_state.last_offer_id,
    'sync_cursor_updated_at', daily_sync_state.updated_at,
    'current_carrefour_offer_rows',
      (SELECT count(*) FROM carrefour_offers),
    'logged_sync_batches',
      (SELECT count(*) FROM public.price_update_log
       WHERE filters ->> 'source' = 'carrefour_sync'),
    'latest_carrefour_sync_price_change_at',
      (SELECT max(observed_at) FROM public.price_history WHERE source = 'carrefour_sync')
  ) AS value
  FROM (SELECT 1) anchor
  LEFT JOIN latest_sync_log ON true
  LEFT JOIN daily_sync_state ON true
),
history_rows AS (
  SELECT
    history.source,
    count(*) AS history_rows,
    max(history.observed_at) AS latest_observed_at,
    count(DISTINCT history.product_id) AS products_with_history
  FROM public.price_history history
  JOIN public.offers offer ON offer.id = history.offer_id
  WHERE lower(btrim(coalesce(offer.supermarket, ''))) = 'carrefour'
  GROUP BY history.source
),
history_report AS (
  SELECT coalesce(
    jsonb_agg(to_jsonb(rows) ORDER BY rows.latest_observed_at DESC NULLS LAST, rows.source),
    '[]'::jsonb
  ) AS value
  FROM history_rows rows
)
SELECT jsonb_pretty(jsonb_build_object(
  'database', (SELECT to_jsonb(info) FROM database_info info),
  'objects', (SELECT value FROM object_report),
  'expected_columns', (SELECT value FROM column_report),
  'availability_fields', (SELECT value FROM availability_report),
  'catalog_counts', (SELECT value FROM catalog_counts),
  'source_carrefour_by_category', (SELECT value FROM source_category_report),
  'all_carrefour_offers_by_category_and_product_source', (SELECT value FROM offer_category_report),
  'anomalies', (SELECT value FROM anomaly_report),
  'recent_sync_runs', (SELECT value FROM recent_sync_report),
  'sync_summary', (SELECT value FROM sync_summary),
  'price_history_by_source', (SELECT value FROM history_report)
)) AS audit_report;
