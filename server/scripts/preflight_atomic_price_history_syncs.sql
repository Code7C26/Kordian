BEGIN TRANSACTION READ ONLY;

WITH expected_tables(table_name) AS (
  VALUES
    ('products'),
    ('offers'),
    ('price_history'),
    ('price_update_log'),
    ('carrefour_sync_state'),
    ('catalog_maintenance_state')
),
expected_columns(table_name, column_name) AS (
  VALUES
    ('products', 'id'),
    ('products', 'source'),
    ('products', 'source_product_id'),
    ('products', 'ean'),
    ('offers', 'id'),
    ('offers', 'product_id'),
    ('offers', 'supermarket'),
    ('offers', 'cash_price'),
    ('offers', 'list_price'),
    ('offers', 'source_product_id'),
    ('offers', 'source_sku'),
    ('offers', 'source_url'),
    ('price_history', 'product_id'),
    ('price_history', 'offer_id'),
    ('price_history', 'cash_price'),
    ('price_history', 'source'),
    ('price_update_log', 'id'),
    ('price_update_log', 'admin_username'),
    ('price_update_log', 'filters'),
    ('price_update_log', 'percentage'),
    ('price_update_log', 'products_updated'),
    ('price_update_log', 'changes'),
    ('carrefour_sync_state', 'sync_key'),
    ('carrefour_sync_state', 'last_offer_id'),
    ('carrefour_sync_state', 'updated_at')
),
expected_column_types(table_name, column_name, data_type) AS (
  VALUES
    ('products', 'source', 'text'),
    ('products', 'source_product_id', 'text'),
    ('products', 'ean', 'text'),
    ('offers', 'cash_price', 'numeric'),
    ('offers', 'list_price', 'numeric'),
    ('offers', 'source_product_id', 'text'),
    ('offers', 'source_sku', 'text'),
    ('offers', 'source_url', 'text'),
    ('price_history', 'cash_price', 'numeric'),
    ('price_history', 'source', 'text'),
    ('price_update_log', 'id', 'uuid'),
    ('price_update_log', 'admin_username', 'text'),
    ('price_update_log', 'filters', 'jsonb'),
    ('price_update_log', 'percentage', 'numeric'),
    ('price_update_log', 'products_updated', 'integer'),
    ('price_update_log', 'changes', 'jsonb'),
    ('carrefour_sync_state', 'sync_key', 'text'),
    ('carrefour_sync_state', 'last_offer_id', 'integer'),
    ('carrefour_sync_state', 'updated_at', 'timestamp with time zone')
),
expected_gate_triggers(table_name, trigger_name, function_name) AS (
  VALUES
    ('offers', 'catalog_maintenance_offers_guard', 'guard_offer_catalog_write'),
    ('price_history', 'catalog_maintenance_price_history_guard', 'guard_product_history_write'),
    ('price_update_log', 'catalog_maintenance_price_update_log_guard', 'guard_price_update_log_write')
),
expected_rls_tables(table_name) AS (
  VALUES
    ('offers'),
    ('price_history'),
    ('price_update_log'),
    ('carrefour_sync_state'),
    ('catalog_maintenance_state')
),
service_role_lookup AS (
  SELECT to_regrole('service_role')::oid AS role_id
),
checks(name, passed, details) AS (
  SELECT
    'target_database_and_role',
    current_database() = 'postgres' AND current_user = 'postgres',
    jsonb_build_object(
      'database', current_database(),
      'executed_as', current_user,
      'server_version', current_setting('server_version')
    )
  UNION ALL
  SELECT
    'prerequisite_tables',
    count(*) FILTER (WHERE to_regclass(format('public.%I', expected.table_name)) IS NOT NULL)
      = (SELECT count(*) FROM expected_tables),
    jsonb_build_object(
      'present', COALESCE(array_agg(expected.table_name ORDER BY expected.table_name)
        FILTER (WHERE to_regclass(format('public.%I', expected.table_name)) IS NOT NULL), ARRAY[]::text[]),
      'missing', COALESCE(array_agg(expected.table_name ORDER BY expected.table_name)
        FILTER (WHERE to_regclass(format('public.%I', expected.table_name)) IS NULL), ARRAY[]::text[])
    )
  FROM expected_tables AS expected
  UNION ALL
  SELECT
    'required_columns',
    count(*) FILTER (WHERE actual.column_name IS NOT NULL)
      = (SELECT count(*) FROM expected_columns),
    jsonb_build_object(
      'missing', COALESCE(array_agg(
        format('%s.%s', expected.table_name, expected.column_name)
        ORDER BY expected.table_name, expected.column_name
      ) FILTER (WHERE actual.column_name IS NULL), ARRAY[]::text[])
    )
  FROM expected_columns AS expected
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name
  UNION ALL
  SELECT
    'required_column_types',
    count(*) FILTER (WHERE actual.data_type = expected.data_type)
      = (SELECT count(*) FROM expected_column_types),
    jsonb_build_object(
      'mismatches', COALESCE(array_agg(
        format('%s.%s expected %s got %s',
          expected.table_name,
          expected.column_name,
          expected.data_type,
          COALESCE(actual.data_type, 'missing')
        )
        ORDER BY expected.table_name, expected.column_name
      ) FILTER (WHERE actual.data_type IS DISTINCT FROM expected.data_type), ARRAY[]::text[])
    )
  FROM expected_column_types AS expected
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name
  UNION ALL
  SELECT
    'carrefour_cursor_type',
    actual.data_type = 'integer',
    jsonb_build_object(
      'expected', 'integer',
      'actual', actual.data_type
    )
  FROM (SELECT 1) AS singleton
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = 'carrefour_sync_state'
   AND actual.column_name = 'last_offer_id'
  UNION ALL
  SELECT
    'service_role_exists',
    service_role_lookup.role_id IS NOT NULL,
    jsonb_build_object('present', service_role_lookup.role_id IS NOT NULL)
  FROM service_role_lookup
  UNION ALL
  SELECT
    'write_gate_function',
    to_regprocedure('public.assert_catalog_write_allowed(text)') IS NOT NULL
      AND COALESCE(has_function_privilege(
        service_role_lookup.role_id,
        to_regprocedure('public.assert_catalog_write_allowed(text)'),
        'EXECUTE'
      ), false),
    jsonb_build_object(
      'present', to_regprocedure('public.assert_catalog_write_allowed(text)') IS NOT NULL,
      'service_role_can_execute', CASE
        WHEN to_regprocedure('public.assert_catalog_write_allowed(text)') IS NOT NULL
          THEN COALESCE(has_function_privilege(
            service_role_lookup.role_id,
            to_regprocedure('public.assert_catalog_write_allowed(text)'),
            'EXECUTE'
          ), false)
        ELSE false
      END
    )
  FROM service_role_lookup
  UNION ALL
  SELECT
    'write_gate_triggers',
    count(*) FILTER (
      WHERE trigger_row.oid IS NOT NULL
        AND trigger_row.tgenabled IN ('O', 'A')
        AND trigger_row.tgfoid = to_regprocedure(format('public.%s()', expected.function_name))::oid
    ) = (SELECT count(*) FROM expected_gate_triggers),
    jsonb_build_object(
      'expected_count', (SELECT count(*) FROM expected_gate_triggers),
      'enabled_matching_count', count(*) FILTER (
        WHERE trigger_row.oid IS NOT NULL
          AND trigger_row.tgenabled IN ('O', 'A')
          AND trigger_row.tgfoid = to_regprocedure(format('public.%s()', expected.function_name))::oid
      )
    )
  FROM expected_gate_triggers AS expected
  LEFT JOIN pg_namespace AS namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_class AS relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.table_name
  LEFT JOIN pg_trigger AS trigger_row
    ON trigger_row.tgrelid = relation.oid
   AND trigger_row.tgname = expected.trigger_name
   AND NOT trigger_row.tgisinternal
  UNION ALL
  SELECT
    'rls_enabled_on_write_tables',
    count(*) FILTER (WHERE relation.relrowsecurity) = (SELECT count(*) FROM expected_rls_tables),
    jsonb_build_object(
      'missing_or_disabled', COALESCE(array_agg(expected.table_name ORDER BY expected.table_name)
        FILTER (WHERE relation.oid IS NULL OR NOT relation.relrowsecurity), ARRAY[]::text[])
    )
  FROM expected_rls_tables AS expected
  LEFT JOIN pg_namespace AS namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_class AS relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.table_name
  UNION ALL
  SELECT
    'service_role_table_privileges',
    COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.products'), 'SELECT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.offers'), 'SELECT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.offers'), 'INSERT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.offers'), 'UPDATE'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_history'), 'SELECT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_history'), 'INSERT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_update_log'), 'SELECT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_update_log'), 'INSERT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.carrefour_sync_state'), 'SELECT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.carrefour_sync_state'), 'INSERT'), false)
      AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.carrefour_sync_state'), 'UPDATE'), false)
      AND COALESCE(has_schema_privilege(service_role_lookup.role_id, to_regnamespace('public'), 'USAGE'), false),
    jsonb_build_object(
      'products_select', COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.products'), 'SELECT'), false),
      'offers_select_insert_update',
        COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.offers'), 'SELECT'), false)
          AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.offers'), 'INSERT'), false)
          AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.offers'), 'UPDATE'), false),
      'price_history_select_insert',
        COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_history'), 'SELECT'), false)
          AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_history'), 'INSERT'), false),
      'price_update_log_select_insert',
        COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_update_log'), 'SELECT'), false)
          AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.price_update_log'), 'INSERT'), false),
      'carrefour_sync_state_select_insert_update',
        COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.carrefour_sync_state'), 'SELECT'), false)
          AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.carrefour_sync_state'), 'INSERT'), false)
          AND COALESCE(has_table_privilege(service_role_lookup.role_id, to_regclass('public.carrefour_sync_state'), 'UPDATE'), false),
      'public_schema_usage', COALESCE(has_schema_privilege(service_role_lookup.role_id, to_regnamespace('public'), 'USAGE'), false)
    )
  FROM service_role_lookup
  UNION ALL
  SELECT
    'service_role_bypasses_rls',
    COALESCE(role.rolbypassrls, false),
    jsonb_build_object('bypass_rls', role.rolbypassrls)
  FROM service_role_lookup
  LEFT JOIN pg_roles AS role ON role.oid = service_role_lookup.role_id
  UNION ALL
  SELECT
    'offers_id_sequence_usage',
    sequence_name IS NOT NULL
      AND COALESCE(has_sequence_privilege(
        service_role_lookup.role_id,
        to_regclass(sequence_name),
        'USAGE'
      ), false),
    jsonb_build_object(
      'sequence', sequence_name,
      'service_role_usage', CASE
        WHEN sequence_name IS NOT NULL
          THEN COALESCE(has_sequence_privilege(
            service_role_lookup.role_id,
            to_regclass(sequence_name),
            'USAGE'
          ), false)
        ELSE false
      END
    )
  FROM service_role_lookup
  CROSS JOIN (
    SELECT CASE
      WHEN to_regclass('public.offers') IS NOT NULL
        THEN pg_get_serial_sequence('public.offers', 'id')
      ELSE NULL
    END AS sequence_name
  ) AS sequence_check
  UNION ALL
  SELECT
    'write_gate_allows_new_sources',
    to_regprocedure('public.guard_price_update_log_write()') IS NOT NULL
      AND position(
        'disco_public_search' IN pg_get_functiondef(
          to_regprocedure('public.guard_price_update_log_write()')
        )
      ) > 0
      AND position(
        'carrefour_sync' IN pg_get_functiondef(
          to_regprocedure('public.guard_price_update_log_write()')
        )
      ) > 0,
    jsonb_build_object(
      'disco_public_search_allowed', CASE
        WHEN to_regprocedure('public.guard_price_update_log_write()') IS NOT NULL
          THEN position(
            'disco_public_search' IN pg_get_functiondef(
              to_regprocedure('public.guard_price_update_log_write()')
            )
          ) > 0
        ELSE false
      END,
      'carrefour_sync_allowed', CASE
        WHEN to_regprocedure('public.guard_price_update_log_write()') IS NOT NULL
          THEN position(
            'carrefour_sync' IN pg_get_functiondef(
              to_regprocedure('public.guard_price_update_log_write()')
            )
          ) > 0
        ELSE false
      END
    )
  UNION ALL
  SELECT
    'new_rpc_functions_not_already_installed',
    to_regprocedure('public.apply_catalog_disco_public_search_sync(jsonb,jsonb,jsonb)') IS NULL
      AND to_regprocedure('public.apply_catalog_carrefour_price_sync(jsonb,integer,jsonb)') IS NULL,
    jsonb_build_object(
      'disco_rpc_present',
        to_regprocedure('public.apply_catalog_disco_public_search_sync(jsonb,jsonb,jsonb)') IS NOT NULL,
      'carrefour_rpc_present',
        to_regprocedure('public.apply_catalog_carrefour_price_sync(jsonb,integer,jsonb)') IS NOT NULL
    )
)
SELECT name, passed, details
FROM checks
ORDER BY name;

COMMIT;
