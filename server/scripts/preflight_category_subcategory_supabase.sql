-- AR-PRICE category/subcategory integrity preflight.
-- READ ONLY: the file contains one executable SELECT and returns one result
-- grid in Supabase SQL Editor. Each check is one row; details are JSONB.
-- Do not execute the migration until all FAILs and WARNs have been reviewed.
--
-- PostgreSQL cannot conditionally bind a static table reference when that
-- relation is absent. The fixed, read-only data audit is therefore invoked
-- through query_to_xml only after catalog checks confirm every required
-- relation and column exists. If prerequisites are missing, each data check
-- returns WARN with the missing prerequisites instead of aborting the query.
-- No user-supplied SQL is executed by query_to_xml. The nested query is a
-- source-code literal containing only SELECT/CTE/VALUES operations. JSONB is
-- serialized to text, escaped as XML character data by query_to_xml, decoded
-- by XMLTABLE, then cast back to JSONB; this preserves JSON values as one
-- structured details column.
--
-- The 14 historical UUID/category pairs below are copied from the audit
-- request. Their presence, parent category, product count, and comparable
-- group count are checked individually in the historical-subcategory diagnostic.

WITH
expected_tables(table_name) AS (
  VALUES
    ('categories'),
    ('subcategories'),
    ('products'),
    ('comparable_groups')
),
table_rows AS (
  SELECT e.table_name,
         rel.oid IS NOT NULL AS table_exists,
         CASE rel.relkind
           WHEN 'r' THEN 'table'
           WHEN 'p' THEN 'partitioned table'
           WHEN 'v' THEN 'view'
           WHEN 'm' THEN 'materialized view'
           ELSE rel.relkind::text
         END AS relation_kind,
         CASE
           WHEN rel.oid IS NULL THEN format('MISSING: public.%I', e.table_name)
           WHEN rel.relkind NOT IN ('r', 'p')
             THEN format('WRONG RELATION KIND: public.%I is %s', e.table_name, rel.relkind)
           ELSE 'PRESENT'
         END AS diagnostic
  FROM expected_tables AS e
  LEFT JOIN pg_namespace AS ns ON ns.nspname = 'public'
  LEFT JOIN pg_class AS rel
    ON rel.relnamespace = ns.oid
   AND rel.relname = e.table_name
),
requested_signatures(signature) AS (
  VALUES
    ('public.update_catalog_product_classification(integer, uuid)'),
    ('public.update_catalog_product_classification(bigint, uuid)'),
    ('public.update_catalog_subcategory(uuid, text, uuid)'),
    ('public.delete_catalog_subcategory(uuid)')
),
historical_subcategory_reference(subcategory_uuid, expected_category_uuid) AS (
  VALUES
    ('04fa2822-53a5-4eed-935e-46b295ff52f4'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
    ('057d6abb-55d3-4fd0-97ba-7e2708eb1f5c'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
    ('266928d5-a799-4f37-91ab-b5c181db9e16'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
    ('2f0ac9b8-88d6-458c-9d63-27409189b811'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
    ('2f66dcdc-057e-4dda-a6e8-15c446b1a9e0'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
    ('6962d234-261b-4972-b703-09cb0d255c0d'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
    ('9734cfad-74c7-4a21-af93-ce233cb08731'::uuid, '73d4461c-205c-4673-84b2-7772b6fc6e6c'::uuid),
    ('97613785-c6bd-4398-99ca-8f509dcf277d'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
    ('ae5828fa-9d1e-4879-bf60-60452163e92e'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
    ('b3765428-02ab-4a30-8967-9d354b187d6e'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
    ('ca527dfe-2455-4dbd-9985-94e26e9b05af'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
    ('cb305ca0-b1e2-45e0-9626-11d98bb7dfde'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
    ('f9f498ec-d418-48c3-986e-76ea431396d9'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
    ('ff7025c0-8ecd-4e80-904d-1e9454ee4c45'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid)
),
requested_rpc_rows AS (
  SELECT r.signature,
         p.oid IS NOT NULL AS function_exists,
         CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END AS full_definition,
         CASE WHEN p.oid IS NOT NULL THEN pg_get_function_identity_arguments(p.oid) END
           AS argument_types_and_order,
         CASE WHEN p.oid IS NOT NULL THEN pg_get_function_result(p.oid) END AS return_type,
         CASE WHEN p.oid IS NOT NULL THEN
           CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END
         END AS security_mode,
         CASE WHEN p.oid IS NOT NULL THEN p.proconfig END AS function_settings,
         CASE WHEN p.oid IS NOT NULL THEN pg_get_userbyid(p.proowner) END AS owner,
         CASE WHEN p.oid IS NOT NULL THEN p.proacl END AS raw_acl,
         CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon', p.oid, 'EXECUTE') END
           AS anon_effective_execute,
         CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') END
           AS authenticated_effective_execute,
         CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('service_role', p.oid, 'EXECUTE') END
           AS service_role_effective_execute,
         CASE WHEN p.oid IS NOT NULL THEN EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
           WHERE acl.grantee = 0
             AND acl.privilege_type = 'EXECUTE'
         ) END AS public_execute_granted
  FROM requested_signatures AS r
  LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(r.signature)
),
rpc_overloads AS (
  SELECT p.oid::regprocedure::text AS overload_signature,
         pg_get_function_identity_arguments(p.oid) AS argument_types_and_order,
         pg_get_function_result(p.oid) AS return_type,
         p.prosecdef AS security_definer,
         p.proconfig AS function_settings,
         pg_get_userbyid(p.proowner) AS owner,
         p.proacl AS raw_acl
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'update_catalog_product_classification',
      'update_catalog_subcategory',
      'delete_catalog_subcategory'
    )
),
target_functions AS (
  SELECT p.oid
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'update_catalog_product_classification',
      'update_catalog_subcategory',
      'delete_catalog_subcategory'
    )
),
proc_catalog AS (
  SELECT c.oid
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'pg_catalog'
    AND c.relname = 'pg_proc'
),
dependency_rows AS (
  SELECT 'object depends on RPC' AS dependency_direction,
         pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
         pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced_object,
         d.deptype AS dependency_type
  FROM pg_depend AS d
  JOIN target_functions AS f
    ON d.refclassid = (SELECT oid FROM proc_catalog)
   AND d.refobjid = f.oid
  UNION ALL
  SELECT 'RPC depends on object' AS dependency_direction,
         pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
         pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced_object,
         d.deptype AS dependency_type
  FROM pg_depend AS d
  JOIN target_functions AS f
    ON d.classid = (SELECT oid FROM proc_catalog)
   AND d.objid = f.oid
),
legacy_rpc_rows AS (
  SELECT p.oid::regprocedure::text AS rpc_signature,
         pg_get_functiondef(p.oid) AS full_definition,
         pg_get_function_identity_arguments(p.oid) AS argument_types_and_order,
         pg_get_function_result(p.oid) AS return_type,
         CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_mode,
         p.proconfig AS function_settings,
         pg_get_userbyid(p.proowner) AS owner,
         p.proacl AS raw_acl,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_effective_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_effective_execute,
         has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_effective_execute,
         EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
           WHERE acl.grantee = 0
             AND acl.privilege_type = 'EXECUTE'
         ) AS public_execute_granted
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'update_catalog_product_classification'
    AND oidvectortypes(p.proargtypes) = 'bigint, uuid'
),
possible_legacy_callers AS (
  SELECT p.oid::regprocedure::text AS possible_caller_signature,
         p.prokind AS routine_kind,
         pg_get_userbyid(p.proowner) AS owner,
         pg_get_functiondef(p.oid) AS full_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND p.proname <> 'update_catalog_product_classification'
    AND pg_get_functiondef(p.oid) ILIKE '%update_catalog_product_classification%'
),
trigger_rows AS (
  SELECT format('%I.%I', table_namespace.nspname, target_table.relname) AS related_table,
         trg.tgname AS trigger_name,
         trg.tgenabled AS enabled_state,
         pg_get_triggerdef(trg.oid, true) AS trigger_definition,
         function_namespace.nspname AS function_schema,
         trigger_function.proname AS function_name,
         pg_get_functiondef(trigger_function.oid) AS function_definition
  FROM pg_trigger AS trg
  JOIN pg_class AS target_table ON target_table.oid = trg.tgrelid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = target_table.relnamespace
  JOIN pg_proc AS trigger_function ON trigger_function.oid = trg.tgfoid
  JOIN pg_namespace AS function_namespace ON function_namespace.oid = trigger_function.pronamespace
  WHERE table_namespace.nspname = 'public'
    AND target_table.relname IN ('categories', 'subcategories', 'products', 'comparable_groups')
    AND NOT trg.tgisinternal
),
routine_definitions AS (
  SELECT p.oid,
         p.oid::regprocedure::text AS routine_signature,
         p.prokind AS routine_kind,
         pg_get_userbyid(p.proowner) AS owner,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
),
catalog_relations(table_name) AS (
  VALUES ('categories'), ('subcategories'), ('products'), ('comparable_groups')
),
catalog_routines AS (
  SELECT r.routine_signature,
         r.routine_kind,
         r.owner,
         array_agg(DISTINCT cr.table_name ORDER BY cr.table_name) AS related_catalog_tables,
         r.definition AS full_definition
  FROM routine_definitions AS r
  JOIN catalog_relations AS cr ON r.definition ILIKE '%' || cr.table_name || '%'
  GROUP BY r.oid, r.routine_signature, r.routine_kind, r.owner, r.definition
),
constraint_rows AS (
  SELECT c.conname AS constraint_name,
         c.contype AS constraint_type_code,
         CASE c.contype
           WHEN 'p' THEN 'PRIMARY KEY'
           WHEN 'u' THEN 'UNIQUE'
           WHEN 'f' THEN 'FOREIGN KEY'
           WHEN 'c' THEN 'CHECK'
           WHEN 'x' THEN 'EXCLUSION'
           ELSE c.contype::text
         END AS constraint_type,
         format('%I.%I', child_ns.nspname, child.relname) AS table_name,
         ARRAY(
           SELECT a.attname
           FROM unnest(c.conkey) WITH ORDINALITY AS key_col(attnum, ordinality)
           JOIN pg_attribute AS a
             ON a.attrelid = c.conrelid
            AND a.attnum = key_col.attnum
           ORDER BY key_col.ordinality
         ) AS columns_in_order,
         pg_get_constraintdef(c.oid, true) AS full_definition,
         CASE WHEN c.contype = 'f'
           THEN format('%I.%I', parent_ns.nspname, parent.relname)
         END AS referenced_table,
         CASE WHEN c.contype = 'f' THEN ARRAY(
           SELECT a.attname
           FROM unnest(c.confkey) WITH ORDINALITY AS key_col(attnum, ordinality)
           JOIN pg_attribute AS a
             ON a.attrelid = c.confrelid
            AND a.attnum = key_col.attnum
           ORDER BY key_col.ordinality
         ) END AS referenced_columns_in_order,
         CASE c.confdeltype
           WHEN 'a' THEN 'NO ACTION'
           WHEN 'r' THEN 'RESTRICT'
           WHEN 'c' THEN 'CASCADE'
           WHEN 'n' THEN 'SET NULL'
           WHEN 'd' THEN 'SET DEFAULT'
           ELSE NULL
         END AS on_delete,
         CASE c.confupdtype
           WHEN 'a' THEN 'NO ACTION'
           WHEN 'r' THEN 'RESTRICT'
           WHEN 'c' THEN 'CASCADE'
           WHEN 'n' THEN 'SET NULL'
           WHEN 'd' THEN 'SET DEFAULT'
           ELSE NULL
         END AS on_update,
         CASE c.confmatchtype
           WHEN 's' THEN 'SIMPLE'
           WHEN 'f' THEN 'FULL'
           WHEN 'p' THEN 'PARTIAL'
           ELSE NULL
         END AS match_type,
         c.convalidated AS validated,
         c.condeferrable AS deferrable,
         c.condeferred AS initially_deferred
  FROM pg_constraint AS c
  JOIN pg_class AS child ON child.oid = c.conrelid
  JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
  LEFT JOIN pg_class AS parent ON parent.oid = c.confrelid
  LEFT JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
  WHERE child_ns.nspname = 'public'
    AND child.relname IN ('categories', 'subcategories', 'products', 'comparable_groups')
),
index_rows AS (
  SELECT format('%I.%I', table_ns.nspname, tbl.relname) AS table_name,
         idx.relname AS index_name,
         pg_get_indexdef(i.indexrelid) AS full_definition,
         am.amname AS access_method,
         i.indisunique AS unique_index,
         i.indimmediate AS unique_is_immediate,
         i.indnkeyatts AS key_column_count,
         i.indnatts - i.indnkeyatts AS include_column_count,
         (
           SELECT string_agg(
             format(
               '%s: %s [opclass=%s, collation=%s]',
               key_col.ordinality,
               pg_get_indexdef(i.indexrelid, key_col.ordinality::integer, true),
               COALESCE(format('%I.%I', opc_ns.nspname, opc.opcname), '(none)'),
               CASE WHEN coll.oid IS NULL THEN '(none)'
                    ELSE format('%I.%I', coll_ns.nspname, coll.collname)
               END
             ),
             ', ' ORDER BY key_col.ordinality
           )
           FROM unnest(i.indkey) WITH ORDINALITY AS key_col(attnum, ordinality)
           LEFT JOIN unnest(i.indclass) WITH ORDINALITY AS class_col(opclass_oid, ordinality)
             USING (ordinality)
           LEFT JOIN pg_opclass AS opc ON opc.oid = class_col.opclass_oid
           LEFT JOIN pg_namespace AS opc_ns ON opc_ns.oid = opc.opcnamespace
           LEFT JOIN unnest(i.indcollation) WITH ORDINALITY AS coll_col(collation_oid, ordinality)
             USING (ordinality)
           LEFT JOIN pg_collation AS coll ON coll.oid = coll_col.collation_oid
           LEFT JOIN pg_namespace AS coll_ns ON coll_ns.oid = coll.collnamespace
           WHERE key_col.ordinality <= i.indnkeyatts
         ) AS key_columns_ordered,
         (
           SELECT string_agg(
             pg_get_indexdef(i.indexrelid, include_col.ordinality::integer, true),
             ', ' ORDER BY include_col.ordinality
           )
           FROM unnest(i.indkey) WITH ORDINALITY AS include_col(attnum, ordinality)
           WHERE include_col.ordinality > i.indnkeyatts
         ) AS include_columns_ordered,
         pg_get_expr(i.indpred, i.indrelid, true) AS predicate,
         pg_get_expr(i.indexprs, i.indrelid, true) AS expressions,
         i.indisvalid AS valid,
         i.indisready AS ready,
         i.indislive AS live
  FROM pg_index AS i
  JOIN pg_class AS tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace AS table_ns ON table_ns.oid = tbl.relnamespace
  JOIN pg_class AS idx ON idx.oid = i.indexrelid
  JOIN pg_am AS am ON am.oid = idx.relam
  WHERE table_ns.nspname = 'public'
    AND tbl.relname IN ('categories', 'subcategories', 'products', 'comparable_groups')
),
table_columns AS (
  SELECT
    (SELECT a.attnum
     FROM pg_attribute AS a
     JOIN pg_class AS t ON t.oid = a.attrelid
     JOIN pg_namespace AS n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = 'subcategories'
       AND a.attname = 'id' AND NOT a.attisdropped) AS subcategory_id_attnum,
    (SELECT a.attnum
     FROM pg_attribute AS a
     JOIN pg_class AS t ON t.oid = a.attrelid
     JOIN pg_namespace AS n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = 'subcategories'
       AND a.attname = 'category_id' AND NOT a.attisdropped) AS subcategory_category_attnum,
    (SELECT a.attnum
     FROM pg_attribute AS a
     JOIN pg_class AS t ON t.oid = a.attrelid
     JOIN pg_namespace AS n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = 'products'
       AND a.attname = 'subcategory_id' AND NOT a.attisdropped) AS product_subcategory_attnum
),
index_shapes AS (
  SELECT i.*,
         idx.relname AS index_name,
         am.amname AS access_method,
         tbl.relname AS table_name,
         ARRAY(
           SELECT key_col.attnum::smallint
           FROM unnest(i.indkey) WITH ORDINALITY AS key_col(attnum, ordinality)
           WHERE key_col.ordinality <= i.indnkeyatts
           ORDER BY key_col.ordinality
         ) AS key_attnums,
         NOT EXISTS (
           SELECT 1
           FROM unnest(i.indkey) WITH ORDINALITY AS key_col(attnum, ordinality)
           LEFT JOIN unnest(i.indclass) WITH ORDINALITY AS class_col(opclass_oid, ordinality)
             USING (ordinality)
           LEFT JOIN unnest(i.indcollation) WITH ORDINALITY AS coll_col(collation_oid, ordinality)
             USING (ordinality)
           LEFT JOIN pg_attribute AS a
             ON a.attrelid = i.indrelid
            AND a.attnum = key_col.attnum
           LEFT JOIN pg_opclass AS opc ON opc.oid = class_col.opclass_oid
           WHERE key_col.ordinality <= i.indnkeyatts
             AND (
               key_col.attnum <= 0
               OR a.attnum IS NULL
               OR opc.oid IS NULL
               OR NOT opc.opcdefault
               OR opc.opcmethod <> (SELECT relam FROM pg_class WHERE oid = i.indexrelid)
               OR opc.opcintype <> a.atttypid
               OR COALESCE(coll_col.collation_oid, 0) <> a.attcollation
             )
         ) AS default_key_semantics
  FROM pg_index AS i
  JOIN pg_class AS idx ON idx.oid = i.indexrelid
  JOIN pg_am AS am ON am.oid = idx.relam
  JOIN pg_class AS tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace AS table_ns ON table_ns.oid = tbl.relnamespace
  WHERE table_ns.nspname = 'public'
    AND tbl.relname IN ('subcategories', 'products')
),
index_assessments AS (
  SELECT s.index_name,
         s.table_name,
         s.access_method,
         s.key_attnums,
         s.indisunique AS unique_index,
         s.indimmediate AS immediate,
         s.indisvalid AS valid,
         s.indisready AS ready,
         s.indislive AS live,
         s.indpred IS NULL AS no_predicate,
         s.indpred IS NOT NULL AS is_partial,
         s.indexprs IS NULL AS no_expressions,
         s.indexprs IS NOT NULL AS has_expressions,
         s.indnatts > s.indnkeyatts AS has_include_columns,
         s.indnkeyatts = 2 AS exactly_two_key_columns,
         s.default_key_semantics,
         CASE
           WHEN s.table_name = 'subcategories'
            AND s.key_attnums = ARRAY[
              c.subcategory_id_attnum,
              c.subcategory_category_attnum
            ]::smallint[] THEN 'EXACT (id, category_id)'
           WHEN s.table_name = 'subcategories'
            AND s.key_attnums = ARRAY[
              c.subcategory_category_attnum,
              c.subcategory_id_attnum
            ]::smallint[] THEN 'INVERSE (category_id, id)'
           ELSE 'OTHER ORDER'
         END AS composite_key_order,
         CASE
           WHEN NOT s.indisvalid OR NOT s.indisready OR NOT s.indislive
             THEN 'INVALID OR INCOMPLETE INDEX'
           WHEN s.indpred IS NOT NULL THEN 'PARTIAL INDEX - NOT ACCEPTED'
           WHEN s.indexprs IS NOT NULL THEN 'EXPRESSION INDEX - NOT ACCEPTED'
           WHEN s.table_name = 'subcategories'
            AND s.key_attnums = ARRAY[
              c.subcategory_category_attnum,
              c.subcategory_id_attnum
            ]::smallint[] THEN 'INVERSE ORDER - NOT A REFERENCED KEY CANDIDATE'
           WHEN s.table_name = 'subcategories'
            AND s.key_attnums = ARRAY[
              c.subcategory_id_attnum,
              c.subcategory_category_attnum
            ]::smallint[]
            AND s.indisunique AND s.indimmediate
            AND s.access_method = 'btree'
            AND s.indnkeyatts = 2
            AND s.default_key_semantics THEN 'EXACT UNIQUE REFERENCED KEY'
           WHEN s.table_name = 'subcategories'
            AND s.key_attnums = ARRAY[
              c.subcategory_id_attnum,
              c.subcategory_category_attnum
            ]::smallint[] THEN 'INCOMPATIBLE EXACT-ORDER INDEX'
           WHEN s.table_name = 'products'
            AND s.indisvalid
            AND s.indisready
            AND s.indislive
            AND s.access_method = 'btree'
            AND s.indnkeyatts >= 1
            AND s.key_attnums[1] = c.product_subcategory_attnum
            AND s.indpred IS NULL
            AND s.indexprs IS NULL
            AND s.default_key_semantics THEN 'SUBCATEGORY LOOKUP INDEX'
           WHEN s.table_name = 'products'
            AND s.key_attnums[1] = c.product_subcategory_attnum
             THEN 'INCOMPATIBLE SUBCATEGORY-LEADING INDEX'
           ELSE 'OTHER INDEX - NOT A CANDIDATE'
         END AS conservative_assessment
  FROM index_shapes AS s
  CROSS JOIN table_columns AS c
),
column_rows AS (
  SELECT format('%I.%I', n.nspname, tbl.relname) AS table_name,
         a.attnum AS ordinal_position,
         a.attname AS column_name,
         format_type(a.atttypid, a.atttypmod) AS exact_type,
         NOT a.attnotnull AS nullable,
         pg_get_expr(d.adbin, d.adrelid, true) AS default_expression,
         CASE a.attidentity
           WHEN 'a' THEN 'GENERATED ALWAYS AS IDENTITY'
           WHEN 'd' THEN 'GENERATED BY DEFAULT AS IDENTITY'
           ELSE NULL
         END AS identity_generation,
         CASE a.attgenerated
           WHEN 's' THEN 'GENERATED STORED'
           ELSE NULL
         END AS generated_kind
  FROM pg_attribute AS a
  JOIN pg_class AS tbl ON tbl.oid = a.attrelid
  JOIN pg_namespace AS n ON n.oid = tbl.relnamespace
  LEFT JOIN pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND tbl.relname IN ('categories', 'subcategories', 'products', 'comparable_groups')
    AND a.attnum > 0
    AND NOT a.attisdropped
),
expected_columns(table_name, column_name) AS (
  VALUES
    ('categories', 'id'),
    ('subcategories', 'id'),
    ('subcategories', 'category_id'),
    ('products', 'id'),
    ('products', 'category_id'),
    ('products', 'subcategory_id'),
    ('products', 'comparable_group_id'),
    ('products', 'classification_source'),
    ('products', 'classification_confidence'),
    ('comparable_groups', 'id'),
    ('comparable_groups', 'subcategory_id')
),
expected_column_rows AS (
  SELECT e.table_name,
         e.column_name,
         tbl.oid IS NOT NULL AS table_exists,
         a.attnum IS NOT NULL AS column_exists,
         CASE WHEN a.attnum IS NOT NULL
           THEN format_type(a.atttypid, a.atttypmod)
         END AS exact_type,
         CASE WHEN a.attnum IS NOT NULL THEN NOT a.attnotnull END AS nullable
  FROM expected_columns AS e
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS tbl
    ON tbl.relnamespace = n.oid
   AND tbl.relname = e.table_name
  LEFT JOIN pg_attribute AS a
    ON a.attrelid = tbl.oid
   AND a.attname = e.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
),
required_data_columns(table_name, column_name) AS (
  VALUES
    ('categories', 'id'),
    ('categories', 'name'),
    ('subcategories', 'id'),
    ('subcategories', 'name'),
    ('subcategories', 'category_id'),
    ('products', 'id'),
    ('products', 'name'),
    ('products', 'category_id'),
    ('products', 'subcategory_id'),
    ('products', 'comparable_group_id'),
    ('products', 'classification_source'),
    ('comparable_groups', 'id'),
    ('comparable_groups', 'subcategory_id')
),
data_prerequisites AS (
  SELECT e.table_name,
         e.column_name,
         tbl.oid IS NOT NULL AS table_exists,
         a.attnum IS NOT NULL AS column_exists
  FROM required_data_columns AS e
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS tbl
    ON tbl.relnamespace = n.oid
   AND tbl.relname = e.table_name
  LEFT JOIN pg_attribute AS a
    ON a.attrelid = tbl.oid
   AND a.attname = e.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
),
data_ready AS (
  SELECT bool_and(table_exists AND column_exists) AS is_ready,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'table_name', table_name,
               'column_name', column_name,
               'table_exists', table_exists,
               'column_exists', column_exists
             )
             ORDER BY table_name, column_name
           ) FILTER (WHERE NOT table_exists OR NOT column_exists),
           '[]'::jsonb
         ) AS missing_prerequisites
  FROM data_prerequisites
),
rls_rows AS (
  SELECT format('%I.%I', n.nspname, tbl.relname) AS table_name,
         tbl.relrowsecurity AS row_level_security_enabled,
         tbl.relforcerowsecurity AS row_level_security_forced
  FROM pg_class AS tbl
  JOIN pg_namespace AS n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'public'
    AND tbl.relname IN ('categories', 'subcategories', 'products', 'comparable_groups')
),
policy_rows AS (
  SELECT schemaname,
         tablename,
         policyname,
         permissive,
         roles,
         cmd AS command,
         qual AS using_expression,
         with_check AS with_check_expression
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('categories', 'subcategories', 'products', 'comparable_groups')
),
rpc_permission_rows AS (
  SELECT p.oid::regprocedure::text AS rpc_signature,
         pg_get_userbyid(p.proowner) AS owner,
         p.proacl AS raw_acl,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_effective_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_effective_execute,
         has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_effective_execute,
         EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
           WHERE acl.grantee = 0
             AND acl.privilege_type = 'EXECUTE'
         ) AS public_execute_granted
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'update_catalog_product_classification',
      'update_catalog_subcategory',
      'delete_catalog_subcategory'
    )
),
data_xml AS (
  SELECT CASE
    WHEN ready.is_ready THEN query_to_xml(
$data_query$
(WITH
affected AS (
  SELECT p.id AS product_id, p.name, p.category_id, p.subcategory_id
  FROM public.products AS p
  WHERE p.subcategory_id IS NOT NULL AND p.category_id IS NULL
)
SELECT '5'::text AS section,
       'product_subcategory_without_category'::text AS check_name,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END::text AS status,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY product_id LIMIT 20) AS sample)
       )::text AS details,
       CASE WHEN count(*) = 0 THEN 'No products have subcategory_id without category_id.'
            ELSE 'Products have subcategory_id but category_id is NULL; this blocks integrity validation.'
       END::text AS diagnostic
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT p.id AS product_id, p.name,
         p.category_id AS product_category_id,
         p.subcategory_id,
         s.category_id AS subcategory_category_id
  FROM public.products AS p
  JOIN public.subcategories AS s ON s.id = p.subcategory_id
  WHERE p.subcategory_id IS NOT NULL
    AND p.category_id IS NOT NULL
    AND p.category_id IS DISTINCT FROM s.category_id
)
SELECT '5', 'product_category_mismatches_subcategory_parent',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY product_id LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'Every product category matches its subcategory parent.'
            ELSE 'Product category differs from the category of its subcategory.'
       END
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT p.id AS product_id, p.name, p.category_id, p.subcategory_id
  FROM public.products AS p
  LEFT JOIN public.subcategories AS s ON s.id = p.subcategory_id
  WHERE p.subcategory_id IS NOT NULL AND s.id IS NULL
)
SELECT '5', 'product_references_missing_subcategory',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY product_id LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No product references a missing subcategory.'
            ELSE 'Products reference subcategories that do not exist.'
       END
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT p.id AS product_id, p.name, p.category_id, p.subcategory_id
  FROM public.products AS p
  LEFT JOIN public.categories AS c ON c.id = p.category_id
  WHERE p.category_id IS NOT NULL AND c.id IS NULL
)
SELECT '5', 'product_references_missing_category',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY product_id LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No product references a missing category.'
            ELSE 'Products reference categories that do not exist.'
       END
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT s.id AS subcategory_id, s.name, s.category_id
  FROM public.subcategories AS s
  LEFT JOIN public.categories AS c ON c.id = s.category_id
  WHERE c.id IS NULL
)
SELECT '5', 'subcategory_references_missing_category',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY subcategory_id LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No subcategory references a missing category.'
            ELSE 'Subcategories reference categories that do not exist.'
       END
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT cg.id AS comparable_group_id, cg.subcategory_id
  FROM public.comparable_groups AS cg
  LEFT JOIN public.subcategories AS s ON s.id = cg.subcategory_id
  WHERE cg.subcategory_id IS NOT NULL AND s.id IS NULL
)
SELECT '5', 'comparable_group_references_missing_subcategory',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY comparable_group_id LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No comparable group references a missing subcategory.'
            ELSE 'Comparable groups reference subcategories that do not exist.'
       END
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT p.id AS product_id, p.name, p.comparable_group_id
  FROM public.products AS p
  LEFT JOIN public.comparable_groups AS cg ON cg.id = p.comparable_group_id
  WHERE p.comparable_group_id IS NOT NULL AND cg.id IS NULL
)
SELECT '5', 'product_references_missing_comparable_group',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY product_id LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No product references a missing comparable group.'
            ELSE 'Products reference comparable groups that do not exist.'
       END
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT p.id AS product_id, p.name, p.classification_source
  FROM public.products AS p
  WHERE p.classification_source IS NOT NULL
    AND p.classification_source NOT IN ('automatic', 'manual')
)
SELECT '5', 'product_classification_source_outside_allowed_values',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object(
         'affected_count', count(*),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY product_id LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No non-NULL classification_source is outside automatic/manual.'
            ELSE 'Some classification_source values are outside automatic/manual.'
       END
FROM affected)
UNION ALL
SELECT '5', 'products_with_null_classification_source',
       'WARN',
       jsonb_build_object(
         'count', count(*) FILTER (WHERE p.classification_source IS NULL)
       )::text,
       'Inventory only: the original preflight defines no pass/fail threshold for NULL classification_source.'
