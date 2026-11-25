WITH review_rows AS (
  SELECT
    review.*,
    history.source AS history_source,
    history.cash_price AS history_cash_price,
    history.observed_at AS history_observed_at,
    reference.source AS reference_source,
    reference.cash_price AS reference_cash_price,
    reference.observed_at AS reference_observed_at_actual,
    offer.cash_price AS current_offer_cash_price,
    offer.list_price AS current_offer_list_price,
    offer.supermarket,
    product.name AS current_product_name,
    product.ean AS current_product_ean,
    product.source AS current_product_source,
    brand.name AS current_brand_name,
    to_jsonb(product) AS product_data
  FROM public.price_history_scale_artifact_reviews AS review
  LEFT JOIN public.price_history AS history
    ON history.id = review.price_history_id
  LEFT JOIN public.price_history AS reference
    ON reference.id = review.reference_history_id
  LEFT JOIN public.offers AS offer
    ON offer.id = review.offer_id
  LEFT JOIN public.products AS product
    ON product.id = review.product_id
  LEFT JOIN public.brands AS brand
    ON brand.id = product.brand_id
  WHERE review.decision = 'pending'
),
history_context AS (
  SELECT
    review.price_history_id,
    coalesce((
      SELECT jsonb_agg(to_jsonb(before_row) ORDER BY before_row.observed_at DESC, before_row.id DESC)
      FROM (
        SELECT h.id, h.source, h.cash_price, h.observed_at
        FROM public.price_history AS h
        WHERE h.offer_id = review.offer_id
          AND h.observed_at <= review.observed_at
          AND h.id <> review.price_history_id
        ORDER BY h.observed_at DESC, h.id DESC
        LIMIT 5
      ) AS before_row
    ), '[]'::jsonb) AS before_history,
    coalesce((
      SELECT jsonb_agg(to_jsonb(after_row) ORDER BY after_row.observed_at, after_row.id)
      FROM (
        SELECT h.id, h.source, h.cash_price, h.observed_at
        FROM public.price_history AS h
        WHERE h.offer_id = review.offer_id
          AND h.observed_at >= review.observed_at
          AND h.id <> review.price_history_id
        ORDER BY h.observed_at, h.id
        LIMIT 5
      ) AS after_row
    ), '[]'::jsonb) AS after_history
  FROM review_rows AS review
),
duplicate_groups AS (
  SELECT count(*) AS duplicate_group_count
  FROM (
    SELECT history.offer_id, history.product_id, history.source, history.cash_price, history.observed_at
    FROM public.price_history AS history
    JOIN review_rows AS review ON review.offer_id = history.offer_id
    GROUP BY history.offer_id, history.product_id, history.source, history.cash_price, history.observed_at
    HAVING count(*) > 1
  ) AS duplicate_groups
),
related_schema AS (
  SELECT jsonb_object_agg(target.table_name, table_schema.details) AS details
  FROM (VALUES ('price_history'), ('offers'), ('products'), ('brands')) AS target(table_name)
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'table', coalesce((
        SELECT to_jsonb(table_info)
        FROM (
          SELECT
            cls.relname AS table_name,
            pg_get_userbyid(cls.relowner) AS owner,
            cls.relrowsecurity AS row_security_enabled,
            cls.relforcerowsecurity AS force_row_security
          FROM pg_class AS cls
          JOIN pg_namespace AS namespace ON namespace.oid = cls.relnamespace
          WHERE namespace.nspname = 'public'
            AND cls.relname = target.table_name
        ) AS table_info
      ), '{}'::jsonb),
      'columns', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name', column_info.column_name,
          'type', column_info.data_type,
          'nullable', column_info.is_nullable,
          'default', column_info.column_default
        ) ORDER BY column_info.ordinal_position)
        FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = target.table_name
      ), '[]'::jsonb),
      'constraints', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name', constraint_info.conname,
          'definition', pg_get_constraintdef(constraint_info.oid)
        ) ORDER BY constraint_info.conname)
        FROM pg_constraint AS constraint_info
        JOIN pg_class AS cls ON cls.oid = constraint_info.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = cls.relnamespace
        WHERE namespace.nspname = 'public'
          AND cls.relname = target.table_name
      ), '[]'::jsonb),
      'indexes', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name', index_info.indexname,
          'definition', index_info.indexdef
        ) ORDER BY index_info.indexname)
        FROM pg_indexes AS index_info
        WHERE index_info.schemaname = 'public'
          AND index_info.tablename = target.table_name
      ), '[]'::jsonb),
      'policies', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name', policy.policyname,
          'command', policy.cmd,
          'roles', policy.roles,
          'using', policy.qual,
          'with_check', policy.with_check
        ) ORDER BY policy.policyname)
        FROM pg_policies AS policy
        WHERE policy.schemaname = 'public'
          AND policy.tablename = target.table_name
      ), '[]'::jsonb),
      'grants', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'grantee', grant_info.grantee,
          'privilege', grant_info.privilege_type,
          'grantable', grant_info.is_grantable
        ) ORDER BY grant_info.grantee, grant_info.privilege_type)
        FROM information_schema.role_table_grants AS grant_info
        WHERE grant_info.table_schema = 'public'
          AND grant_info.table_name = target.table_name
          AND grant_info.grantee IN ('anon', 'authenticated', 'service_role', 'postgres')
      ), '[]'::jsonb),
      'triggers', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name', trigger_info.tgname,
          'enabled', trigger_info.tgenabled,
          'definition', pg_get_triggerdef(trigger_info.oid)
        ) ORDER BY trigger_info.tgname)
        FROM pg_trigger AS trigger_info
        JOIN pg_class AS cls ON cls.oid = trigger_info.tgrelid
        JOIN pg_namespace AS namespace ON namespace.oid = cls.relnamespace
        WHERE namespace.nspname = 'public'
          AND cls.relname = target.table_name
          AND NOT trigger_info.tgisinternal
      ), '[]'::jsonb)
    ) AS details
  ) AS table_schema
),
review_table AS (
  SELECT to_jsonb(table_info) AS details
  FROM (
    SELECT
      cls.relname AS table_name,
      pg_get_userbyid(cls.relowner) AS owner,
      cls.relrowsecurity AS row_security_enabled,
      cls.relforcerowsecurity AS force_row_security
    FROM pg_class AS cls
    JOIN pg_namespace AS namespace ON namespace.oid = cls.relnamespace
    WHERE namespace.nspname = 'public'
      AND cls.relname = 'price_history_scale_artifact_reviews'
  ) AS table_info
),
schema_inventory AS (
  SELECT jsonb_build_object(
    'table', coalesce((SELECT details FROM review_table), '{}'::jsonb),
    'columns', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name', column_info.column_name,
        'type', column_info.data_type,
        'nullable', column_info.is_nullable,
        'default', column_info.column_default
      ) ORDER BY column_info.ordinal_position)
      FROM information_schema.columns AS column_info
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = 'price_history_scale_artifact_reviews'
    ), '[]'::jsonb),
    'constraints', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name', constraint_info.conname,
        'definition', pg_get_constraintdef(constraint_info.oid)
      ) ORDER BY constraint_info.conname)
      FROM pg_constraint AS constraint_info
      JOIN pg_class AS cls ON cls.oid = constraint_info.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = cls.relnamespace
      WHERE namespace.nspname = 'public'
        AND cls.relname = 'price_history_scale_artifact_reviews'
    ), '[]'::jsonb),
    'indexes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name', index_info.indexname,
        'definition', index_info.indexdef
      ) ORDER BY index_info.indexname)
      FROM pg_indexes AS index_info
      WHERE index_info.schemaname = 'public'
        AND index_info.tablename = 'price_history_scale_artifact_reviews'
    ), '[]'::jsonb),
    'policies', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name', policy.policyname,
        'command', policy.cmd,
        'roles', policy.roles,
        'using', policy.qual,
        'with_check', policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_policies AS policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = 'price_history_scale_artifact_reviews'
    ), '[]'::jsonb),
    'grants', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'grantee', grant_info.grantee,
        'privilege', grant_info.privilege_type,
        'grantable', grant_info.is_grantable
      ) ORDER BY grant_info.grantee, grant_info.privilege_type)
      FROM information_schema.role_table_grants AS grant_info
      WHERE grant_info.table_schema = 'public'
        AND grant_info.table_name = 'price_history_scale_artifact_reviews'
        AND grant_info.grantee IN ('anon', 'authenticated', 'service_role', 'postgres')
    ), '[]'::jsonb),
    'triggers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name', trigger_info.tgname,
        'enabled', trigger_info.tgenabled,
        'definition', pg_get_triggerdef(trigger_info.oid)
      ) ORDER BY trigger_info.tgname)
      FROM pg_trigger AS trigger_info
      JOIN pg_class AS cls ON cls.oid = trigger_info.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = cls.relnamespace
      WHERE namespace.nspname = 'public'
        AND cls.relname = 'price_history_scale_artifact_reviews'
        AND NOT trigger_info.tgisinternal
    ), '[]'::jsonb),
    'related_tables', coalesce((SELECT details FROM related_schema), '{}'::jsonb)
  ) AS details
)
SELECT
  'summary' AS row_type,
  NULL::text AS price_history_id,
  jsonb_build_object(
    'pending_rows', count(review.price_history_id),
    'unique_products', count(DISTINCT review.product_id),
    'unique_offers', count(DISTINCT review.offer_id),
    'supermarkets', coalesce((
      SELECT jsonb_object_agg(coalesce(supermarket, '<null>'), row_count)
      FROM (
        SELECT supermarket, count(*) AS row_count
        FROM review_rows
        GROUP BY supermarket
      ) AS supermarket_counts
    ), '{}'::jsonb),
    'stored_decisions', coalesce((
      SELECT jsonb_object_agg(decision, row_count)
      FROM (
        SELECT decision, count(*) AS row_count
        FROM public.price_history_scale_artifact_reviews
        GROUP BY decision
      ) AS decision_counts
    ), '{}'::jsonb),
    'raw_token_to_reference_ratio_buckets', coalesce((
      SELECT jsonb_object_agg(ratio_bucket, row_count)
      FROM (
        SELECT
          CASE
            WHEN token_price / nullif(reference_price, 0) BETWEEN 9 AND 11 THEN 'x10'
            WHEN token_price / nullif(reference_price, 0) BETWEEN 90 AND 110 THEN 'x100'
            WHEN token_price / nullif(reference_price, 0) BETWEEN 900 AND 1100 THEN 'x1000'
            WHEN token_price / nullif(reference_price, 0) BETWEEN 0.0009 AND 0.0011 THEN '/1000'
            WHEN token_price / nullif(reference_price, 0) BETWEEN 0.009 AND 0.011 THEN '/100'
            WHEN token_price / nullif(reference_price, 0) BETWEEN 0.09 AND 0.11 THEN '/10'
            ELSE 'other'
          END AS ratio_bucket,
          count(*) AS row_count
        FROM review_rows
        GROUP BY 1
      ) AS ratio_counts
    ), '{}'::jsonb),
    'duplicate_capture_groups', (SELECT duplicate_group_count FROM duplicate_groups),
    'review_table_schema', (SELECT details FROM schema_inventory)
  ) AS details
