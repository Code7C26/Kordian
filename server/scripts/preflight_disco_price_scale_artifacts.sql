-- Read-only preflight for price-token scale-artifact candidates.
-- Returns one result set: a summary row, one row per candidate to register,
-- and any identity-conflict rows. The migration selects the nearest clean
-- public-search reference for each token history row.
BEGIN TRANSACTION READ ONLY;

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
),
column_status AS (
  SELECT
    required.table_name,
    required.column_name,
    columns.data_type,
    columns.column_name IS NOT NULL AS present
  FROM required_columns AS required
  LEFT JOIN information_schema.columns AS columns
    ON columns.table_schema = 'public'
    AND columns.table_name = required.table_name
    AND columns.column_name = required.column_name
),
environment AS (
  SELECT
    current_database() AS database_name,
    current_user AS executed_as,
    to_regclass('public.price_history') IS NOT NULL AS price_history_exists,
    to_regclass('public.products') IS NOT NULL AS products_exists,
    to_regclass('public.offers') IS NOT NULL AS offers_exists,
    to_regclass('public.price_history_scale_artifact_reviews') IS NOT NULL AS review_table_exists,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS service_role_exists
),
schema_summary AS (
  SELECT
    bool_and(present) AS schema_ready,
    coalesce(
      array_agg(table_name || '.' || column_name ORDER BY table_name, column_name)
        FILTER (WHERE NOT present),
      ARRAY[]::text[]
    ) AS missing_columns,
    coalesce(
      jsonb_agg(jsonb_build_object(
        'table', table_name,
        'column', column_name,
        'data_type', data_type,
        'present', present
      ) ORDER BY table_name, column_name),
      '[]'::jsonb
    ) AS required_column_status
  FROM column_status
),
source_pairs AS (
  SELECT
    token.id AS price_history_id,
    reference.id AS reference_history_id,
    token.product_id,
    reference.product_id AS reference_product_id,
    token.offer_id,
    offer.product_id AS offer_product_id,
    offer.supermarket,
    token_product.id AS token_product_id,
    reference_product.id AS reference_product_id_found,
    token.source AS token_source,
    reference.source AS reference_source,
    token.observed_at,
    reference.observed_at AS reference_observed_at,
    token.cash_price AS token_price,
    reference.cash_price AS reference_price,
    token_product.name AS token_product_name,
    reference_product.name AS reference_product_name,
    token_product.ean AS token_ean,
    reference_product.ean AS reference_ean,
    CASE
      WHEN token_product.source = 'mami' AND token.cash_price < 100
        THEN round(token.cash_price * 1000, 2)
      WHEN token_product.source = 'disco' AND token.cash_price < 100
        THEN round(token.cash_price * 100, 2)
      ELSE token.cash_price
    END AS normalized_token_price,
    CASE
      WHEN reference_product.source = 'mami' AND reference.cash_price < 100
        THEN round(reference.cash_price * 1000, 2)
      WHEN reference_product.source = 'disco' AND reference.cash_price < 100
        THEN round(reference.cash_price * 100, 2)
      ELSE reference.cash_price
    END AS normalized_reference_price
  FROM public.price_history AS token
  JOIN public.price_history AS reference
    ON reference.offer_id = token.offer_id
    AND reference.source = 'disco_public_search'
    AND reference.observed_at BETWEEN token.observed_at - interval '30 days'
                                  AND token.observed_at + interval '30 days'
  LEFT JOIN public.offers AS offer
    ON offer.id = token.offer_id
  LEFT JOIN public.products AS token_product
    ON token_product.id = token.product_id
  LEFT JOIN public.products AS reference_product
    ON reference_product.id = reference.product_id
  WHERE token.source = 'price_token_normalization'
    AND token.offer_id IS NOT NULL
    AND token.cash_price > 0
    AND reference.cash_price > 0
),
classified_pairs AS (
  SELECT
    source_pairs.*,
    greatest(normalized_token_price, normalized_reference_price)
      / nullif(least(normalized_token_price, normalized_reference_price), 0) AS scale_ratio,
    abs(extract(epoch FROM observed_at - reference_observed_at)) AS age_seconds,
    nullif(concat_ws(
      ', ',
      CASE WHEN token_product_id IS NULL THEN 'token product is missing' END,
      CASE WHEN reference_product_id_found IS NULL THEN 'reference product is missing' END,
      CASE WHEN product_id IS DISTINCT FROM reference_product_id
        THEN 'history rows have different product_id' END,
      CASE WHEN offer_product_id IS DISTINCT FROM product_id
        THEN 'offer product_id differs from token history' END,
      CASE WHEN offer_product_id IS DISTINCT FROM reference_product_id
        THEN 'offer product_id differs from reference history' END,
      CASE WHEN token_ean IS NOT NULL AND reference_ean IS NOT NULL AND token_ean <> reference_ean
        THEN 'product EANs differ' END,
      CASE WHEN supermarket IS DISTINCT FROM 'Disco'
        THEN 'offer is not assigned to Disco' END
    ), '') AS identity_conflict,
    CASE
      WHEN token_ean IS NULL OR btrim(token_ean) = '' THEN 'missing'
      WHEN btrim(token_ean) !~ '(^[0-9]{8}$)|(^[0-9]{12}$)|(^[0-9]{13}$)|(^[0-9]{14}$)'
        THEN 'invalid_format'
      WHEN (
        SELECT mod(
          10 - mod(sum(
            substring(btrim(token_ean) FROM digit_positions.position FOR 1)::integer
            * CASE
                WHEN mod(length(btrim(token_ean)) - digit_positions.position, 2) = 1 THEN 3
                ELSE 1
              END
          ), 10),
          10
        )
        FROM generate_series(1, length(btrim(token_ean)) - 1) AS digit_positions(position)
      ) = right(btrim(token_ean), 1)::integer THEN 'valid_gtin'
      ELSE 'invalid_check_digit'
    END AS token_ean_quality
  FROM source_pairs
  WHERE normalized_token_price > 0
    AND normalized_reference_price > 0
),
ratio_pairs AS (
  SELECT *
  FROM classified_pairs
  WHERE scale_ratio BETWEEN 90 AND 110
),
ranked_clean_pairs AS (
  SELECT
    ratio_pairs.*,
    count(*) OVER (PARTITION BY price_history_id) AS eligible_reference_count,
    row_number() OVER (
      PARTITION BY price_history_id
      ORDER BY age_seconds, reference_history_id
    ) AS reference_rank
  FROM ratio_pairs
  WHERE identity_conflict IS NULL
),
summary_counts AS (
  SELECT
    count(*) AS matching_pairs,
    count(DISTINCT price_history_id) AS distinct_token_history_rows,
    count(DISTINCT product_id) FILTER (WHERE identity_conflict IS NULL) AS clean_products,
    count(*) FILTER (WHERE identity_conflict IS NOT NULL) AS identity_conflict_pairs,
    count(DISTINCT price_history_id) FILTER (WHERE identity_conflict IS NOT NULL)
      AS identity_conflict_token_rows,
    count(DISTINCT price_history_id) FILTER (WHERE identity_conflict IS NULL)
      AS rows_to_register,
    count(DISTINCT price_history_id) FILTER (WHERE token_ean_quality = 'missing')
      AS missing_ean_token_rows,
    count(DISTINCT price_history_id) FILTER (
      WHERE token_ean_quality IN ('invalid_format', 'invalid_check_digit')
    ) AS invalid_ean_token_rows
  FROM ratio_pairs
),
detail_rows AS (
  SELECT
    'candidate'::text AS record_type,
    price_history_id,
    reference_history_id,
    product_id,
    reference_product_id,
    offer_id,
    offer_product_id,
    supermarket,
    token_product_name,
    reference_product_name,
    token_ean,
    token_ean_quality,
    reference_ean,
    token_source,
    reference_source,
    token_price,
    reference_price,
    normalized_token_price,
    normalized_reference_price,
    scale_ratio,
    observed_at,
    reference_observed_at,
    round(age_seconds / 86400, 2) AS days_apart,
    eligible_reference_count,
    identity_conflict
  FROM ranked_clean_pairs
  WHERE reference_rank = 1

  UNION ALL

  SELECT
    'identity_conflict'::text AS record_type,
    price_history_id,
    reference_history_id,
    product_id,
    reference_product_id,
    offer_id,
    offer_product_id,
    supermarket,
    token_product_name,
    reference_product_name,
    token_ean,
    token_ean_quality,
    reference_ean,
    token_source,
    reference_source,
    token_price,
    reference_price,
    normalized_token_price,
    normalized_reference_price,
    scale_ratio,
    observed_at,
    reference_observed_at,
    round(age_seconds / 86400, 2) AS days_apart,
    NULL::bigint AS eligible_reference_count,
    identity_conflict
  FROM ratio_pairs
  WHERE identity_conflict IS NOT NULL
),
report AS (
  SELECT
    'summary'::text AS record_type,
    NULL::uuid AS price_history_id,
    NULL::uuid AS reference_history_id,
    NULL::bigint AS product_id,
    NULL::bigint AS reference_product_id,
    NULL::bigint AS offer_id,
    NULL::bigint AS offer_product_id,
    NULL::text AS supermarket,
    NULL::text AS token_product_name,
    NULL::text AS reference_product_name,
    NULL::text AS token_ean,
    NULL::text AS token_ean_quality,
    NULL::text AS reference_ean,
    NULL::text AS token_source,
    NULL::text AS reference_source,
    NULL::numeric AS token_price,
    NULL::numeric AS reference_price,
    NULL::numeric AS normalized_token_price,
    NULL::numeric AS normalized_reference_price,
    NULL::numeric AS scale_ratio,
    NULL::timestamptz AS observed_at,
    NULL::timestamptz AS reference_observed_at,
    NULL::numeric AS days_apart,
    NULL::bigint AS eligible_reference_count,
    NULL::text AS identity_conflict,
    jsonb_build_object(
      'database_name', environment.database_name,
      'executed_as', environment.executed_as,
      'objects', jsonb_build_object(
        'price_history', environment.price_history_exists,
        'products', environment.products_exists,
        'offers', environment.offers_exists,
        'review_table_already_exists', environment.review_table_exists,
        'service_role_exists', environment.service_role_exists
      ),
      'schema_ready', schema_summary.schema_ready,
      'missing_columns', schema_summary.missing_columns,
      'required_columns', schema_summary.required_column_status,
      'counts', jsonb_build_object(
        'matching_pairs', summary_counts.matching_pairs,
        'distinct_token_history_rows', summary_counts.distinct_token_history_rows,
        'clean_products', summary_counts.clean_products,
        'identity_conflict_pairs', summary_counts.identity_conflict_pairs,
        'identity_conflict_token_rows', summary_counts.identity_conflict_token_rows,
        'rows_to_register', summary_counts.rows_to_register,
        'missing_ean_token_rows', summary_counts.missing_ean_token_rows,
        'invalid_ean_token_rows', summary_counts.invalid_ean_token_rows
      )
    ) AS summary
  FROM environment
  CROSS JOIN schema_summary
  CROSS JOIN summary_counts

  UNION ALL

  SELECT
    detail_rows.record_type,
    detail_rows.price_history_id,
    detail_rows.reference_history_id,
    detail_rows.product_id,
    detail_rows.reference_product_id,
    detail_rows.offer_id,
    detail_rows.offer_product_id,
    detail_rows.supermarket,
    detail_rows.token_product_name,
    detail_rows.reference_product_name,
    detail_rows.token_ean,
    detail_rows.token_ean_quality,
    detail_rows.reference_ean,
    detail_rows.token_source,
    detail_rows.reference_source,
    detail_rows.token_price,
    detail_rows.reference_price,
    detail_rows.normalized_token_price,
    detail_rows.normalized_reference_price,
    detail_rows.scale_ratio,
    detail_rows.observed_at,
    detail_rows.reference_observed_at,
    detail_rows.days_apart,
    detail_rows.eligible_reference_count,
    detail_rows.identity_conflict,
    NULL::jsonb AS summary
  FROM detail_rows
)
SELECT *
FROM report
ORDER BY
  CASE record_type
    WHEN 'summary' THEN 0
    WHEN 'candidate' THEN 1
    ELSE 2
  END,
  observed_at NULLS FIRST,
  price_history_id,
  reference_observed_at;

COMMIT;