FROM public.products AS p
UNION ALL
SELECT '5', 'subcategory_counts_by_category',
       'WARN',
       jsonb_build_object(
         'categories_with_subcategories',
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'category_id', category_id,
               'category_name', category_name,
               'subcategory_count', subcategory_count
             )
             ORDER BY category_name, category_id
           ),
           '[]'::jsonb
         )
       )::text,
       'Inventory only: preserves the original inner-join listing; categories with zero subcategories are not returned.'
FROM (
  SELECT c.id AS category_id, c.name AS category_name, count(s.id) AS subcategory_count
  FROM public.categories AS c
  JOIN public.subcategories AS s ON s.category_id = c.id
  GROUP BY c.id, c.name
) AS category_counts
UNION ALL
(WITH affected AS (
  SELECT lower(btrim(c.name)) AS normalized_name,
         count(*) AS row_count,
         array_agg(c.id ORDER BY c.id) AS category_ids,
         array_agg(c.name ORDER BY c.id) AS names
  FROM public.categories AS c
  GROUP BY lower(btrim(c.name))
  HAVING count(*) > 1
)
SELECT '5', 'duplicate_categories_by_trimmed_case_insensitive_name',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN' END,
       jsonb_build_object(
         'duplicate_groups', count(*),
         'affected_rows', COALESCE(sum(row_count), 0),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY normalized_name LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No duplicate category groups under lower(btrim(name)).'
            ELSE 'Review duplicate groups; confirm that trimmed, case-insensitive normalization is the intended comparison.'
       END
FROM affected)
UNION ALL
(WITH affected AS (
  SELECT s.category_id,
         lower(btrim(s.name)) AS normalized_name,
         count(*) AS row_count,
         array_agg(s.id ORDER BY s.id) AS subcategory_ids,
         array_agg(s.name ORDER BY s.id) AS names
  FROM public.subcategories AS s
  GROUP BY s.category_id, lower(btrim(s.name))
  HAVING count(*) > 1
)
SELECT '5', 'duplicate_subcategories_by_category_and_trimmed_case_insensitive_name',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN' END,
       jsonb_build_object(
         'duplicate_groups', count(*),
         'affected_rows', COALESCE(sum(row_count), 0),
         'examples', (SELECT jsonb_agg(to_jsonb(sample))
                      FROM (SELECT * FROM affected ORDER BY category_id, normalized_name LIMIT 20) AS sample)
       )::text,
       CASE WHEN count(*) = 0 THEN 'No duplicate subcategory groups under category_id and lower(btrim(name)).'
            ELSE 'Review duplicate groups; confirm that trimmed, case-insensitive normalization is the intended comparison.'
       END
FROM affected)
UNION ALL
SELECT '6', 'current_subcategories_without_products',
       'WARN',
       jsonb_build_object(
         'subcategories',
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'subcategory_uuid', s.id,
               'subcategory_name', s.name,
               'category_uuid', s.category_id,
               'category_name', c.name,
               'category_exists', c.id IS NOT NULL,
               'product_count', 0,
               'comparable_group_count',
                 (SELECT count(*) FROM public.comparable_groups AS cg WHERE cg.subcategory_id = s.id),
               'subcategory_exists', true
             )
             ORDER BY s.id
           ),
           '[]'::jsonb
         )
       )::text,
       'Current inventory only; this does not verify the historical 14 UUIDs.'
