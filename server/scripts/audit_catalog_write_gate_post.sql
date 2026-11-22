BEGIN TRANSACTION READ ONLY;

WITH
expected_triggers(trigger_name, table_name, function_name) AS (
  VALUES
    ('catalog_maintenance_offers_guard', 'offers', 'guard_offer_catalog_write'),
    ('catalog_maintenance_products_guard', 'products', 'guard_product_catalog_write'),
    ('catalog_maintenance_price_history_guard', 'price_history', 'guard_product_history_write'),
    ('catalog_maintenance_price_analysis_guard', 'price_analysis', 'guard_product_analysis_write'),
    ('catalog_maintenance_price_update_log_guard', 'price_update_log', 'guard_price_update_log_write'),
    ('catalog_maintenance_brands_guard', 'brands', 'guard_brand_catalog_write'),
    ('catalog_maintenance_categories_guard', 'categories', 'guard_category_catalog_write'),
    ('catalog_maintenance_subcategories_guard', 'subcategories', 'guard_subcategory_catalog_write'),
    ('catalog_maintenance_supermarkets_guard', 'supermarkets', 'guard_supermarket_catalog_write')
),
expected_functions(function_name, identity_arguments, security_definer) AS (
  VALUES
    ('catalog_maintenance_blocked_supermarkets', '', true),
    ('set_catalog_maintenance', 'p_blocked_supermarkets text[]', true),
    ('assert_catalog_write_allowed', 'p_supermarket text', true),
    ('assert_catalog_product_write_allowed', 'p_product_id bigint, p_source text', true),
    ('guard_offer_catalog_write', '', true),
    ('guard_product_catalog_write', '', true),
    ('guard_product_history_write', '', true),
    ('guard_product_analysis_write', '', true),
    ('guard_price_update_log_write', '', true),
    ('guard_brand_catalog_write', '', true),
    ('guard_category_catalog_write', '', true),
    ('guard_subcategory_catalog_write', '', true),
    ('guard_supermarket_catalog_write', '', true),
    ('revert_price_update', 'p_log_id uuid', false),
    ('apply_catalog_price_sync', 'p_supermarket text, p_source text, p_updates jsonb, p_removals jsonb, p_log jsonb', false)
),
expected_state_columns(column_name, expected_type, expected_not_null) AS (
  VALUES
    ('singleton', 'boolean', true),
    ('blocked_supermarkets', 'text[]', true),
    ('updated_at', 'timestamp with time zone', true)
),
state_row AS (
  SELECT
    'gate_state'::text AS section,
    'public.catalog_maintenance_state'::text AS object_name,
    jsonb_build_object(
      'row_count', (SELECT count(*) FROM public.catalog_maintenance_state),
      'row_exists', EXISTS (
        SELECT 1 FROM public.catalog_maintenance_state WHERE singleton = true
      ),
      'blocked_supermarkets', (
        SELECT blocked_supermarkets
        FROM public.catalog_maintenance_state
        WHERE singleton = true
      ),
      'row_security_enabled', relation.relrowsecurity
    ) AS details
  FROM pg_class AS relation
  WHERE relation.oid = 'public.catalog_maintenance_state'::regclass
),
state_column_rows AS (
  SELECT
    'gate_state_columns'::text AS section,
    expected.column_name::text AS object_name,
    jsonb_build_object(
      'expected_type', expected.expected_type,
      'actual_type', CASE
        WHEN attribute.attnum IS NOT NULL THEN format_type(attribute.atttypid, attribute.atttypmod)
        ELSE NULL
      END,
      'type_matches', coalesce(
        format_type(attribute.atttypid, attribute.atttypmod) = expected.expected_type,
        false
      ),
      'expected_not_null', expected.expected_not_null,
      'actual_not_null', attribute.attnotnull,
      'default_expression', pg_get_expr(defaults.adbin, defaults.adrelid)
    ) AS details
  FROM expected_state_columns AS expected
  LEFT JOIN pg_attribute AS attribute
    ON attribute.attrelid = 'public.catalog_maintenance_state'::regclass
   AND attribute.attname = expected.column_name
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  LEFT JOIN pg_attrdef AS defaults
    ON defaults.adrelid = attribute.attrelid
   AND defaults.adnum = attribute.attnum
),
state_constraint_rows AS (
  SELECT
    'gate_state_constraints'::text AS section,
    constraint_row.conname::text AS object_name,
    jsonb_build_object(
      'type', constraint_row.contype,
      'validated', constraint_row.convalidated,
      'definition', pg_get_constraintdef(constraint_row.oid, true)
    ) AS details
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.catalog_maintenance_state'::regclass
),
catalog_count_rows AS (
  SELECT 'catalog_row_counts'::text AS section, 'products'::text AS object_name,
    jsonb_build_object('count', count(*)) AS details FROM public.products
  UNION ALL SELECT 'catalog_row_counts', 'offers', jsonb_build_object('count', count(*)) FROM public.offers
  UNION ALL SELECT 'catalog_row_counts', 'price_history', jsonb_build_object('count', count(*)) FROM public.price_history
  UNION ALL SELECT 'catalog_row_counts', 'price_analysis', jsonb_build_object('count', count(*)) FROM public.price_analysis
  UNION ALL SELECT 'catalog_row_counts', 'price_update_log', jsonb_build_object('count', count(*)) FROM public.price_update_log
  UNION ALL SELECT 'catalog_row_counts', 'brands', jsonb_build_object('count', count(*)) FROM public.brands
  UNION ALL SELECT 'catalog_row_counts', 'categories', jsonb_build_object('count', count(*)) FROM public.categories
  UNION ALL SELECT 'catalog_row_counts', 'subcategories', jsonb_build_object('count', count(*)) FROM public.subcategories
  UNION ALL SELECT 'catalog_row_counts', 'supermarkets', jsonb_build_object('count', count(*)) FROM public.supermarkets
),
catalog_orphan_row AS (
  SELECT
    'catalog_integrity'::text AS section,
    'orphaned_products'::text AS object_name,
    jsonb_build_object(
      'offers', (SELECT count(*) FROM public.offers o WHERE o.product_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = o.product_id)),
      'price_history', (SELECT count(*) FROM public.price_history h WHERE h.product_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = h.product_id)),
      'price_analysis', (SELECT count(*) FROM public.price_analysis a WHERE a.product_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = a.product_id))
    ) AS details
),
trigger_rows AS (
  SELECT
    'gate_triggers'::text AS section,
    format('public.%I.%I', expected.table_name, expected.trigger_name) AS object_name,
    jsonb_build_object(
      'present', trigger_row.oid IS NOT NULL,
      'enabled', trigger_row.tgenabled IS NOT NULL AND trigger_row.tgenabled <> 'D',
      'enabled_state', trigger_row.tgenabled,
      'actual_function', trigger_row.tgfoid::regprocedure::text,
      'expected_function', 'public.' || expected.function_name || '()'
    ) AS details
  FROM expected_triggers AS expected
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS relation
    ON relation.relnamespace = n.oid
   AND relation.relname = expected.table_name
  LEFT JOIN pg_trigger AS trigger_row
    ON trigger_row.tgrelid = relation.oid
   AND trigger_row.tgname = expected.trigger_name
   AND NOT trigger_row.tgisinternal
),
function_rows AS (
  SELECT
    'gate_functions'::text AS section,
    ('public.' || expected.function_name)::text AS object_name,
    jsonb_build_object(
      'signature_present', p.oid IS NOT NULL,
      'identity_arguments', CASE
        WHEN p.oid IS NOT NULL THEN pg_get_function_identity_arguments(p.oid)
        ELSE NULL
      END,
      'security_definer', p.prosecdef,
      'security_definer_expected', expected.security_definer,
      'search_path', p.proconfig,
      'service_role_execute', CASE
        WHEN service_role.oid IS NOT NULL AND p.oid IS NOT NULL
          THEN has_function_privilege(service_role.oid, p.oid, 'EXECUTE')
        ELSE NULL
      END,
      'anon_execute', CASE
        WHEN anon_role.oid IS NOT NULL AND p.oid IS NOT NULL
          THEN has_function_privilege(anon_role.oid, p.oid, 'EXECUTE')
        ELSE NULL
      END,
      'authenticated_execute', CASE
        WHEN authenticated_role.oid IS NOT NULL AND p.oid IS NOT NULL
          THEN has_function_privilege(authenticated_role.oid, p.oid, 'EXECUTE')
        ELSE NULL
      END,
      'public_execute_grant', CASE
        WHEN p.oid IS NOT NULL THEN EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
          WHERE acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        )
        ELSE NULL
      END,
      'owner', owner_role.rolname
    ) AS details
  FROM expected_functions AS expected
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_proc AS p
    ON p.pronamespace = n.oid
   AND p.proname = expected.function_name
   AND pg_get_function_identity_arguments(p.oid) = expected.identity_arguments
  LEFT JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
  LEFT JOIN pg_roles AS service_role ON service_role.rolname = 'service_role'
  LEFT JOIN pg_roles AS anon_role ON anon_role.rolname = 'anon'
  LEFT JOIN pg_roles AS authenticated_role ON authenticated_role.rolname = 'authenticated'
),
table_security AS (
  SELECT
    'table_security'::text AS section,
    'public.catalog_maintenance_state'::text AS object_name,
    jsonb_build_object(
      'row_security_enabled', relation.relrowsecurity,
      'public_privileges', ARRAY(
        SELECT acl.privilege_type
        FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS acl
        WHERE acl.grantee = 0
        ORDER BY acl.privilege_type
      ),
      'anon_privileges', CASE
        WHEN anon_role.oid IS NOT NULL
          THEN jsonb_build_object(
            'select', has_table_privilege(anon_role.oid, relation.oid, 'SELECT'),
            'insert', has_table_privilege(anon_role.oid, relation.oid, 'INSERT'),
            'update', has_table_privilege(anon_role.oid, relation.oid, 'UPDATE'),
            'delete', has_table_privilege(anon_role.oid, relation.oid, 'DELETE'),
            'truncate', has_table_privilege(anon_role.oid, relation.oid, 'TRUNCATE'),
            'references', has_table_privilege(anon_role.oid, relation.oid, 'REFERENCES'),
            'trigger', has_table_privilege(anon_role.oid, relation.oid, 'TRIGGER')
          )
        ELSE NULL
      END,
      'authenticated_privileges', CASE
        WHEN authenticated_role.oid IS NOT NULL
          THEN jsonb_build_object(
            'select', has_table_privilege(authenticated_role.oid, relation.oid, 'SELECT'),
            'insert', has_table_privilege(authenticated_role.oid, relation.oid, 'INSERT'),
            'update', has_table_privilege(authenticated_role.oid, relation.oid, 'UPDATE'),
            'delete', has_table_privilege(authenticated_role.oid, relation.oid, 'DELETE'),
            'truncate', has_table_privilege(authenticated_role.oid, relation.oid, 'TRUNCATE'),
            'references', has_table_privilege(authenticated_role.oid, relation.oid, 'REFERENCES'),
            'trigger', has_table_privilege(authenticated_role.oid, relation.oid, 'TRIGGER')
          )
        ELSE NULL
      END,
      'service_role_privileges', CASE
        WHEN service_role.oid IS NOT NULL
          THEN jsonb_build_object(
            'select', has_table_privilege(service_role.oid, relation.oid, 'SELECT'),
            'insert', has_table_privilege(service_role.oid, relation.oid, 'INSERT'),
            'update', has_table_privilege(service_role.oid, relation.oid, 'UPDATE'),
            'delete', has_table_privilege(service_role.oid, relation.oid, 'DELETE'),
            'truncate', has_table_privilege(service_role.oid, relation.oid, 'TRUNCATE'),
            'references', has_table_privilege(service_role.oid, relation.oid, 'REFERENCES'),
            'trigger', has_table_privilege(service_role.oid, relation.oid, 'TRIGGER')
          )
        ELSE NULL
      END
    ) AS details
  FROM pg_class AS relation
  LEFT JOIN pg_roles AS anon_role ON anon_role.rolname = 'anon'
  LEFT JOIN pg_roles AS authenticated_role ON authenticated_role.rolname = 'authenticated'
  LEFT JOIN pg_roles AS service_role ON service_role.rolname = 'service_role'
  WHERE relation.oid = 'public.catalog_maintenance_state'::regclass
)
SELECT section, object_name, details
FROM (
  SELECT * FROM state_row
  UNION ALL SELECT * FROM state_column_rows
  UNION ALL SELECT * FROM state_constraint_rows
  UNION ALL SELECT * FROM trigger_rows
  UNION ALL SELECT * FROM function_rows
  UNION ALL SELECT * FROM table_security
  UNION ALL SELECT * FROM catalog_count_rows
  UNION ALL SELECT * FROM catalog_orphan_row
) AS report
ORDER BY section, object_name;

COMMIT;
