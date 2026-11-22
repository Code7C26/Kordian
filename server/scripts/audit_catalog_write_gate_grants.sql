BEGIN TRANSACTION READ ONLY;

WITH
target_tables(table_name) AS (
  VALUES
    ('products'),
    ('offers'),
    ('price_history'),
    ('price_analysis'),
    ('price_update_log'),
    ('brands'),
    ('categories'),
    ('subcategories'),
    ('supermarkets'),
    ('comparable_groups'),
    ('product_price_status')
),
target_sequences(sequence_name, table_name, column_name) AS (
  VALUES
    ('products_id_seq', 'products', 'id'),
    ('offers_id_seq', 'offers', 'id')
),
target_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')
),
table_grant_rows AS (
  SELECT
    'table_privileges'::text AS section,
    format('public.%I|%s', relation.relname, role.rolname) AS object_name,
    jsonb_build_object(
      'owner', owner_role.rolname,
      'effective', jsonb_build_object(
        'select', has_table_privilege(role.oid, relation.oid, 'SELECT'),
        'insert', has_table_privilege(role.oid, relation.oid, 'INSERT'),
        'update', has_table_privilege(role.oid, relation.oid, 'UPDATE'),
        'delete', has_table_privilege(role.oid, relation.oid, 'DELETE'),
        'truncate', has_table_privilege(role.oid, relation.oid, 'TRUNCATE'),
        'references', has_table_privilege(role.oid, relation.oid, 'REFERENCES'),
        'trigger', has_table_privilege(role.oid, relation.oid, 'TRIGGER'),
        'maintain', has_table_privilege(role.oid, relation.oid, 'MAINTAIN')
      ),
      'raw_acl', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
            'grantor', grantor.rolname,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          ORDER BY acl.grantee, acl.privilege_type
        )
        FROM aclexplode(COALESCE(
          relation.relacl,
          acldefault('r', relation.relowner)
        )) AS acl
        LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
        LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
        WHERE acl.grantee = role.oid OR acl.grantee = 0
      ), '[]'::jsonb)
    ) AS details
  FROM target_tables AS expected
  JOIN pg_namespace AS n ON n.nspname = 'public'
  JOIN pg_class AS relation
    ON relation.relnamespace = n.oid
   AND relation.relname = expected.table_name
  JOIN pg_roles AS owner_role ON owner_role.oid = relation.relowner
  CROSS JOIN target_roles AS target
  JOIN pg_roles AS role ON role.rolname = target.role_name
),
schema_grant_rows AS (
  SELECT
    'schema_privileges'::text AS section,
    format('public|%s', role.rolname) AS object_name,
    jsonb_build_object(
      'owner', owner_role.rolname,
      'effective_usage', has_schema_privilege(role.oid, schema.oid, 'USAGE'),
      'effective_create', has_schema_privilege(role.oid, schema.oid, 'CREATE'),
      'raw_acl', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
            'grantor', grantor.rolname,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          ORDER BY acl.grantee, acl.privilege_type
        )
        FROM aclexplode(COALESCE(
          schema.nspacl,
          acldefault('n', schema.nspowner)
        )) AS acl
        LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
        LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
        WHERE acl.grantee = role.oid OR acl.grantee = 0
      ), '[]'::jsonb)
    ) AS details
  FROM pg_namespace AS schema
  JOIN pg_roles AS owner_role ON owner_role.oid = schema.nspowner
  CROSS JOIN target_roles AS target
  JOIN pg_roles AS role ON role.rolname = target.role_name
  WHERE schema.nspname = 'public'
),
sequence_grant_rows AS (
  SELECT
    'sequence_privileges'::text AS section,
    format('public.%I|%s', expected.sequence_name, role.rolname) AS object_name,
    jsonb_build_object(
      'present', sequence.oid IS NOT NULL,
      'owned_by', format('public.%I.%I', expected.table_name, expected.column_name),
      'owner', sequence_owner.rolname,
      'effective', CASE
        WHEN sequence.oid IS NOT NULL THEN jsonb_build_object(
          'usage', has_sequence_privilege(role.oid, sequence.oid, 'USAGE'),
          'select', has_sequence_privilege(role.oid, sequence.oid, 'SELECT'),
          'update', has_sequence_privilege(role.oid, sequence.oid, 'UPDATE')
        )
        ELSE NULL
      END,
      'raw_acl', CASE
        WHEN sequence.oid IS NOT NULL THEN COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
              'grantor', grantor.rolname,
              'privilege', acl.privilege_type,
              'grantable', acl.is_grantable
            )
            ORDER BY acl.grantee, acl.privilege_type
          )
          FROM aclexplode(COALESCE(
            sequence.relacl,
            acldefault('S', sequence.relowner)
          )) AS acl
          LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
          LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
          WHERE acl.grantee = role.oid OR acl.grantee = 0
        ), '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    ) AS details
  FROM target_sequences AS expected
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS sequence
    ON sequence.relnamespace = n.oid
   AND sequence.relname = expected.sequence_name
   AND sequence.relkind = 'S'
  LEFT JOIN pg_roles AS sequence_owner ON sequence_owner.oid = sequence.relowner
  CROSS JOIN target_roles AS target
  JOIN pg_roles AS role ON role.rolname = target.role_name
),
role_rows AS (
  SELECT
    'roles_and_memberships'::text AS section,
    target.role_name::text AS object_name,
    jsonb_build_object(
      'present', role.oid IS NOT NULL,
      'superuser', role.rolsuper,
      'bypass_rls', role.rolbypassrls,
      'memberships', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'granted_role', granted_role.rolname,
            'member', member_role.rolname,
            'admin_option', membership.admin_option
          )
          ORDER BY granted_role.rolname, member_role.rolname
        )
        FROM pg_auth_members AS membership
        JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
        JOIN pg_roles AS member_role ON member_role.oid = membership.member
        WHERE membership.member = role.oid OR membership.roleid = role.oid
      ), '[]'::jsonb)
    ) AS details
  FROM target_roles AS target
  LEFT JOIN pg_roles AS role ON role.rolname = target.role_name
)
SELECT section, object_name, details
FROM (
  SELECT * FROM table_grant_rows
  UNION ALL SELECT * FROM schema_grant_rows
  UNION ALL SELECT * FROM sequence_grant_rows
  UNION ALL SELECT * FROM role_rows
) AS report
ORDER BY section, object_name;

COMMIT;