FROM public.subcategories AS s
LEFT JOIN public.categories AS c ON c.id = s.category_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.products AS p WHERE p.subcategory_id = s.id
)
UNION ALL
SELECT '6', 'currently_empty_subcategory_count',
       CASE
         WHEN historical.failed_count > 0 THEN 'FAIL'
         ELSE 'WARN'
       END,
       jsonb_build_object(
         'currently_empty_subcategory_count', current_empty.current_count,
         'historical_expected_count', historical.expected_count,
         'historical_verified_count', historical.verified_count,
         'historical_failed_count', historical.failed_count,
         'historical_comparable_group_count', historical.comparable_group_count,
         'historical_subcategories_with_comparable_groups',
           historical.subcategories_with_comparable_groups,
         'historical_subcategories', historical.subcategories
       )::text,
       CASE
         WHEN historical.subcategories_with_comparable_groups > 0
           THEN 'One or more historical subcategories has comparable groups. Deleting such a subcategory could cascade-delete those groups; review before any deletion.'
         WHEN historical.failed_count > 0
           THEN 'One or more historical subcategories is missing, has a different category, or has associated products.'
         ELSE 'All 14 historical UUIDs were checked for existence, expected category, zero associated products, and comparable-group associations. The current empty-subcategory inventory remains informational and should be reviewed.'
       END