FROM review_rows AS review
UNION ALL
SELECT
  'candidate' AS row_type,
  review.price_history_id::text,
  jsonb_build_object(
    'price_history_id', review.price_history_id,
    'reference_history_id', review.reference_history_id,
    'product_id', review.product_id,
    'offer_id', review.offer_id,
    'supermarket', review.supermarket,
    'product', jsonb_build_object(
      'name', coalesce(review.current_product_name, review.product_name),
      'ean', coalesce(review.current_product_ean, review.product_ean),
      'source', review.current_product_source,
      'source_product_id', review.product_data ->> 'source_product_id',
      'brand', review.current_brand_name,
      'category_id', review.product_data ->> 'category_id',
      'subcategory_id', review.product_data ->> 'subcategory_id',
      'presentation', coalesce(
        review.product_data ->> 'presentation',
        review.product_data ->> 'net_content',
        review.product_data ->> 'size',
        review.product_data ->> 'unit'
      )
    ),
    'other_offers_same_product', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'offer_id', other_offer.id,
        'supermarket', other_offer.supermarket,
        'cash_price', other_offer.cash_price
      ) ORDER BY other_offer.id)
      FROM public.offers AS other_offer
      WHERE other_offer.product_id = review.product_id
        AND other_offer.id <> review.offer_id
    ), '[]'::jsonb),
    'review_state', review.decision,
    'recorded_at', review.recorded_at,
    'token', jsonb_build_object(
      'stored_price', review.token_price,
      'history_price', review.history_cash_price,
      'history_source', review.history_source,
      'observed_at', review.history_observed_at
    ),
    'reference', jsonb_build_object(
      'stored_price', review.reference_price,
      'history_price', review.reference_cash_price,
      'history_source', review.reference_source,
      'observed_at', review.reference_observed_at_actual
    ),
    'current_offer', jsonb_build_object(
      'cash_price', review.current_offer_cash_price,
      'list_price', review.current_offer_list_price
    ),
    'stored_normalization', jsonb_build_object(
      'token_price', review.normalized_token_price,
      'reference_price', review.normalized_reference_price,
      'scale_ratio', review.scale_ratio
    ),
    'raw_token_reference_ratio', round(
      review.token_price / nullif(review.reference_price, 0), 6
    ),
    'history_before', context.before_history,
    'history_after', context.after_history,
    'reviewed_at', review.reviewed_at,
    'review_note', review.review_note
  ) AS details
FROM review_rows AS review
JOIN history_context AS context USING (price_history_id)
-- For the remaining candidates, rerun with OFFSET 100 and then OFFSET 200.
ORDER BY row_type DESC, price_history_id
LIMIT 100 OFFSET 0;