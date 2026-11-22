-- Read-only preflight for taxonomy evidence and comparable references.
-- Run in the Supabase SQL Editor. This script does not change application data.

BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_user AS executed_as,
  clock_timestamp() AS checked_at;

WITH expected_relations(object_name) AS (
  VALUES
    ('public.products'),
    ('public.categories'),
    ('public.subcategories'),
    ('public.comparable_groups'),
    ('public.catalog_taxonomy_review_decisions'),
    ('public.product_price_status_comparable_group_memberships'),
    ('public.product_price_status_refresh_queue')
)
SELECT
  'relation' AS object_kind,
  object_name,
  to_regclass(object_name) IS NOT NULL AS present,
  to_regclass(object_name)::text AS resolved_name
FROM expected_relations
ORDER BY object_name;

WITH expected_columns(table_name, column_name) AS (
  VALUES
    ('products', 'category_id'),
    ('products', 'subcategory_id'),
    ('products', 'comparable_group_id'),
    ('products', 'classification_source'),
    ('products', 'classification_confidence'),
    ('products', 'ean'),
    ('categories', 'id'),
    ('categories', 'name'),
    ('subcategories', 'id'),
    ('subcategories', 'category_id'),
    ('subcategories', 'name'),
    ('comparable_groups', 'id'),
    ('comparable_groups', 'subcategory_id'),
    ('comparable_groups', 'name'),
    ('comparable_groups', 'normalization_key'),
    ('catalog_taxonomy_review_decisions', 'product_id'),
    ('catalog_taxonomy_review_decisions', 'status'),
    ('catalog_taxonomy_review_decisions', 'admin_username'),
    ('catalog_taxonomy_review_decisions', 'updated_at')
)
SELECT
  'column' AS object_kind,
  format('public.%I.%I', table_name, column_name) AS object_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = expected_columns.table_name
      AND column_info.column_name = expected_columns.column_name
  ) AS present
FROM expected_columns
ORDER BY table_name, column_name;

SELECT
  relation.relname AS table_name,
  relation.relrowsecurity AS row_level_security_enabled,
  relation.relforcerowsecurity AS force_row_level_security,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'policy', policy.policyname,
        'command', policy.cmd,
        'roles', policy.roles
      )
      ORDER BY policy.policyname
    ) FILTER (WHERE policy.policyname IS NOT NULL),
    '[]'::jsonb
  ) AS policies
FROM pg_class AS relation
JOIN pg_namespace AS schema_info
  ON schema_info.oid = relation.relnamespace
LEFT JOIN pg_policies AS policy
  ON policy.schemaname = schema_info.nspname
  AND policy.tablename = relation.relname
WHERE schema_info.nspname = 'public'
  AND relation.relname IN (
    'products',
    'comparable_groups',
    'catalog_taxonomy_review_decisions',
    'product_price_status_comparable_group_memberships',
    'product_price_status_refresh_queue'
  )
GROUP BY relation.relname, relation.relrowsecurity, relation.relforcerowsecurity
ORDER BY relation.relname;

SELECT
  CASE
    WHEN to_regclass('public.catalog_taxonomy_review_decisions') IS NULL THEN NULL
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'service_role'
    ) THEN NULL
    ELSE has_table_privilege(
      'service_role',
      to_regclass('public.catalog_taxonomy_review_decisions')::oid,
      'SELECT'
    )
  END AS service_role_can_select_taxonomy_review_decisions;

SELECT
  'catalog_summary' AS section,
  'categories' AS metric,
  count(*)::bigint AS value
FROM public.categories
UNION ALL
SELECT
  'catalog_summary',
  'subcategories',
  count(*)::bigint
FROM public.subcategories
UNION ALL
SELECT
  'catalog_summary',
  'products',
  count(*)::bigint
FROM public.products
UNION ALL
SELECT
  'comparable_summary',
  'groups',
  count(*)::bigint
FROM public.comparable_groups
UNION ALL
SELECT
  'comparable_summary',
  'products_assigned_to_groups',
  count(*)::bigint
FROM public.products
WHERE comparable_group_id IS NOT NULL
UNION ALL
SELECT
  'comparable_summary',
  'groups_without_products',
  count(*)::bigint
FROM public.comparable_groups AS comparable_group
WHERE NOT EXISTS (
  SELECT 1
  FROM public.products AS product
  WHERE product.comparable_group_id = comparable_group.id
)
UNION ALL
SELECT
  'comparable_summary',
  'orphaned_product_group_references',
  count(*)::bigint