FROM (
  SELECT count(*) AS current_count
  FROM public.subcategories AS s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.products AS p WHERE p.subcategory_id = s.id
  )
) AS current_empty
CROSS JOIN LATERAL (
  WITH historical(subcategory_uuid, expected_category_uuid) AS (
    VALUES
      ('04fa2822-53a5-4eed-935e-46b295ff52f4'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
      ('057d6abb-55d3-4fd0-97ba-7e2708eb1f5c'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
      ('266928d5-a799-4f37-91ab-b5c181db9e16'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
      ('2f0ac9b8-88d6-458c-9d63-27409189b811'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
      ('2f66dcdc-057e-4dda-a6e8-15c446b1a9e0'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
      ('6962d234-261b-4972-b703-09cb0d255c0d'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
      ('9734cfad-74c7-4a21-af93-ce233cb08731'::uuid, '73d4461c-205c-4673-84b2-7772b6fc6e6c'::uuid),
      ('97613785-c6bd-4398-99ca-8f509dcf277d'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
      ('ae5828fa-9d1e-4879-bf60-60452163e92e'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
      ('b3765428-02ab-4a30-8967-9d354b187d6e'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
      ('ca527dfe-2455-4dbd-9985-94e26e9b05af'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
      ('cb305ca0-b1e2-45e0-9626-11d98bb7dfde'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid),
      ('f9f498ec-d418-48c3-986e-76ea431396d9'::uuid, '149ff9d2-95c3-4623-89c1-4fbce689adea'::uuid),
      ('ff7025c0-8ecd-4e80-904d-1e9454ee4c45'::uuid, '5691d3e9-968b-4ec8-9f2a-215cf200fb01'::uuid)
  ),
  inspected AS (
    SELECT h.subcategory_uuid,
           h.expected_category_uuid,
           s.id IS NOT NULL AS subcategory_exists,
           s.category_id AS actual_category_uuid,
           s.category_id = h.expected_category_uuid AS category_matches,
           COALESCE(products.product_count, 0) AS product_count,
           COALESCE(comparable_groups.comparable_group_count, 0) AS comparable_group_count,
           COALESCE(
             s.id IS NOT NULL
               AND s.category_id = h.expected_category_uuid
               AND COALESCE(products.product_count, 0) = 0
               AND COALESCE(comparable_groups.comparable_group_count, 0) = 0,
             false
           ) AS passes
    FROM historical AS h
    LEFT JOIN public.subcategories AS s ON s.id = h.subcategory_uuid
    LEFT JOIN LATERAL (
      SELECT count(*) AS product_count
      FROM public.products AS p
      WHERE p.subcategory_id = h.subcategory_uuid
    ) AS products ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS comparable_group_count
      FROM public.comparable_groups AS cg
      WHERE cg.subcategory_id = h.subcategory_uuid
    ) AS comparable_groups ON true
  )
  SELECT count(*) AS expected_count,
         count(*) FILTER (WHERE passes) AS verified_count,
         count(*) FILTER (WHERE NOT passes) AS failed_count,
         COALESCE(sum(comparable_group_count), 0) AS comparable_group_count,
         count(*) FILTER (WHERE comparable_group_count > 0)
           AS subcategories_with_comparable_groups,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'subcategory_uuid', subcategory_uuid,
               'expected_category_uuid', expected_category_uuid,
               'exists', subcategory_exists,
               'actual_category_uuid', actual_category_uuid,
               'category_matches', COALESCE(category_matches, false),
               'product_count', product_count,
               'comparable_group_count', comparable_group_count,
               'status', CASE WHEN passes THEN 'PASS' ELSE 'FAIL' END
             )
             ORDER BY subcategory_uuid
           ),
           '[]'::jsonb
         ) AS subcategories
  FROM inspected
) AS historical
$data_query$,
      true,
      false,
      ''
    )
    ELSE '<table/>'::xml
  END AS xml_result
  FROM data_ready AS ready
),
data_rows AS (
  SELECT x.section,
         x.check_name,
         x.status,
         x.details::jsonb AS details,
         x.diagnostic
  FROM data_xml AS dx
  CROSS JOIN LATERAL XMLTABLE(
    '/table/row'
    PASSING dx.xml_result
    COLUMNS
      section text PATH 'section',
      check_name text PATH 'check_name',
      status text PATH 'status',
      details text PATH 'details',
      diagnostic text PATH 'diagnostic'
  ) AS x
  UNION ALL
  SELECT missing.section,
         missing.check_name,
         'WARN',
         jsonb_build_object(
           'verified', false,
           'missing_prerequisites', ready.missing_prerequisites,
           'historical_verification',
           CASE WHEN missing.check_name = 'currently_empty_subcategory_count'
             THEN jsonb_build_object(
               'verified', false,
               'expected_count', (
                 SELECT count(*) FROM historical_subcategory_reference
               ),
               'comparable_group_count', NULL,
               'subcategories_with_comparable_groups', NULL,
               'subcategories', (
                 SELECT jsonb_agg(
                   jsonb_build_object(
                     'subcategory_uuid', subcategory_uuid,
                     'expected_category_uuid', expected_category_uuid,
                     'exists', NULL,
                     'actual_category_uuid', NULL,
                     'category_matches', NULL,
                     'product_count', NULL,
                     'comparable_group_count', NULL,
                     'status', 'WARN'
                   )
                   ORDER BY subcategory_uuid
                 )
                 FROM historical_subcategory_reference
               )
             )
             ELSE NULL
           END
         ),
         'Not evaluated because one or more required relations/columns are missing; see the prerequisites in details. The table/column inventory reports the blocking condition.'
  FROM data_ready AS ready
  CROSS JOIN (
    VALUES
      ('5', 'product_subcategory_without_category'),
      ('5', 'product_category_mismatches_subcategory_parent'),
      ('5', 'product_references_missing_subcategory'),
      ('5', 'product_references_missing_category'),
      ('5', 'subcategory_references_missing_category'),
      ('5', 'comparable_group_references_missing_subcategory'),
      ('5', 'product_references_missing_comparable_group'),
      ('5', 'product_classification_source_outside_allowed_values'),
      ('5', 'products_with_null_classification_source'),
      ('5', 'subcategory_counts_by_category'),
      ('5', 'duplicate_categories_by_trimmed_case_insensitive_name'),
      ('5', 'duplicate_subcategories_by_category_and_trimmed_case_insensitive_name'),
      ('6', 'current_subcategories_without_products'),
      ('6', 'currently_empty_subcategory_count')
  ) AS missing(section, check_name)
  WHERE NOT ready.is_ready
),
checks AS (
  SELECT '0'::text AS section,
         'required_table_existence'::text AS check_name,
         CASE WHEN bool_and(table_exists AND relation_kind IN ('table', 'partitioned table'))
              THEN 'PASS' ELSE 'FAIL' END::text AS status,
         jsonb_build_object(
           'relations',
           COALESCE(
             jsonb_agg(to_jsonb(t) ORDER BY table_name),
             '[]'::jsonb
           )
         ) AS details,
         CASE WHEN bool_and(table_exists AND relation_kind IN ('table', 'partitioned table'))
              THEN 'All four required public relations exist as tables.'
              ELSE 'One or more required relations are missing or are not tables; data checks are withheld when prerequisites are incomplete.'
         END::text AS diagnostic
  FROM table_rows AS t

  UNION ALL
  SELECT '1', 'requested_rpc_signatures_definitions_acl',
         'WARN',
         jsonb_build_object(
           'signatures',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY signature) FROM requested_rpc_rows AS r), '[]'::jsonb)
         ),
         'Inventory only: compare signatures, definitions, SECURITY mode, settings, owner, raw ACL, and effective EXECUTE privileges with the migration/backend contract.'

  UNION ALL
  SELECT '1', 'all_rpc_overloads',
         'WARN',
         jsonb_build_object(
           'overloads',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY overload_signature) FROM rpc_overloads AS r), '[]'::jsonb)
         ),
         'Inventory only: includes every public overload of the three RPC names; an empty list is not proof that external clients do not call an endpoint.'

  UNION ALL
  SELECT '1', 'cataloged_rpc_dependencies',
         'WARN',
         jsonb_build_object(
           'dependencies',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY dependency_direction, dependent_object, referenced_object)
                     FROM dependency_rows AS r), '[]'::jsonb)
         ),
         'Catalog dependencies in both directions are listed. pg_depend does not reveal external PostgREST/HTTP consumers or every dynamic SQL reference.'

  UNION ALL
  SELECT '1', 'legacy_bigint_rpc_guard',
         CASE WHEN EXISTS (SELECT 1 FROM legacy_rpc_rows) THEN 'FAIL' ELSE 'PASS' END,
         jsonb_build_object(
           'legacy_bigint_rpc',
           COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM legacy_rpc_rows AS r), '[]'::jsonb)
         ),
         CASE WHEN EXISTS (SELECT 1 FROM legacy_rpc_rows)
              THEN 'The legacy bigint RPC exists and blocks the migration guard; inspect its definition, ACL, dependencies, and external consumers.'
              ELSE 'The catalog query verified that the bigint signature is absent; this does not prove that no external client depends on it.'
         END

  UNION ALL
  SELECT '1', 'possible_database_callers_of_legacy_rpc',
         'WARN',
         jsonb_build_object(
           'possible_callers',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY possible_caller_signature)
                     FROM possible_legacy_callers AS r), '[]'::jsonb)
         ),
         'Textual scan of public function/procedure definitions only; matches are possible references, not proof of invocation, and no match cannot rule out external clients.'

  UNION ALL
  SELECT '1', 'catalog_table_triggers_and_trigger_functions',
         'WARN',
         jsonb_build_object(
           'triggers',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY related_table, trigger_name)
                     FROM trigger_rows AS r), '[]'::jsonb)
         ),
         'Inventory only: review enabled state, trigger definition, and function body, including catalog_offer_price_summary_product_source. No trigger is executed.'

  UNION ALL
  SELECT '1', 'public_routines_referencing_catalog_tables',
         'WARN',
         jsonb_build_object(
           'routines',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY routine_signature)
                     FROM catalog_routines AS r), '[]'::jsonb)
         ),
         'Textual definition scan; inspect returned bodies. It does not prove behavior or cover indirect/dynamic/external references.'

  UNION ALL
  SELECT '2', 'catalog_constraints_check_unique_foreign_key_actions',
         CASE
           WHEN NOT EXISTS (
             SELECT 1 FROM pg_constraint AS c
             JOIN pg_class AS child ON child.oid = c.conrelid
             JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
             JOIN pg_class AS parent ON parent.oid = c.confrelid
             JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
             JOIN pg_attribute AS child_col
               ON child_col.attrelid = c.conrelid AND child_col.attnum = c.conkey[1]
             JOIN pg_attribute AS parent_col
               ON parent_col.attrelid = c.confrelid AND parent_col.attnum = c.confkey[1]
             WHERE c.contype = 'f'
               AND child_ns.nspname = 'public' AND child.relname = 'comparable_groups'
               AND parent_ns.nspname = 'public' AND parent.relname = 'subcategories'
               AND child_col.attname = 'subcategory_id' AND parent_col.attname = 'id'
               AND c.conkey = ARRAY[child_col.attnum]::smallint[]
               AND c.confkey = ARRAY[parent_col.attnum]::smallint[]
               AND c.confdeltype IN ('r', 'a')
               AND c.convalidated
           ) OR NOT EXISTS (
             SELECT 1 FROM pg_constraint AS c
             JOIN pg_class AS child ON child.oid = c.conrelid
             JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
             JOIN pg_class AS parent ON parent.oid = c.confrelid
             JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
             JOIN pg_attribute AS child_col
               ON child_col.attrelid = c.conrelid AND child_col.attnum = c.conkey[1]
             JOIN pg_attribute AS parent_col
               ON parent_col.attrelid = c.confrelid AND parent_col.attnum = c.confkey[1]
             WHERE c.contype = 'f'
               AND child_ns.nspname = 'public' AND child.relname = 'products'
               AND parent_ns.nspname = 'public' AND parent.relname = 'comparable_groups'
               AND child_col.attname = 'comparable_group_id' AND parent_col.attname = 'id'
               AND c.conkey = ARRAY[child_col.attnum]::smallint[]
               AND c.confkey = ARRAY[parent_col.attnum]::smallint[]
               AND c.confdeltype = 'n'
           ) THEN 'FAIL'
           ELSE 'WARN'
         END,
         jsonb_build_object(
           'constraints',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name, constraint_type_code, constraint_name)
                     FROM constraint_rows AS r), '[]'::jsonb),
           'required_preserved_relationships',
           jsonb_build_array(
             jsonb_build_object(
               'child_table', 'public.comparable_groups',
               'child_column', 'subcategory_id',
               'referenced_table', 'public.subcategories',
               'referenced_column', 'id',
               'expected_on_delete', 'RESTRICT or NO ACTION',
               'matches', EXISTS (
                 SELECT 1 FROM pg_constraint AS c
                 JOIN pg_class AS child ON child.oid = c.conrelid
                 JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
                 JOIN pg_class AS parent ON parent.oid = c.confrelid
                 JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
                 JOIN pg_attribute AS child_col
                   ON child_col.attrelid = c.conrelid AND child_col.attnum = c.conkey[1]
                 JOIN pg_attribute AS parent_col
                   ON parent_col.attrelid = c.confrelid AND parent_col.attnum = c.confkey[1]
                 WHERE c.contype = 'f'
                   AND child_ns.nspname = 'public' AND child.relname = 'comparable_groups'
                   AND parent_ns.nspname = 'public' AND parent.relname = 'subcategories'
                   AND c.conkey = ARRAY[child_col.attnum]::smallint[]
                   AND c.confkey = ARRAY[parent_col.attnum]::smallint[]
                   AND child_col.attname = 'subcategory_id'
                   AND parent_col.attname = 'id'
                   AND c.confdeltype IN ('r', 'a')
                   AND c.convalidated
               )
             ),
             jsonb_build_object(
               'child_table', 'public.products',
               'child_column', 'comparable_group_id',
               'referenced_table', 'public.comparable_groups',
               'referenced_column', 'id',
               'expected_on_delete', 'SET NULL',
               'matches', EXISTS (
                 SELECT 1 FROM pg_constraint AS c
                 JOIN pg_class AS child ON child.oid = c.conrelid
                 JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
                 JOIN pg_class AS parent ON parent.oid = c.confrelid
                 JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
                 JOIN pg_attribute AS child_col
                   ON child_col.attrelid = c.conrelid AND child_col.attnum = c.conkey[1]
                 JOIN pg_attribute AS parent_col
                   ON parent_col.attrelid = c.confrelid AND parent_col.attnum = c.confkey[1]
                 WHERE c.contype = 'f'
                   AND child_ns.nspname = 'public' AND child.relname = 'products'
                   AND parent_ns.nspname = 'public' AND parent.relname = 'comparable_groups'
                   AND c.conkey = ARRAY[child_col.attnum]::smallint[]
                   AND c.confkey = ARRAY[parent_col.attnum]::smallint[]
                   AND child_col.attname = 'comparable_group_id'
                   AND parent_col.attname = 'id'
                   AND c.confdeltype = 'n'
               )
             )
           )
         ),
         'Inventory preserves every CHECK/UNIQUE/FK definition and action. The comparable_groups-to-subcategories FK must be validated and use RESTRICT or NO ACTION; products-to-comparable_groups must preserve SET NULL. Review all other constraints against the migration.'

  UNION ALL
  SELECT '3', 'catalog_index_inventory_definitions_keys_include_opclasses',
         'WARN',
         jsonb_build_object(
           'indexes',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name, index_name)
                     FROM index_rows AS r), '[]'::jsonb)
         ),
         'Inventory only: details include key order, INCLUDE columns, access method, opclasses, collations, predicate, expressions, and valid/ready/live state.'

  UNION ALL
  SELECT '3', 'migration_index_candidate_compatibility',
         CASE
           WHEN NOT EXISTS (
             SELECT 1 FROM table_rows
             WHERE table_name IN ('subcategories', 'products')
               AND table_exists
           ) OR (SELECT subcategory_id_attnum FROM table_columns) IS NULL
             OR (SELECT subcategory_category_attnum FROM table_columns) IS NULL
             OR (SELECT product_subcategory_attnum FROM table_columns) IS NULL
             THEN 'FAIL'
           WHEN EXISTS (
             SELECT 1 FROM index_shapes AS s CROSS JOIN table_columns AS c
             WHERE s.table_name = 'subcategories'
               AND s.key_attnums = ARRAY[c.subcategory_id_attnum, c.subcategory_category_attnum]::smallint[]
               AND s.indisunique AND s.indimmediate
               AND s.indisvalid AND s.indisready AND s.indislive
               AND s.indnkeyatts = 2 AND s.indpred IS NULL AND s.indexprs IS NULL
               AND s.access_method = 'btree' AND s.default_key_semantics
           )
            AND EXISTS (
             SELECT 1 FROM index_shapes AS s CROSS JOIN table_columns AS c
             WHERE s.table_name = 'products'
               AND s.indisvalid AND s.indisready AND s.indislive
               AND s.indnkeyatts >= 1 AND s.indpred IS NULL AND s.indexprs IS NULL
               AND s.access_method = 'btree'
               AND s.key_attnums[1] = c.product_subcategory_attnum
               AND s.default_key_semantics
           ) THEN 'PASS'
           ELSE 'WARN'
         END,
         jsonb_build_object(
           'assessments',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name, index_name)
                     FROM index_assessments AS r), '[]'::jsonb),
           'required_candidates',
           jsonb_build_object(
             'subcategories_id_category_id_unique_immediate_btree',
             EXISTS (
               SELECT 1 FROM index_shapes AS s CROSS JOIN table_columns AS c
               WHERE s.table_name = 'subcategories'
                 AND s.key_attnums = ARRAY[c.subcategory_id_attnum, c.subcategory_category_attnum]::smallint[]
                 AND s.indisunique AND s.indimmediate
                 AND s.indisvalid AND s.indisready AND s.indislive
                 AND s.indnkeyatts = 2 AND s.indpred IS NULL AND s.indexprs IS NULL
                 AND s.access_method = 'btree' AND s.default_key_semantics
             ),
             'products_subcategory_id_lookup_btree',
             EXISTS (
               SELECT 1 FROM index_shapes AS s CROSS JOIN table_columns AS c
               WHERE s.table_name = 'products'
                 AND s.indisvalid AND s.indisready AND s.indislive
                 AND s.indnkeyatts >= 1 AND s.indpred IS NULL AND s.indexprs IS NULL
                 AND s.access_method = 'btree'
                 AND s.key_attnums[1] = c.product_subcategory_attnum
                 AND s.default_key_semantics
             ),
             'include_columns_are_not_key_columns', true
           )
         ),
         CASE
           WHEN NOT EXISTS (
             SELECT 1 FROM table_rows
             WHERE table_name IN ('subcategories', 'products')
               AND table_exists
           ) OR (SELECT subcategory_id_attnum FROM table_columns) IS NULL
             OR (SELECT subcategory_category_attnum FROM table_columns) IS NULL
             OR (SELECT product_subcategory_attnum FROM table_columns) IS NULL
             THEN 'Required tables/columns are absent; compatibility could not be verified.'
           WHEN EXISTS (
             SELECT 1 FROM index_shapes AS s CROSS JOIN table_columns AS c
             WHERE s.table_name = 'subcategories'
               AND s.key_attnums = ARRAY[c.subcategory_id_attnum, c.subcategory_category_attnum]::smallint[]
               AND s.indisunique AND s.indimmediate
               AND s.indisvalid AND s.indisready AND s.indislive
               AND s.indnkeyatts = 2 AND s.indpred IS NULL AND s.indexprs IS NULL
               AND s.access_method = 'btree' AND s.default_key_semantics
           )
            AND EXISTS (
             SELECT 1 FROM index_shapes AS s CROSS JOIN table_columns AS c
             WHERE s.table_name = 'products'
               AND s.indisvalid AND s.indisready AND s.indislive
               AND s.indnkeyatts >= 1 AND s.indpred IS NULL AND s.indexprs IS NULL
               AND s.access_method = 'btree'
               AND s.key_attnums[1] = c.product_subcategory_attnum
               AND s.default_key_semantics
           ) THEN 'Both required index roles have compatible candidates. INCLUDE columns do not count as key columns.'
           ELSE 'At least one compatible candidate is absent. The migration should add the missing index; incompatible pre-existing indexes must remain untouched.'
         END

  UNION ALL
  SELECT '4', 'catalog_column_inventory',
         'WARN',
         jsonb_build_object(
           'columns',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name, ordinal_position)
                     FROM column_rows AS r), '[]'::jsonb)
         ),
         'Full column inventory including exact type, nullability, default, identity, and generated status; compare with the migration and application contract.'

  UNION ALL
  SELECT '4', 'migration_relevant_column_types_and_nullability',
         CASE WHEN EXISTS (
           SELECT 1 FROM expected_column_rows WHERE NOT table_exists OR NOT column_exists
         ) THEN 'FAIL' ELSE 'WARN' END,
         jsonb_build_object(
           'expected_columns',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name, column_name)
                     FROM expected_column_rows AS r), '[]'::jsonb)
         ),
         CASE WHEN EXISTS (
           SELECT 1 FROM expected_column_rows WHERE NOT table_exists OR NOT column_exists
         ) THEN 'One or more migration-relevant tables/columns are missing.'
         ELSE 'All named columns were verified, but the original preflight has no machine-readable expected type/nullability contract; compare the returned exact values with the migration.'
         END

  UNION ALL
  SELECT section, check_name, status, details, diagnostic
  FROM data_rows

  UNION ALL
  SELECT '7', 'catalog_table_rls_state',
         'WARN',
         jsonb_build_object(
           'tables',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name) FROM rls_rows AS r), '[]'::jsonb)
         ),
         'Inventory only: review enabled/forced RLS state against expected access behavior; absent table rows are visible in section 0.'

  UNION ALL
  SELECT '7', 'catalog_table_rls_policies',
         'WARN',
         jsonb_build_object(
           'policies',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY tablename, policyname) FROM policy_rows AS r), '[]'::jsonb)
         ),
         'Inventory only: review roles, command, USING, and WITH CHECK expressions. An empty array means no policies were cataloged for these tables.'

  UNION ALL
  SELECT '7', 'effective_rpc_execute_permissions_and_acl',
         'WARN',
         jsonb_build_object(
           'rpc_permissions',
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY rpc_signature) FROM rpc_permission_rows AS r), '[]'::jsonb)
         ),
         'Inventory only: includes owner, raw ACL, effective EXECUTE for anon/authenticated/service_role, and PUBLIC EXECUTE. Compare with the migration’s REVOKE/GRANT contract.'
)
SELECT section,
       check_name,
       status,
       details,
       diagnostic
FROM checks
ORDER BY section, check_name;
