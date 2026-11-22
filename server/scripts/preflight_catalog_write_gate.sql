BEGIN TRANSACTION READ ONLY;

WITH
required_tables(table_name) AS (
  VALUES
    ('products'),
    ('offers'),
    ('price_history'),
    ('price_analysis'),
    ('price_update_log'),
    ('brands'),
    ('categories'),
    ('subcategories'),
    ('supermarkets')
),
required_columns(table_name, column_name, expected_type) AS (
  VALUES
    ('products', 'id', 'integer or bigint; gate functions use bigint variables; verify with successful RPC tests'),
    ('products', 'source', 'text'),
    ('products', 'source_product_id', 'text'),
    ('products', 'brand_id', 'compatible with brands.id'),
    ('products', 'category_id', NULL::text),
    ('products', 'subcategory_id', NULL::text),
    ('offers', 'id', 'integer or bigint; gate functions use bigint variables; verify with successful RPC tests'),
    ('offers', 'product_id', 'compatible with products.id'),
    ('offers', 'supermarket', 'text or character varying'),
    ('offers', 'cash_price', 'numeric'),
    ('price_history', 'product_id', 'compatible with products.id'),
    ('price_history', 'offer_id', 'compatible with offers.id'),
    ('price_history', 'id', 'inspect type/default used by inserts'),
    ('price_history', 'cash_price', 'numeric'),
    ('price_history', 'source', 'text'),
    ('price_analysis', 'product_id', 'compatible with products.id'),
    ('price_update_log', 'id', 'uuid'),
    ('price_update_log', 'filters', 'jsonb'),
    ('price_update_log', 'changes', 'jsonb'),
    ('price_update_log', 'admin_username', 'text'),
    ('price_update_log', 'percentage', 'numeric'),
    ('price_update_log', 'products_updated', 'integer'),
    ('brands', 'id', NULL::text),
    ('brands', 'name', 'text'),
    ('categories', 'id', NULL::text),
    ('categories', 'name', 'text'),
    ('subcategories', 'id', NULL::text),
    ('subcategories', 'category_id', NULL::text),
    ('supermarkets', 'name', 'text')
),
gate_triggers(trigger_name, table_name, function_name) AS (
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
gate_functions(function_name) AS (
  VALUES
    ('catalog_maintenance_blocked_supermarkets'),
    ('set_catalog_maintenance'),
    ('assert_catalog_write_allowed'),
    ('assert_catalog_product_write_allowed'),
    ('guard_offer_catalog_write'),
    ('guard_product_catalog_write'),
    ('guard_product_history_write'),
    ('guard_product_analysis_write'),
    ('guard_price_update_log_write'),
    ('guard_brand_catalog_write'),
    ('guard_category_catalog_write'),
    ('guard_subcategory_catalog_write'),
    ('guard_supermarket_catalog_write'),
    ('revert_price_update'),
    ('apply_catalog_price_sync')
),
required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')
),
environment_row AS (
  SELECT
    'environment'::text AS section,
    'connection'::text AS object_name,
    jsonb_build_object(
      'database', current_database(),
      'user', current_user,
      'server_address', inet_server_addr()::text,
      'server_port', inet_server_port(),
      'version', version()
    ) AS details
),
table_rows AS (
  SELECT
    'required_tables'::text AS section,
    rt.table_name::text AS object_name,
    jsonb_build_object(
      'present', c.oid IS NOT NULL,
      'relation_kind', c.relkind,
      'owner', owner_role.rolname,
      'row_security_enabled', c.relrowsecurity,
      'force_row_security', c.relforcerowsecurity
    ) AS details
  FROM required_tables AS rt
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = rt.table_name
  LEFT JOIN pg_roles AS owner_role ON owner_role.oid = c.relowner
),
policy_rows AS (
  SELECT
    'rls_policies'::text AS section,
    format('public.%I', rt.table_name)::text AS object_name,
    jsonb_build_object(
      'row_security_enabled', c.relrowsecurity,
      'force_row_security', c.relforcerowsecurity,
      'policies', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', policy.polname,
            'permissive', policy.polpermissive,
            'command', CASE policy.polcmd
              WHEN 'r' THEN 'SELECT'
              WHEN 'a' THEN 'INSERT'
              WHEN 'w' THEN 'UPDATE'
              WHEN 'd' THEN 'DELETE'
              WHEN '*' THEN 'ALL'
            END,
            'roles', ARRAY(
              SELECT CASE
                WHEN policy_role.role_oid = 0 THEN 'PUBLIC'
                ELSE pg_get_userbyid(policy_role.role_oid)
              END
              FROM unnest(policy.polroles) AS policy_role(role_oid)
              ORDER BY policy_role.role_oid
            ),
            'using', pg_get_expr(policy.polqual, policy.polrelid),
            'with_check', pg_get_expr(policy.polwithcheck, policy.polrelid)
          )
          ORDER BY policy.polname
        )
        FROM pg_policy AS policy
        WHERE policy.polrelid = c.oid
      ), '[]'::jsonb)
    ) AS details
  FROM required_tables AS rt
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = rt.table_name
),
column_rows AS (
  SELECT
    'required_columns'::text AS section,
    format('public.%I.%I', rc.table_name, rc.column_name) AS object_name,
    jsonb_build_object(
      'table_exists', c.oid IS NOT NULL,
      'column_exists', a.attnum IS NOT NULL,
      'actual_type', CASE
        WHEN a.attnum IS NOT NULL THEN format_type(a.atttypid, a.atttypmod)
        ELSE NULL
      END,
      'expected_type_or_note', rc.expected_type,
      'nullable', CASE WHEN a.attnum IS NOT NULL THEN NOT a.attnotnull ELSE NULL END,
      'default_expression', CASE
        WHEN a.attnum IS NOT NULL THEN pg_get_expr(d.adbin, d.adrelid)
        ELSE NULL
      END
    ) AS details
  FROM required_columns AS rc
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = rc.table_name
  LEFT JOIN pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attname = rc.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
  LEFT JOIN pg_attrdef AS d ON d.adrelid = c.oid AND d.adnum = a.attnum
),
constraint_rows AS (
  SELECT
    'existing_constraints'::text AS section,
    format('public.%I.%I', relation.relname, constraint_row.conname) AS object_name,
    jsonb_build_object(
      'type', constraint_row.contype,
      'validated', constraint_row.convalidated,
      'definition', pg_get_constraintdef(constraint_row.oid, true),
      'referenced_relation', CASE
        WHEN constraint_row.confrelid = 0 THEN NULL
        ELSE constraint_row.confrelid::regclass::text
      END
    ) AS details
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_namespace AS n ON n.oid = relation.relnamespace
  WHERE n.nspname = 'public'
    AND relation.relname IN (
      'products', 'offers', 'price_history', 'price_analysis',
      'price_update_log', 'brands', 'categories', 'subcategories', 'supermarkets'
    )
),
trigger_rows AS (
  SELECT
    'existing_triggers'::text AS section,
    format('public.%I.%I', relation.relname, trigger_row.tgname) AS object_name,
    jsonb_build_object(
      'enabled_state', trigger_row.tgenabled,
      'function', trigger_row.tgfoid::regprocedure::text,
      'definition', pg_get_triggerdef(trigger_row.oid, true)
    ) AS details
  FROM pg_trigger AS trigger_row
  JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_namespace AS n ON n.oid = relation.relnamespace
  WHERE n.nspname = 'public'
    AND relation.relname IN (
      'products', 'offers', 'price_history', 'price_analysis',
      'price_update_log', 'brands', 'categories', 'subcategories', 'supermarkets'
    )
    AND NOT trigger_row.tgisinternal
),
expected_trigger_rows AS (
  SELECT
    'expected_gate_triggers'::text AS section,
    format('public.%I.%I', expected.table_name, expected.trigger_name) AS object_name,
    jsonb_build_object(
      'present', trigger_row.oid IS NOT NULL,
      'enabled_state', trigger_row.tgenabled,
      'actual_function', trigger_row.tgfoid::regprocedure::text,
      'expected_function', 'public.' || expected.function_name || '()'
    ) AS details
  FROM gate_triggers AS expected
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
    'existing_gate_functions'::text AS section,
    ('public.' || expected.function_name)::text AS object_name,
    jsonb_build_object(
      'overloads', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'identity_arguments', pg_get_function_identity_arguments(p.oid),
            'return_type', pg_get_function_result(p.oid),
            'security_definer', p.prosecdef,
            'owner', owner_role.rolname,
            'settings', p.proconfig,
            'definition_md5', md5(pg_get_functiondef(p.oid))
          )
          ORDER BY pg_get_function_identity_arguments(p.oid)
        )
        FROM pg_proc AS p
        JOIN pg_namespace AS function_namespace ON function_namespace.oid = p.pronamespace
        JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
        WHERE function_namespace.nspname = 'public'
          AND p.proname = expected.function_name
      ), '[]'::jsonb)
    ) AS details
  FROM gate_functions AS expected
),
role_rows AS (
  SELECT
    'required_roles'::text AS section,
    expected.role_name::text AS object_name,
    jsonb_build_object(
      'present', role.oid IS NOT NULL,
      'can_login', role.rolcanlogin,
      'superuser', role.rolsuper,
      'bypass_rls', role.rolbypassrls
    ) AS details
  FROM required_roles AS expected
  LEFT JOIN pg_roles AS role ON role.rolname = expected.role_name
),
privilege_rows AS (
  SELECT
    'table_privileges'::text AS section,
    format('public.%I|%s', relation.relname, role.rolname) AS object_name,
    jsonb_build_object(
      'select', has_table_privilege(role.oid, relation.oid, 'SELECT'),
      'insert', has_table_privilege(role.oid, relation.oid, 'INSERT'),
      'update', has_table_privilege(role.oid, relation.oid, 'UPDATE'),
      'delete', has_table_privilege(role.oid, relation.oid, 'DELETE'),
      'trigger', has_table_privilege(role.oid, relation.oid, 'TRIGGER')
    ) AS details
  FROM pg_class AS relation
  JOIN pg_namespace AS n ON n.oid = relation.relnamespace
  CROSS JOIN required_roles AS expected
  JOIN pg_roles AS role ON role.rolname = expected.role_name
  WHERE n.nspname = 'public'
    AND relation.relname IN (
      'products', 'offers', 'price_history', 'price_analysis',
      'price_update_log', 'brands', 'categories', 'subcategories', 'supermarkets'
    )
),
sequence_rows AS (
  SELECT
    'sequence_privileges'::text AS section,
    format('%I.%I|%s', sequence_namespace.nspname, sequence.relname, role.rolname) AS object_name,
    jsonb_build_object(
      'owned_by', format('public.%I.%I', table_relation.relname, attribute.attname),
      'owner', sequence_owner.rolname,
      'default_expression', pg_get_expr(defaults.adbin, defaults.adrelid),
      'usage', has_sequence_privilege(role.oid, sequence.oid, 'USAGE'),
      'select', has_sequence_privilege(role.oid, sequence.oid, 'SELECT'),
      'update', has_sequence_privilege(role.oid, sequence.oid, 'UPDATE')
    ) AS details
  FROM pg_class AS sequence
  JOIN pg_namespace AS sequence_namespace ON sequence_namespace.oid = sequence.relnamespace
  JOIN pg_roles AS sequence_owner ON sequence_owner.oid = sequence.relowner
  JOIN pg_depend AS dependency
    ON dependency.classid = 'pg_class'::regclass
   AND dependency.objid = sequence.oid
   AND dependency.refclassid = 'pg_class'::regclass
   AND dependency.deptype IN ('a', 'i')
  JOIN pg_class AS table_relation ON table_relation.oid = dependency.refobjid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
  JOIN required_tables AS rt ON rt.table_name = table_relation.relname
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = table_relation.oid
   AND attribute.attnum = dependency.refobjsubid
  LEFT JOIN pg_attrdef AS defaults
    ON defaults.adrelid = table_relation.oid
   AND defaults.adnum = attribute.attnum
  CROSS JOIN required_roles AS expected
  JOIN pg_roles AS role ON role.rolname = expected.role_name
  WHERE sequence_namespace.nspname = 'public'
    AND table_namespace.nspname = 'public'
    AND sequence.relkind = 'S'
),
state_table_row AS (
  SELECT
    'existing_gate_state'::text AS section,
    'public.catalog_maintenance_state'::text AS object_name,
    jsonb_build_object(
      'present', c.oid IS NOT NULL,
      'row_security_enabled', c.relrowsecurity,
      'owner', owner_role.rolname
    ) AS details
  FROM (SELECT 1) AS singleton
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = 'catalog_maintenance_state'
  LEFT JOIN pg_roles AS owner_role ON owner_role.oid = c.relowner
)
SELECT section, object_name, details
FROM (
  SELECT * FROM environment_row
  UNION ALL SELECT * FROM table_rows
  UNION ALL SELECT * FROM policy_rows
  UNION ALL SELECT * FROM column_rows
  UNION ALL SELECT * FROM constraint_rows
  UNION ALL SELECT * FROM trigger_rows
  UNION ALL SELECT * FROM expected_trigger_rows
  UNION ALL SELECT * FROM function_rows
  UNION ALL SELECT * FROM role_rows
  UNION ALL SELECT * FROM privilege_rows
  UNION ALL SELECT * FROM sequence_rows
  UNION ALL SELECT * FROM state_table_row
) AS report
ORDER BY section, object_name;

COMMIT;