FROM public.products AS product
LEFT JOIN public.comparable_groups AS comparable_group
  ON comparable_group.id = product.comparable_group_id
WHERE product.comparable_group_id IS NOT NULL
  AND comparable_group.id IS NULL
UNION ALL
SELECT
  'comparable_summary',
  'group_subcategory_mismatches',
  count(*)::bigint
FROM public.products AS product
JOIN public.comparable_groups AS comparable_group
  ON comparable_group.id = product.comparable_group_id
WHERE product.subcategory_id IS DISTINCT FROM comparable_group.subcategory_id
UNION ALL
SELECT
  'taxonomy_summary',
  'products_with_invalid_category_subcategory_pair',
  count(*)::bigint
FROM public.products AS product
LEFT JOIN public.subcategories AS subcategory
  ON subcategory.id = product.subcategory_id
WHERE product.subcategory_id IS NOT NULL
  AND (
    subcategory.id IS NULL
    OR product.category_id IS DISTINCT FROM subcategory.category_id
  )
UNION ALL
SELECT
  'taxonomy_summary',
  'products_with_invalid_classification_source',
  count(*)::bigint
FROM public.products
WHERE classification_source IS NOT NULL
  AND classification_source NOT IN ('automatic', 'manual')
ORDER BY section, metric;

SELECT
  classification_source,
  classification_confidence,
  count(*)::bigint AS product_count
FROM public.products
GROUP BY classification_source, classification_confidence
ORDER BY classification_source NULLS FIRST, classification_confidence NULLS FIRST;

SELECT
  category_id,
  subcategory_id,
  count(*)::bigint AS product_count
FROM public.products
WHERE subcategory_id IS NOT NULL
GROUP BY category_id, subcategory_id
ORDER BY product_count DESC, category_id, subcategory_id
LIMIT 100;

SELECT
  comparable_group.id AS comparable_group_id,
  comparable_group.subcategory_id,
  comparable_group.name,
  comparable_group.normalization_key,
  count(product.id)::bigint AS assigned_product_count,
  count(DISTINCT NULLIF(regexp_replace(COALESCE(product.ean::text, ''), '\D', '', 'g'), ''))
    AS distinct_ean_count
FROM public.comparable_groups AS comparable_group
LEFT JOIN public.products AS product
  ON product.comparable_group_id = comparable_group.id
GROUP BY
  comparable_group.id,
  comparable_group.subcategory_id,
  comparable_group.name,
  comparable_group.normalization_key
ORDER BY assigned_product_count DESC, comparable_group.id
LIMIT 200;

SELECT
  normalized_ean,
  count(*)::bigint AS product_count,
  array_agg(id ORDER BY id) AS product_ids
FROM (
  SELECT
    id,
    NULLIF(regexp_replace(COALESCE(ean::text, ''), '\D', '', 'g'), '') AS normalized_ean
  FROM public.products
) AS products_with_ean
WHERE normalized_ean IS NOT NULL
  AND length(normalized_ean) IN (8, 12, 13, 14)
GROUP BY normalized_ean
HAVING count(*) > 1
ORDER BY product_count DESC, normalized_ean
LIMIT 200;

-- Optional follow-up: execute this query separately only if the preflight
-- confirms that public.catalog_taxonomy_review_decisions exists.
/*
SELECT
  status,
  count(*)::bigint AS decision_count,
  count(*) FILTER (WHERE product.id IS NULL)::bigint AS decisions_without_product
FROM public.catalog_taxonomy_review_decisions AS decision
LEFT JOIN public.products AS product
  ON product.id = decision.product_id
GROUP BY status
ORDER BY status;
*/

-- These objects are required only by the durable price-status migration.
SELECT
  'public.product_price_status_comparable_group_key(integer)' AS function_name,
  to_regprocedure('public.product_price_status_comparable_group_key(integer)') IS NOT NULL AS present
UNION ALL
SELECT
  'public.refresh_product_price_status_comparable_group_memberships(integer[])',
  to_regprocedure('public.refresh_product_price_status_comparable_group_memberships(integer[])') IS NOT NULL
UNION ALL
SELECT
  'public.monitor_product_price_status_refresh_queue()',
  to_regprocedure('public.monitor_product_price_status_refresh_queue()') IS NOT NULL;

COMMIT;
