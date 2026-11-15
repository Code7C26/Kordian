const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')
const { test } = require('node:test')

const connectionString = process.env.CATEGORY_INTEGRITY_TEST_DATABASE_URL
const migrationPath = path.join(__dirname, 'migrations', '20261108_category_subcategory_integrity.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')
const migrationBody = migration.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '')
const correctiveDeleteMigrationPath = path.join(
  __dirname,
  'migrations',
  '20261112_delete_catalog_subcategory_rpc.sql',
)
const correctiveDeleteMigration = fs.readFileSync(correctiveDeleteMigrationPath, 'utf8')
const integrityAudit = fs.readFileSync(
  path.join(__dirname, 'scripts', 'audit_category_subcategory_integrity.sql'),
  'utf8',
)

function getTestDatabaseConfig(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('CATEGORY_INTEGRITY_TEST_DATABASE_URL must be a valid PostgreSQL URL')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('CATEGORY_INTEGRITY_TEST_DATABASE_URL must use PostgreSQL')
  }
  if (url.search || url.hash) {
    throw new Error('CATEGORY_INTEGRITY_TEST_DATABASE_URL cannot include connection overrides')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('PostgreSQL integration tests are restricted to loopback hosts; remote databases are refused')
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!/^[a-z0-9_][a-z0-9_-]*_test$/i.test(databaseName)) {
    throw new Error('PostgreSQL integration tests require a database name ending in _test')
  }
  return { databaseName }
}

test('rejects remote hosts and non-test PostgreSQL database names before connecting', () => {
  assert.deepEqual(
    getTestDatabaseConfig('postgres://tester:secret@localhost:5432/catalog_test'),
    { databaseName: 'catalog_test' },
  )
  assert.throws(
    () => getTestDatabaseConfig('postgres://tester:secret@db.example.com:5432/catalog_test'),
    /loopback hosts/,
  )
  assert.throws(
    () => getTestDatabaseConfig('postgres://tester:secret@localhost:5432/catalog'),
    /ending in _test/,
  )
  assert.throws(
    () => getTestDatabaseConfig('postgres://tester:secret@localhost:5432/catalog%2Fproduction_test'),
    /ending in _test/,
  )
  assert.throws(
    () => getTestDatabaseConfig('postgres://tester:secret@localhost:5432/catalog_test?host=db.example.com'),
    /cannot include connection overrides/,
  )
  assert.throws(
    () => getTestDatabaseConfig('postgres://tester:secret@localhost:5432/catalog_test?hostaddr=203.0.113.1'),
    /cannot include connection overrides/,
  )
})

test(
  'real migration RPCs and foreign keys preserve integrity under concurrent writes',
  { skip: !connectionString ? 'Set CATEGORY_INTEGRITY_TEST_DATABASE_URL to an empty disposable PostgreSQL database ending in _test on localhost' : false },
  async (t) => {
    const { databaseName } = getTestDatabaseConfig(connectionString)
    const admin = new Client({ connectionString })
    const writer = new Client({ connectionString })
    const observer = new Client({ connectionString })
    const connectedClients = []
    let baselineCreated = false
    let adminInTransaction = false
    let writerInTransaction = false

    async function waitForLock(applicationName) {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const { rows } = await observer.query(
          `SELECT wait_event_type
           FROM pg_stat_activity
           WHERE application_name = $1`,
          [applicationName],
        )
        if (rows.some((row) => row.wait_event_type === 'Lock')) return
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      assert.fail(`The concurrent operation did not wait for the expected catalog-row lock: ${applicationName}`)
    }

    async function beginAdminLock(subcategoryId) {
      await admin.query('BEGIN')
      adminInTransaction = true
      await admin.query('SELECT id FROM public.subcategories WHERE id = $1 FOR UPDATE', [subcategoryId])
    }

    async function beginWriter() {
      await writer.query('BEGIN')
      writerInTransaction = true
    }

    async function commitAdmin() {
      await admin.query('COMMIT')
      adminInTransaction = false
    }

    async function rollbackWriter() {
      await writer.query('ROLLBACK')
      writerInTransaction = false
    }

    async function createCancelledConcurrentIndex(indexName, categoryId) {
      await admin.query('BEGIN')
      adminInTransaction = true
      await admin.query(`
        INSERT INTO public.subcategories (id, category_id, name)
        VALUES (md5('index-build-fixture')::uuid, $1, 'index-build-fixture')
      `, [categoryId])

      const build = writer.query(`
        CREATE UNIQUE INDEX CONCURRENTLY ${indexName}
          ON public.subcategories (id, category_id)
      `).then(
        () => ({ error: null }),
        (error) => ({ error }),
      )
      const deadline = Date.now() + 10000
      let backendPid = null
      while (Date.now() < deadline) {
        const { rows } = await observer.query(`
          SELECT activity.pid
          FROM pg_stat_progress_create_index AS progress
          JOIN pg_stat_activity AS activity ON activity.pid = progress.pid
          WHERE progress.relid = 'public.subcategories'::regclass
            AND activity.query LIKE $1
            AND progress.phase IN (
              'waiting for writers before build',
              'building index',
              'waiting for writers before validation',
              'index validation: scanning index',
              'index validation: sorting tuples',
              'index validation: scanning table',
              'waiting for old snapshots'
            )
        `, [`%CREATE UNIQUE INDEX CONCURRENTLY ${indexName}%`])
        if (rows.length) {
          backendPid = rows[0].pid
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      if (!backendPid) {
        const { rows } = await observer.query(`
          SELECT pid
          FROM pg_stat_activity
          WHERE application_name = 'category_integrity_writer_test'
            AND state = 'active'
            AND query LIKE $1
        `, [`%CREATE UNIQUE INDEX CONCURRENTLY ${indexName}%`])
        if (rows.length) {
          await admin.query('SELECT pg_cancel_backend($1)', [rows[0].pid])
        }
        await admin.query('ROLLBACK')
        adminInTransaction = false
        await build
        throw new Error('Concurrent index build did not reach the expected writer-wait phase')
      }

      const { rows: cancellation } = await admin.query(
        'SELECT pg_cancel_backend($1) AS cancelled',
        [backendPid],
      )
      assert.equal(cancellation[0].cancelled, true)
      const buildResult = await build
      assert.equal(buildResult.error?.code, '57014', 'Cancel the concurrent index build after its catalog entry exists')
      await admin.query('ROLLBACK')
      adminInTransaction = false

      const { rows: invalidIndex } = await admin.query(`
        SELECT i.indisvalid, i.indisready
        FROM pg_index AS i
        JOIN pg_class AS index_class ON index_class.oid = i.indexrelid
        WHERE index_class.oid = to_regclass($1)
      `, [`public.${indexName}`])
      assert.equal(invalidIndex.length, 1, 'Cancelled concurrent build should leave an inspectable index')
      assert.equal(invalidIndex[0].indisvalid, false, 'Cancelled concurrent build must leave an invalid index')
      return invalidIndex[0]
    }

    async function callRpc(name, args) {
      const placeholders = args.map((_, index) => `$${index + 1}`).join(', ')
      const { rows } = await admin.query(`SELECT public.${name}(${placeholders}) AS result`, args)
      return rows[0].result
    }

    async function callRpcOn(client, name, args) {
      const placeholders = args.map((_, index) => `$${index + 1}`).join(', ')
      const { rows } = await client.query(`SELECT public.${name}(${placeholders}) AS result`, args)
      return rows[0].result
    }

    async function callRpcAsRole(role, name, args) {
      if (!['anon', 'authenticated', 'service_role'].includes(role)) {
        throw new Error(`Unexpected integration role: ${role}`)
      }
      await writer.query(`SET ROLE ${role}`)
      try {
        return await callRpcOn(writer, name, args)
      } finally {
        await writer.query('RESET ROLE')
      }
    }

    async function runMigrationProbe(assertion) {
      await writer.query('BEGIN')
      writerInTransaction = true
      try {
        await writer.query(migrationBody)
        await assertion(writer)
      } finally {
        await writer.query('ROLLBACK')
        writerInTransaction = false
      }
    }

    async function assertRequiredCompositeIndex(client) {
      const { rows } = await client.query(`
        SELECT count(*)::integer AS count
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_am am ON am.oid = idx.relam
        WHERE i.indrelid = 'public.subcategories'::regclass
          AND idx.relname = 'subcategories_id_category_id_key'
          AND i.indisunique AND i.indimmediate
          AND i.indisvalid AND i.indisready AND i.indislive
          AND i.indnkeyatts = 2 AND i.indpred IS NULL AND i.indexprs IS NULL
          AND am.amname = 'btree'
          AND ARRAY(
            SELECT key_column.attnum::smallint
            FROM unnest(i.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
            WHERE key_column.ordinality <= i.indnkeyatts
            ORDER BY key_column.ordinality
          ) = ARRAY[
            (SELECT attnum::smallint FROM pg_attribute
             WHERE attrelid = 'public.subcategories'::regclass AND attname = 'id'),
            (SELECT attnum::smallint FROM pg_attribute
             WHERE attrelid = 'public.subcategories'::regclass AND attname = 'category_id')
          ]::smallint[]
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(i.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
            LEFT JOIN unnest(i.indclass) WITH ORDINALITY AS class_column(opclass_oid, ordinality)
              USING (ordinality)
            LEFT JOIN unnest(i.indcollation) WITH ORDINALITY AS collation_column(collation_oid, ordinality)
              USING (ordinality)
            LEFT JOIN pg_attribute a
              ON a.attrelid = i.indrelid
             AND a.attnum = key_column.attnum
            LEFT JOIN pg_opclass opc ON opc.oid = class_column.opclass_oid
            JOIN pg_class index_relation ON index_relation.oid = i.indexrelid
            WHERE key_column.ordinality <= i.indnkeyatts
              AND (
                a.attnum IS NULL
                OR a.attnum <= 0
                OR opc.oid IS NULL
                OR collation_column.collation_oid IS NULL
                OR opc.opcmethod <> index_relation.relam
                OR NOT opc.opcdefault
                OR opc.opcintype <> a.atttypid
                OR collation_column.collation_oid <> a.attcollation
              )
          )
      `)
      if (rows[0].count !== 1) {
        const { rows: indexes } = await client.query(`
          SELECT idx.relname AS index_name,
                 i.indisunique AS unique_index,
                 i.indimmediate AS immediate,
                 i.indisvalid AS valid,
                 i.indisready AS ready,
                 i.indislive AS live,
                 i.indnkeyatts AS key_count,
                 i.indpred IS NOT NULL AS partial,
                 i.indexprs IS NOT NULL AS expression_index,
                 am.amname AS access_method,
                 ARRAY(
                   SELECT format(
                     'col=%s attnum=%s att_type=%s opclass=%s default=%s opclass_type=%s opclass_method=%s index_method=%s collation=%s attribute_collation=%s',
                     key_column.ordinality,
                     a.attnum,
                     a.atttypid::regtype,
                     opc.oid::regclass,
                     opc.opcdefault,
                     opc.opcintype::regtype,
                     opc.opcmethod::regclass,
                     index_relation.relam::regclass,
                     collation_column.collation_oid,
                     a.attcollation
                   )
                   FROM unnest(i.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
                   LEFT JOIN unnest(i.indclass) WITH ORDINALITY AS class_column(opclass_oid, ordinality)
                     USING (ordinality)
                   LEFT JOIN unnest(i.indcollation) WITH ORDINALITY AS collation_column(collation_oid, ordinality)
                     USING (ordinality)
                   LEFT JOIN pg_attribute a
                     ON a.attrelid = i.indrelid
                    AND a.attnum = key_column.attnum
                   LEFT JOIN pg_opclass opc ON opc.oid = class_column.opclass_oid
                   JOIN pg_class index_relation ON index_relation.oid = i.indexrelid
                   WHERE key_column.ordinality <= i.indnkeyatts
                   ORDER BY key_column.ordinality
                 ) AS key_semantics,
                 ARRAY(
                   SELECT key_column.attnum::smallint
                   FROM unnest(i.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
                   WHERE key_column.ordinality <= i.indnkeyatts
                   ORDER BY key_column.ordinality
                 ) AS key_attnums
          FROM pg_index i
          JOIN pg_class idx ON idx.oid = i.indexrelid
          JOIN pg_am am ON am.oid = idx.relam
          WHERE i.indrelid = 'public.subcategories'::regclass
          ORDER BY idx.relname
        `)
        assert.fail(`The required immediate exact-order unique index must exist; indexes: ${JSON.stringify(indexes)}`)
      }
    }

    try {
      await admin.connect()
      connectedClients.push(admin)
      await writer.connect()
      connectedClients.push(writer)
      await observer.connect()
      connectedClients.push(observer)

      const { rows: currentDatabase } = await admin.query('SELECT current_database() AS name')
      assert.equal(currentDatabase[0].name, databaseName)
      const { rows: serverVersion } = await admin.query('SHOW server_version_num')
      assert.equal(Math.floor(Number(serverVersion[0].server_version_num) / 10000), 14, 'Integration must run on PostgreSQL 14')
      const { rows: preexisting } = await admin.query(`
        SELECT name
        FROM (VALUES
          ('categories'),
          ('subcategories'),
          ('comparable_groups'),
          ('products'),
          ('subcategories_id_category_id_key'),
          ('products_subcategory_id_integrity_idx')
        ) AS expected(name)
        WHERE to_regclass('public.' || name) IS NOT NULL
        UNION ALL
        SELECT name
        FROM (VALUES
          ('update_catalog_subcategory(uuid,text,uuid)'),
          ('delete_catalog_subcategory(uuid)'),
          ('update_catalog_product_classification(integer,uuid)'),
          ('update_catalog_product_classification(bigint,uuid)')
        ) AS expected(name)
        WHERE to_regprocedure('public.' || name) IS NOT NULL
      `)
      assert.deepEqual(preexisting, [], 'The disposable _test database must not already contain catalog objects')

      const { rows: roles } = await admin.query(
        `SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])`,
        [['anon', 'authenticated', 'service_role']],
      )
      if (roles.length !== 3) {
        t.skip('The PostgreSQL test database must define anon, authenticated, and service_role roles')
        return
      }

      await writer.query(`SET application_name = 'category_integrity_writer_test'`)
      await admin.query(`SET application_name = 'category_integrity_admin_test'`)
      baselineCreated = true
      await admin.query(`
        CREATE TABLE public.categories (
          id uuid PRIMARY KEY,
          name text NOT NULL UNIQUE
        );
        CREATE TABLE public.subcategories (
          id uuid PRIMARY KEY,
          category_id uuid NOT NULL,
          name text NOT NULL,
          CONSTRAINT subcategories_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
          CONSTRAINT subcategories_category_id_name_key UNIQUE (category_id, name)
        );
        CREATE TABLE public.comparable_groups (
          id uuid PRIMARY KEY,
          subcategory_id uuid NOT NULL,
          name text NOT NULL,
          normalization_key text NOT NULL,
          CONSTRAINT comparable_groups_subcategory_id_fkey
            FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id) ON DELETE CASCADE,
          CONSTRAINT comparable_groups_subcategory_id_normalization_key_key
            UNIQUE (subcategory_id, normalization_key)
        );
        CREATE TABLE public.products (
          id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          name text NOT NULL,
          category_id uuid,
          subcategory_id uuid,
          comparable_group_id uuid,
          classification_source text,
          classification_confidence text,
          CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES public.categories(id),
          CONSTRAINT products_category_id_restrict_fkey
            FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT,
          CONSTRAINT products_subcategory_id_fkey
            FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id) ON DELETE SET NULL,
          CONSTRAINT products_subcategory_id_restrict_fkey
            FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id) ON DELETE RESTRICT,
          CONSTRAINT products_comparable_group_id_fkey
            FOREIGN KEY (comparable_group_id) REFERENCES public.comparable_groups(id) ON DELETE SET NULL,
          CONSTRAINT products_classification_source_check
            CHECK (classification_source IN ('automatic', 'manual'))
        );
      `)

      const categoryOne = '00000000-0000-0000-0000-000000000001'
      const categoryTwo = '00000000-0000-0000-0000-000000000002'
      const categoryThree = '00000000-0000-0000-0000-000000000003'
      const categoryFour = '00000000-0000-0000-0000-000000000004'
      const subcategoryForUpdate = '00000000-0000-0000-0000-000000000011'
      const subcategoryForDelete = '00000000-0000-0000-0000-000000000012'
      const subcategoryForGroupDelete = '00000000-0000-0000-0000-000000000021'
      const subcategoryForRollbackDelete = '00000000-0000-0000-0000-000000000022'
      const comparableGroupId = '00000000-0000-0000-0000-000000000031'
      const subcategoryForReassignment = '00000000-0000-0000-0000-000000000013'
      const legacyNullCategorySubcategory = '00000000-0000-0000-0000-000000000014'
      const subcategoryForConcurrentDelete = '00000000-0000-0000-0000-000000000015'
      const subcategoryToPreserve = '00000000-0000-0000-0000-000000000016'
      const legacyMismatchedSubcategory = '00000000-0000-0000-0000-000000000017'
      const subcategoryForConcurrentProductDelete = '00000000-0000-0000-0000-000000000018'
      const subcategoryForConcurrentCategoryDelete = '00000000-0000-0000-0000-000000000020'
      const emptySubcategoryIds = Array.from(
        { length: 14 },
        (_, index) => `00000000-0000-0000-0000-${String(100 + index).padStart(12, '0')}`,
      )

      await admin.query(
        `INSERT INTO public.categories (id, name)
         VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
        [categoryOne, 'one', categoryTwo, 'two', categoryThree, 'three', categoryFour, 'four'],
      )
      await admin.query(
        `INSERT INTO public.subcategories (id, category_id, name)
         VALUES
           ($1, $4, 'update'),
           ($2, $4, 'delete'),
           ($3, $4, 'reassign'),
           ($5, $4, 'legacy'),
           ($6, $4, 'concurrent delete'),
           ($7, $8, 'preserve empty'),
           ($9, $4, 'legacy mismatch'),
           ($10, $4, 'concurrent product delete'),
           ($11, $4, 'comparable group reference'),
           ($12, $4, 'rollback delete')`,
        [
          subcategoryForUpdate,
          subcategoryForDelete,
          subcategoryForReassignment,
          categoryOne,
          legacyNullCategorySubcategory,
          subcategoryForConcurrentDelete,
          subcategoryToPreserve,
          categoryThree,
          legacyMismatchedSubcategory,
          subcategoryForConcurrentProductDelete,
          subcategoryForGroupDelete,
          subcategoryForRollbackDelete,
        ],
      )
      await admin.query(
        `INSERT INTO public.subcategories (id, category_id, name)
         SELECT empty_id, $1, 'empty fixture ' || row_number
         FROM unnest($2::uuid[]) WITH ORDINALITY AS empty_rows(empty_id, row_number)`,
        [categoryOne, emptySubcategoryIds],
      )
      await admin.query(
        `INSERT INTO public.products (name, category_id, subcategory_id)
         VALUES ('legacy null category', NULL, $1)`,
        [legacyNullCategorySubcategory],
      )
      await admin.query(
        `INSERT INTO public.products (name, category_id, subcategory_id)
         VALUES ('legacy mismatched category', $1, $2)`,
        [categoryTwo, legacyMismatchedSubcategory],
      )
      const { rows: reassignmentProduct } = await admin.query(
        `INSERT INTO public.products (name, category_id)
         VALUES ('concurrent reassignment', $1) RETURNING id`,
        [categoryOne],
      )
      const productId = reassignmentProduct[0].id
      await admin.query(
        `INSERT INTO public.comparable_groups (id, subcategory_id, name, normalization_key)
         VALUES ($1, $2, 'group delete fixture', 'group-delete-fixture')`,
        [comparableGroupId, subcategoryForGroupDelete],
      )
      await admin.query(
        `INSERT INTO public.products (name, comparable_group_id)
         VALUES ('product linked to comparable group', $1)
         RETURNING id`,
        [comparableGroupId],
      )

      await admin.query(`
        CREATE FUNCTION public.update_catalog_product_classification(bigint, uuid)
        RETURNS jsonb
        LANGUAGE sql
        AS $$SELECT '{}'::jsonb$$;
        REVOKE ALL ON FUNCTION public.update_catalog_product_classification(bigint, uuid) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.update_catalog_product_classification(bigint, uuid) TO service_role;
      `)
      writerInTransaction = true
      await assert.rejects(
        writer.query(migration),
        (error) => /Legacy RPC update_catalog_product_classification\(bigint, uuid\) still exists/.test(error.message),
      )
      await writer.query('ROLLBACK')
      writerInTransaction = false
      const { rows: legacyFunctionAfterGuard } = await admin.query(`
        SELECT pg_get_functiondef(p.oid) AS definition,
               p.prosecdef AS security_definer,
               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_can_execute,
               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
               EXISTS (
                 SELECT 1
                 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
                 WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
               ) AS public_can_execute
        FROM pg_proc p
        WHERE p.oid = to_regprocedure(
          'public.update_catalog_product_classification(bigint, uuid)'
        )
      `)
      assert.equal(legacyFunctionAfterGuard.length, 1, 'The migration guard must preserve the legacy overload')
      assert.match(legacyFunctionAfterGuard[0].definition, /SELECT '\{\}'::jsonb/)
      assert.equal(legacyFunctionAfterGuard[0].security_definer, false)
      assert.equal(legacyFunctionAfterGuard[0].service_can_execute, true)
      assert.equal(legacyFunctionAfterGuard[0].anon_can_execute, false)
      assert.equal(legacyFunctionAfterGuard[0].public_can_execute, false)
      await admin.query('DROP FUNCTION public.update_catalog_product_classification(bigint, uuid)')

      await admin.query('BEGIN')
      adminInTransaction = true
      await admin.query('LOCK TABLE public.products IN ACCESS EXCLUSIVE MODE')
      writerInTransaction = true
      const migrationStartedAt = Date.now()
      const waitingMigration = writer.query(migration)
      await waitForLock('category_integrity_writer_test')
      await assert.rejects(
        waitingMigration,
        (error) => error.code === '55P03',
      )
      const migrationWaitDuration = Date.now() - migrationStartedAt
      assert.ok(migrationWaitDuration >= 2500, `lock_timeout should wait close to three seconds, waited ${migrationWaitDuration}ms`)
      assert.ok(migrationWaitDuration < 8000, `lock_timeout should bound the wait, waited ${migrationWaitDuration}ms`)
      await writer.query('ROLLBACK')
      writerInTransaction = false
      await admin.query('ROLLBACK')
      adminInTransaction = false
      const { rows: noPartialMigrationChanges } = await admin.query(`
        SELECT to_regclass('public.subcategories_id_category_id_key') IS NULL AS no_composite_index,
               to_regclass('public.products_subcategory_id_integrity_idx') IS NULL AS no_product_index,
               NOT EXISTS (
                 SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.products'::regclass
                   AND conname = 'products_subcategory_category_fkey'
               ) AS no_composite_fk,
               NOT EXISTS (
                 SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.products'::regclass
                   AND conname = 'products_subcategory_requires_category_check'
               ) AS no_category_check,
               to_regprocedure('public.update_catalog_subcategory(uuid, text, uuid)') IS NULL AS no_rpc
      `)
      assert.deepEqual(noPartialMigrationChanges, [{
        no_composite_index: true,
        no_product_index: true,
        no_composite_fk: true,
        no_category_check: true,
        no_rpc: true,
      }], 'A lock timeout must roll back all migration changes')

      await admin.query(`
        ALTER TABLE public.subcategories
          ADD CONSTRAINT subcategories_deferred_composite_unique
          UNIQUE (id, category_id) DEFERRABLE INITIALLY DEFERRED;
      `)
      await runMigrationProbe(async (client) => {
        await assertRequiredCompositeIndex(client)
        const { rows } = await client.query(`
          SELECT condeferrable
          FROM pg_constraint
          WHERE conname = 'subcategories_deferred_composite_unique'
        `)
        assert.deepEqual(rows, [{ condeferrable: true }], 'Preserve the pre-existing deferrable unique constraint')
      })
      await admin.query(
        'ALTER TABLE public.subcategories DROP CONSTRAINT subcategories_deferred_composite_unique',
      )

      await admin.query(`
        CREATE UNIQUE INDEX subcategories_partial_composite_idx
          ON public.subcategories (id, category_id)
          WHERE category_id IS NOT NULL;
      `)
      await runMigrationProbe(async (client) => {
        await assertRequiredCompositeIndex(client)
        const { rows } = await client.query(`
          SELECT i.indpred IS NOT NULL AS remains_partial
          FROM pg_index i
          JOIN pg_class idx ON idx.oid = i.indexrelid
          WHERE idx.relname = 'subcategories_partial_composite_idx'
        `)
        assert.deepEqual(rows, [{ remains_partial: true }], 'Preserve the pre-existing partial index')
      })
      await admin.query('DROP INDEX public.subcategories_partial_composite_idx')

      await admin.query(`
        CREATE INDEX products_partial_subcategory_idx
          ON public.products (subcategory_id)
          WHERE subcategory_id IS NOT NULL;
      `)
      await runMigrationProbe(async (client) => {
        await assertRequiredCompositeIndex(client)
        const { rows } = await client.query(`
          SELECT to_regclass('public.products_subcategory_id_integrity_idx') IS NOT NULL AS required_index_created,
                 i.indpred IS NOT NULL AS remains_partial
          FROM pg_index i
          JOIN pg_class idx ON idx.oid = i.indexrelid
          WHERE idx.relname = 'products_partial_subcategory_idx'
        `)
        assert.deepEqual(rows, [{
          required_index_created: true,
          remains_partial: true,
        }], 'Reject partial lookup candidates, add a full lookup index, and preserve the original')
      })
      await admin.query('DROP INDEX public.products_partial_subcategory_idx')

      await createCancelledConcurrentIndex('subcategories_invalid_composite_idx', categoryOne)
      await runMigrationProbe(async (client) => {
        await assertRequiredCompositeIndex(client)
        const { rows } = await client.query(`
          SELECT i.indisvalid
          FROM pg_index i
          JOIN pg_class idx ON idx.oid = i.indexrelid
          WHERE idx.relname = 'subcategories_invalid_composite_idx'
        `)
        assert.deepEqual(rows, [{ indisvalid: false }], 'Keep an invalid index untouched and do not accept it')
      })
      await admin.query('DROP INDEX public.subcategories_invalid_composite_idx')

      await admin.query(`
        CREATE OPERATOR CLASS public.uuid_nondefault_ops
        FOR TYPE uuid USING btree AS
          OPERATOR 1 < (uuid, uuid),
          OPERATOR 2 <= (uuid, uuid),
          OPERATOR 3 = (uuid, uuid),
          OPERATOR 4 >= (uuid, uuid),
          OPERATOR 5 > (uuid, uuid),
          FUNCTION 1 pg_catalog.uuid_cmp(uuid, uuid);
        CREATE UNIQUE INDEX subcategories_nondefault_uuid_ops_idx
          ON public.subcategories (id public.uuid_nondefault_ops, category_id);
        CREATE INDEX products_nondefault_uuid_ops_idx
          ON public.products (subcategory_id public.uuid_nondefault_ops);
      `)
      await runMigrationProbe(async (client) => {
        await assertRequiredCompositeIndex(client)
        const { rows } = await client.query(`
          SELECT count(*)::integer AS count
          FROM pg_index i
          JOIN pg_class idx ON idx.oid = i.indexrelid
          JOIN pg_am am ON am.oid = idx.relam
          WHERE i.indrelid = 'public.products'::regclass
            AND idx.relname = 'products_subcategory_id_integrity_idx'
            AND i.indisvalid AND i.indisready AND i.indislive
            AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
            AND am.amname = 'btree'
        `)
        assert.equal(rows[0].count, 1, 'Reject non-default opclass candidates and add the standard B-tree indexes')
      })
      await admin.query(`
        DROP INDEX public.subcategories_nondefault_uuid_ops_idx;
        DROP INDEX public.products_nondefault_uuid_ops_idx;
        DROP OPERATOR CLASS public.uuid_nondefault_ops USING btree;
      `)

      await admin.query(migration)
      const { rows: standardCompositeIndex } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        WHERE i.indrelid = 'public.subcategories'::regclass
          AND idx.relname = 'subcategories_id_category_id_key'
          AND i.indisunique AND i.indimmediate AND i.indisvalid
          AND i.indisready AND i.indislive AND i.indnkeyatts = 2
          AND i.indpred IS NULL AND i.indexprs IS NULL
      `)
      assert.equal(standardCompositeIndex[0].count, 1, 'Create a standard compatible immediate unique index when none exists')
      const { rows: standardProductIndex } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        WHERE i.indrelid = 'public.products'::regclass
          AND idx.relname = 'products_subcategory_id_integrity_idx'
          AND i.indisvalid AND i.indisready AND i.indislive
          AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
      `)
      assert.equal(standardProductIndex[0].count, 1, 'Create a standard btree lookup index when none exists')

      await admin.query(`
        ALTER TABLE public.products
          RENAME CONSTRAINT products_subcategory_category_fkey TO integration_equivalent_category_fk;
        ALTER TABLE public.products
          DROP CONSTRAINT products_subcategory_requires_category_check;
        ALTER TABLE public.products
          ADD CONSTRAINT integration_equivalent_category_check
          CHECK (category_id IS NOT NULL OR subcategory_id IS NULL) NOT VALID;
      `)
      await admin.query(migration)
      const { rows: structuralConstraints } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_constraint c
        WHERE c.conrelid = 'public.products'::regclass
          AND (
            (c.contype = 'f'
             AND c.conkey = ARRAY[
               (SELECT attnum::smallint FROM pg_attribute
                WHERE attrelid = 'public.products'::regclass AND attname = 'subcategory_id'),
               (SELECT attnum::smallint FROM pg_attribute
                WHERE attrelid = 'public.products'::regclass AND attname = 'category_id')
             ]::smallint[]
             AND c.confrelid = 'public.subcategories'::regclass)
            OR (c.contype = 'c'
                AND c.conname = 'integration_equivalent_category_check')
          )
      `)
      assert.equal(structuralConstraints[0].count, 2, 'The migration must reuse equivalent constraints regardless of name or formatting')

      await admin.query(`
        ALTER TABLE public.products
          DROP CONSTRAINT integration_equivalent_category_fk;
        ALTER TABLE public.products
          ADD CONSTRAINT integration_equivalent_category_fk
          FOREIGN KEY (subcategory_id, category_id)
          REFERENCES public.subcategories (id, category_id)
          ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
      `)
      adminInTransaction = true
      await assert.rejects(
        admin.query(migration),
        (error) => /incompatible foreign key already uses products\(subcategory_id, category_id\)/.test(error.message),
      )
      await admin.query('ROLLBACK')
      adminInTransaction = false
      await admin.query(`
        ALTER TABLE public.products
          DROP CONSTRAINT integration_equivalent_category_fk;
        ALTER TABLE public.products
          ADD CONSTRAINT integration_equivalent_category_fk
          FOREIGN KEY (subcategory_id, category_id)
          REFERENCES public.subcategories (id, category_id)
          ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
      `)
      await admin.query(migration)

      await admin.query(`
        ALTER TABLE public.products
          DROP CONSTRAINT integration_equivalent_category_fk;
        DROP INDEX public.subcategories_id_category_id_key;
        CREATE UNIQUE INDEX subcategories_exact_existing_idx
          ON public.subcategories (id, category_id);
      `)
      await admin.query(migration)
      const { rows: reusedExactCompositeIndex } = await admin.query(`
        SELECT to_regclass('public.subcategories_exact_existing_idx') IS NOT NULL AS existing_present,
               to_regclass('public.subcategories_id_category_id_key') IS NULL AS migration_index_absent
      `)
      assert.equal(reusedExactCompositeIndex[0].existing_present, true)
      assert.equal(reusedExactCompositeIndex[0].migration_index_absent, true, 'Reuse an existing exact-order unique index')

      await admin.query(`
        ALTER TABLE public.products
          DROP CONSTRAINT products_subcategory_category_fkey;
        DROP INDEX public.subcategories_exact_existing_idx;
        CREATE UNIQUE INDEX subcategories_reverse_include_support_idx
          ON public.subcategories (category_id, id) INCLUDE (name);
      `)
      await admin.query(migration)
      const { rows: reverseCompositeIndex } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        WHERE i.indrelid = 'public.subcategories'::regclass
          AND idx.relname = 'subcategories_reverse_include_support_idx'
          AND i.indisunique AND i.indimmediate AND i.indisvalid
          AND i.indisready AND i.indislive AND i.indnkeyatts = 2
          AND i.indnatts = 3
          AND i.indpred IS NULL AND i.indexprs IS NULL
      `)
      assert.equal(reverseCompositeIndex[0].count, 1, 'Keep the valid reversed-key unique index with INCLUDE')
      const { rows: requiredCompositeIndex } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        WHERE i.indrelid = 'public.subcategories'::regclass
          AND idx.relname = 'subcategories_id_category_id_key'
          AND i.indisunique AND i.indimmediate AND i.indisvalid
          AND i.indisready AND i.indislive AND i.indnkeyatts = 2
          AND i.indkey[0] = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = 'public.subcategories'::regclass AND attname = 'id'
          )
          AND i.indkey[1] = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = 'public.subcategories'::regclass AND attname = 'category_id'
          )
          AND i.indpred IS NULL AND i.indexprs IS NULL
      `)
      assert.equal(requiredCompositeIndex[0].count, 1, 'Create the required exact-order index when only the inverse exists')

      await admin.query(`
        ALTER TABLE public.products
          DROP CONSTRAINT products_subcategory_category_fkey;
        DROP INDEX public.subcategories_id_category_id_key;
        CREATE UNIQUE INDEX subcategories_exact_include_support_idx
          ON public.subcategories (id, category_id) INCLUDE (name);
      `)
      await admin.query(migration)
      const { rows: reusedIncludeCompositeIndex } = await admin.query(`
        SELECT to_regclass('public.subcategories_exact_include_support_idx') IS NOT NULL AS existing_present,
               to_regclass('public.subcategories_id_category_id_key') IS NULL AS migration_index_absent
      `)
      assert.equal(reusedIncludeCompositeIndex[0].existing_present, true)
      assert.equal(reusedIncludeCompositeIndex[0].migration_index_absent, true, 'Reuse a compatible exact-order index with INCLUDE columns')
      await admin.query(`
        ALTER TABLE public.products
          RENAME CONSTRAINT products_subcategory_category_fkey TO integration_equivalent_category_fk;
      `)

      await admin.query(`
        DROP INDEX public.products_subcategory_id_integrity_idx;
        CREATE INDEX products_reverse_subcategory_support_idx
          ON public.products (category_id, subcategory_id) INCLUDE (id);
      `)
      await admin.query(migration)
      const { rows: createdLeadingProductIndex } = await admin.query(
        `SELECT to_regclass('public.products_subcategory_id_integrity_idx') IS NOT NULL AS present`,
      )
      assert.equal(createdLeadingProductIndex[0].present, true, 'A reverse-ordered product index cannot replace the subcategory-leading lookup')

      await admin.query(`
        DROP INDEX public.products_subcategory_id_integrity_idx;
        CREATE INDEX products_subcategory_include_support_idx
          ON public.products (subcategory_id, category_id) INCLUDE (id);
      `)
      await admin.query(migration)
      const { rows: noDuplicateProductIndex } = await admin.query(
        `SELECT to_regclass('public.products_subcategory_id_integrity_idx') IS NULL AS absent`,
      )
      assert.equal(noDuplicateProductIndex[0].absent, true, 'A compatible INCLUDE index must be reused')

      await admin.query(`
        ALTER TABLE public.products
          RENAME CONSTRAINT integration_equivalent_category_check TO products_subcategory_requires_category_check;
        ALTER TABLE public.products
          RENAME CONSTRAINT integration_equivalent_category_fk TO products_subcategory_category_fkey;
      `)

      await admin.query(correctiveDeleteMigration)
      const { rows: restrictedComparableGroupFk } = await admin.query(`
        SELECT confdeltype, convalidated
        FROM pg_constraint
        WHERE conrelid = 'public.comparable_groups'::regclass
          AND conname = 'comparable_groups_subcategory_id_fkey'
      `)
      assert.deepEqual(restrictedComparableGroupFk, [{ confdeltype: 'r', convalidated: true }])
      const { rows: preservedGroupAfterCascadeFix } = await admin.query(
        'SELECT id FROM public.comparable_groups WHERE id = $1',
        [comparableGroupId],
      )
      assert.equal(preservedGroupAfterCascadeFix.length, 1, 'The FK correction must preserve comparable-group rows')

      await admin.query(`
        ALTER TABLE public.comparable_groups
          DROP CONSTRAINT comparable_groups_subcategory_id_fkey;
        ALTER TABLE public.comparable_groups
          ADD CONSTRAINT comparable_groups_subcategory_id_fkey
          FOREIGN KEY (subcategory_id)
          REFERENCES public.subcategories(id)
          ON DELETE NO ACTION;
      `)
      await admin.query(correctiveDeleteMigration)
      const { rows: noActionComparableGroupFk } = await admin.query(`
        SELECT confdeltype, convalidated
        FROM pg_constraint
        WHERE conrelid = 'public.comparable_groups'::regclass
          AND conname = 'comparable_groups_subcategory_id_fkey'
      `)
      assert.deepEqual(noActionComparableGroupFk, [{ confdeltype: 'a', convalidated: true }])
      await admin.query(`
        GRANT SELECT ON public.products, public.comparable_groups TO service_role;
        GRANT SELECT, UPDATE, DELETE ON public.subcategories TO service_role;
      `)
      const { rows: preservedEmptySubcategory } = await admin.query(
        'SELECT id FROM public.subcategories WHERE id = $1',
        [subcategoryToPreserve],
      )
      assert.equal(preservedEmptySubcategory.length, 1, 'The migration must preserve empty subcategories')
      const { rows: functions } = await admin.query(`
        SELECT p.proname, p.prosecdef, p.proconfig,
               CASE WHEN p.proname = 'update_catalog_product_classification'
                 THEN p.proargtypes[0]::regtype::text
               END AS product_id_type,
               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_can_execute,
               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1::text[])
      `, [[
        'update_catalog_subcategory',
        'delete_catalog_subcategory',
        'update_catalog_product_classification',
      ]])
      assert.equal(functions.length, 3)
      for (const fn of functions) {
        assert.equal(fn.prosecdef, false, `${fn.proname} must remain SECURITY INVOKER`)
        assert.ok(fn.proconfig?.some((setting) => setting === 'search_path=pg_catalog, public'))
        assert.equal(fn.service_can_execute, true)
        assert.equal(fn.anon_can_execute, false)
        assert.equal(fn.authenticated_can_execute, false)
      }
      const classificationFunction = functions.find(
        (fn) => fn.proname === 'update_catalog_product_classification',
      )
      assert.equal(classificationFunction.product_id_type, 'integer')
      const { rows: confidenceColumn } = await admin.query(`
        SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
               EXISTS (
                 SELECT 1
                 FROM pg_constraint constraint_row
                 WHERE constraint_row.conrelid = attribute.attrelid
                   AND constraint_row.contype = 'c'
                   AND attribute.attnum = ANY(constraint_row.conkey)
               ) AS has_check_constraint
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.products'::regclass
          AND attribute.attname = 'classification_confidence'
          AND NOT attribute.attisdropped
      `)
      assert.deepEqual(confidenceColumn, [{ data_type: 'text', has_check_constraint: false }])
      const { rows: classificationSourceCheck } = await admin.query(`
        SELECT pg_get_constraintdef(oid, true) AS definition
        FROM pg_constraint
        WHERE conrelid = 'public.products'::regclass
          AND conname = 'products_classification_source_check'
      `)
      assert.equal(classificationSourceCheck.length, 1)
      assert.match(classificationSourceCheck[0].definition, /automatic.*manual/)
      const { rows: preservedUniqueConstraints } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_constraint
        WHERE conrelid IN ('public.categories'::regclass, 'public.subcategories'::regclass)
          AND contype = 'u'
      `)
      assert.equal(preservedUniqueConstraints[0].count, 2, 'Preserve the existing category and subcategory unique constraints')

      const { rows: categoryForeignKey } = await admin.query(`
        SELECT c.contype,
               c.conkey = ARRAY[(SELECT attnum::smallint FROM pg_attribute
                 WHERE attrelid = 'public.products'::regclass AND attname = 'category_id')]::smallint[] AS columns_match,
               c.confkey = ARRAY[(SELECT attnum::smallint FROM pg_attribute
                 WHERE attrelid = 'public.categories'::regclass AND attname = 'id')]::smallint[] AS referenced_columns_match,
               c.confrelid = 'public.categories'::regclass AS references_categories,
               c.convalidated, c.condeferrable, c.confupdtype, c.confdeltype
        FROM pg_constraint c
        WHERE c.conrelid = 'public.products'::regclass
          AND c.conname = 'fk_products_category'
      `)
      assert.equal(categoryForeignKey.length, 1)
      assert.equal(categoryForeignKey[0].contype, 'f')
      assert.equal(categoryForeignKey[0].columns_match, true)
      assert.equal(categoryForeignKey[0].referenced_columns_match, true)
      assert.equal(categoryForeignKey[0].references_categories, true)
      assert.equal(categoryForeignKey[0].convalidated, true)
      assert.equal(categoryForeignKey[0].condeferrable, false)
      assert.equal(categoryForeignKey[0].confupdtype, 'a')
      assert.equal(categoryForeignKey[0].confdeltype, 'a')
      const { rows: duplicateCategoryForeignKeys } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_constraint c
        WHERE c.conrelid = 'public.products'::regclass
          AND c.contype = 'f'
          AND c.conkey = ARRAY[
            (SELECT attnum::smallint FROM pg_attribute
             WHERE attrelid = 'public.products'::regclass
               AND attname = 'category_id' AND NOT attisdropped)
          ]::smallint[]
          AND c.confrelid = 'public.categories'::regclass
      `)
      assert.equal(duplicateCategoryForeignKeys[0].count, 2, 'Preserve both pre-existing category foreign keys')
      const { rows: preservedCategoryRestrictForeignKey } = await admin.query(`
        SELECT c.convalidated, c.condeferrable, c.confupdtype, c.confdeltype
        FROM pg_constraint c
        WHERE c.conrelid = 'public.products'::regclass
          AND c.conname = 'products_category_id_restrict_fkey'
      `)
      assert.deepEqual(preservedCategoryRestrictForeignKey, [{
        convalidated: true,
        condeferrable: false,
        confupdtype: 'a',
        confdeltype: 'r',
      }])

      const { rows: subcategoryForeignKey } = await admin.query(`
        SELECT c.contype,
               c.conkey = ARRAY[(SELECT attnum::smallint FROM pg_attribute
                 WHERE attrelid = 'public.products'::regclass AND attname = 'subcategory_id')]::smallint[] AS columns_match,
               c.confkey = ARRAY[(SELECT attnum::smallint FROM pg_attribute
                 WHERE attrelid = 'public.subcategories'::regclass AND attname = 'id')]::smallint[] AS referenced_columns_match,
               c.confrelid = 'public.subcategories'::regclass AS references_subcategories,
               c.convalidated, c.condeferrable, c.confupdtype, c.confdeltype
        FROM pg_constraint c
        WHERE c.conrelid = 'public.products'::regclass
          AND c.conname = 'products_subcategory_id_fkey'
      `)
      assert.equal(subcategoryForeignKey.length, 1)
      assert.equal(subcategoryForeignKey[0].columns_match, true)
      assert.equal(subcategoryForeignKey[0].referenced_columns_match, true)
      assert.equal(subcategoryForeignKey[0].references_subcategories, true)
      assert.equal(subcategoryForeignKey[0].convalidated, true)
      assert.equal(subcategoryForeignKey[0].condeferrable, false)
      assert.equal(subcategoryForeignKey[0].confupdtype, 'a')
      assert.equal(subcategoryForeignKey[0].confdeltype, 'r')
      const { rows: preservedSubcategoryRestrictForeignKey } = await admin.query(`
        SELECT c.convalidated, c.condeferrable, c.confupdtype, c.confdeltype
        FROM pg_constraint c
        WHERE c.conrelid = 'public.products'::regclass
          AND c.conname = 'products_subcategory_id_restrict_fkey'
      `)
      assert.deepEqual(preservedSubcategoryRestrictForeignKey, [{
        convalidated: true,
        condeferrable: false,
        confupdtype: 'a',
        confdeltype: 'r',
      }])

      const { rows: subcategoryCategoryForeignKey } = await admin.query(`
        SELECT c.contype,
               c.conkey = ARRAY[(SELECT attnum::smallint FROM pg_attribute
                 WHERE attrelid = 'public.subcategories'::regclass AND attname = 'category_id')]::smallint[] AS columns_match,
               c.confkey = ARRAY[(SELECT attnum::smallint FROM pg_attribute
                 WHERE attrelid = 'public.categories'::regclass AND attname = 'id')]::smallint[] AS referenced_columns_match,
               c.confrelid = 'public.categories'::regclass AS references_categories,
               c.convalidated, c.condeferrable, c.confupdtype, c.confdeltype
        FROM pg_constraint c
        WHERE c.conrelid = 'public.subcategories'::regclass
          AND c.conname = 'subcategories_category_id_fkey'
      `)
      assert.equal(subcategoryCategoryForeignKey.length, 1)
      assert.equal(subcategoryCategoryForeignKey[0].columns_match, true)
      assert.equal(subcategoryCategoryForeignKey[0].referenced_columns_match, true)
      assert.equal(subcategoryCategoryForeignKey[0].references_categories, true)
      assert.equal(subcategoryCategoryForeignKey[0].convalidated, true)
      assert.equal(subcategoryCategoryForeignKey[0].condeferrable, false)
      assert.equal(subcategoryCategoryForeignKey[0].confupdtype, 'a')
      assert.equal(subcategoryCategoryForeignKey[0].confdeltype, 'r')

      await assert.rejects(
        admin.query(
          `INSERT INTO public.subcategories (id, category_id, name)
           VALUES ('00000000-0000-0000-0000-000000000099',
                   '00000000-0000-0000-0000-000000000099', 'missing category')`,
        ),
        (error) => error.code === '23503',
      )
      await assert.rejects(
        admin.query('DELETE FROM public.categories WHERE id = $1', [categoryThree]),
        (error) => error.code === '23503',
      )
      const { rows: preservedCategoryAndSubcategory } = await admin.query(`
        SELECT c.id AS category_id, s.id AS subcategory_id
        FROM public.categories c
        JOIN public.subcategories s ON s.category_id = c.id
        WHERE c.id = $1 AND s.id = $2
      `, [categoryThree, subcategoryToPreserve])
      assert.equal(preservedCategoryAndSubcategory.length, 1)

      await beginWriter()
      await writer.query(
        `INSERT INTO public.subcategories (id, category_id, name)
         VALUES ($1, $2, 'concurrent category delete')`,
        [subcategoryForConcurrentCategoryDelete, categoryFour],
      )
      await admin.query('BEGIN')
      adminInTransaction = true
      const concurrentCategoryDelete = admin.query(
        'DELETE FROM public.categories WHERE id = $1',
        [categoryFour],
      )
      await waitForLock('category_integrity_admin_test')
      await writer.query('COMMIT')
      writerInTransaction = false
      await assert.rejects(concurrentCategoryDelete, (error) => error.code === '23503')
      await admin.query('ROLLBACK')
      adminInTransaction = false
      const { rows: preservedConcurrentCategory } = await admin.query(`
        SELECT c.id AS category_id, s.id AS subcategory_id
        FROM public.categories c
        JOIN public.subcategories s ON s.category_id = c.id
        WHERE c.id = $1 AND s.id = $2
      `, [categoryFour, subcategoryForConcurrentCategoryDelete])
      assert.equal(preservedConcurrentCategory.length, 1, 'Concurrent category deletion must not orphan a new subcategory')

      const { rows: notValidatedIntegrityConstraints } = await admin.query(`
        SELECT conname, convalidated
        FROM pg_constraint
        WHERE conrelid = 'public.products'::regclass
          AND conname IN (
            'products_subcategory_category_fkey',
            'products_subcategory_requires_category_check'
          )
        ORDER BY conname
      `)
      assert.deepEqual(notValidatedIntegrityConstraints, [
        { conname: 'products_subcategory_category_fkey', convalidated: false },
        { conname: 'products_subcategory_requires_category_check', convalidated: false },
      ])
      const { rows: compositeClassificationForeignKey } = await admin.query(`
        SELECT c.conkey = ARRAY[
                 (SELECT attnum::smallint FROM pg_attribute
                  WHERE attrelid = 'public.products'::regclass AND attname = 'subcategory_id'),
                 (SELECT attnum::smallint FROM pg_attribute
                  WHERE attrelid = 'public.products'::regclass AND attname = 'category_id')
               ]::smallint[] AS columns_match,
               c.confkey = ARRAY[
                 (SELECT attnum::smallint FROM pg_attribute
                  WHERE attrelid = 'public.subcategories'::regclass AND attname = 'id'),
                 (SELECT attnum::smallint FROM pg_attribute
                  WHERE attrelid = 'public.subcategories'::regclass AND attname = 'category_id')
               ]::smallint[] AS referenced_columns_match,
               c.confrelid = 'public.subcategories'::regclass AS references_subcategories,
               c.confupdtype, c.confdeltype, c.convalidated, c.condeferrable
        FROM pg_constraint AS c
        WHERE c.conrelid = 'public.products'::regclass
          AND c.conname = 'products_subcategory_category_fkey'
      `)
      assert.deepEqual(compositeClassificationForeignKey, [{
        columns_match: true,
        referenced_columns_match: true,
        references_subcategories: true,
        confupdtype: 'r',
        confdeltype: 'r',
        convalidated: false,
        condeferrable: false,
      }])
      const { rows: classificationCategoryCheck } = await admin.query(`
        SELECT pg_get_constraintdef(oid, true) AS definition,
               convalidated, condeferrable
        FROM pg_constraint
        WHERE conrelid = 'public.products'::regclass
          AND conname = 'products_subcategory_requires_category_check'
      `)
      assert.equal(classificationCategoryCheck.length, 1)
      assert.match(
        classificationCategoryCheck[0].definition,
        /CHECK \((?:subcategory_id IS NULL OR category_id IS NOT NULL|category_id IS NOT NULL OR subcategory_id IS NULL)\)/,
      )
      assert.equal(classificationCategoryCheck[0].convalidated, false)
      assert.equal(classificationCategoryCheck[0].condeferrable, false)

      const auditResults = await admin.query(integrityAudit)
      assert.equal(auditResults.length, 4)
      const { rows: auditCounts } = await admin.query(`
        SELECT
          count(*) FILTER (
            WHERE p.subcategory_id IS NOT NULL AND p.category_id IS NULL
          )::integer AS missing_product_category,
          count(*) FILTER (
            WHERE p.subcategory_id IS NOT NULL
              AND p.category_id IS NOT NULL
              AND s.id IS NOT NULL
              AND p.category_id IS DISTINCT FROM s.category_id
          )::integer AS mismatched_category,
          count(*) FILTER (
            WHERE p.subcategory_id IS NOT NULL AND s.id IS NULL
          )::integer AS missing_subcategory
        FROM public.products p
        LEFT JOIN public.subcategories s ON s.id = p.subcategory_id
      `)
      assert.deepEqual(auditCounts[0], {
        missing_product_category: 1,
        mismatched_category: 1,
        missing_subcategory: 0,
      })
      await assert.rejects(
        admin.query('ALTER TABLE public.products VALIDATE CONSTRAINT products_subcategory_requires_category_check'),
        (error) => error.code === '23514',
      )
      await assert.rejects(
        admin.query('ALTER TABLE public.products VALIDATE CONSTRAINT products_subcategory_category_fkey'),
        (error) => error.code === '23503',
      )

      const { rows: uniqueCompositeIndexes } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_am am ON am.oid = idx.relam
        WHERE i.indrelid = 'public.subcategories'::regclass
          AND i.indisunique AND i.indimmediate
          AND i.indisvalid AND i.indisready AND i.indislive
          AND i.indnkeyatts = 2 AND i.indpred IS NULL AND i.indexprs IS NULL
          AND am.amname = 'btree'
          AND ARRAY(
            SELECT key_column.attnum::smallint
            FROM unnest(i.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
            WHERE key_column.ordinality <= i.indnkeyatts
            ORDER BY key_column.ordinality
          ) = ARRAY[
            (SELECT attnum::smallint FROM pg_attribute
             WHERE attrelid = 'public.subcategories'::regclass AND attname = 'id'),
            (SELECT attnum::smallint FROM pg_attribute
             WHERE attrelid = 'public.subcategories'::regclass AND attname = 'category_id')
          ]::smallint[]
      `)
      assert.equal(uniqueCompositeIndexes[0].count, 1, 'Do not add a duplicate composite unique index')
      const { rows: subcategoryIndexes } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_am am ON am.oid = idx.relam
        WHERE i.indrelid = 'public.products'::regclass
          AND i.indisvalid AND i.indisready
          AND i.indnkeyatts >= 1 AND i.indpred IS NULL AND i.indexprs IS NULL
          AND am.amname = 'btree'
          AND i.indkey[0] = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = 'public.products'::regclass AND attname = 'subcategory_id'
          )
      `)
      assert.equal(subcategoryIndexes[0].count, 1, 'Do not add a duplicate subcategory lookup index')

      await assert.rejects(
        admin.query(
          `INSERT INTO public.products (name, category_id, subcategory_id)
           VALUES ('incompatible category pair', $1, $2)`,
          [categoryTwo, subcategoryForUpdate],
        ),
        (error) => error.code === '23503',
      )
      await assert.rejects(
        admin.query(
          `INSERT INTO public.products (name, category_id, subcategory_id)
           VALUES ('subcategory without category', NULL, $1)`,
          [subcategoryForUpdate],
        ),
        (error) => error.code === '23514',
      )

      await assert.rejects(
        admin.query(
          `INSERT INTO public.products (name, category_id)
           VALUES ('missing category', '00000000-0000-0000-0000-000000000099')`,
        ),
        (error) => error.code === '23503',
      )
      await assert.rejects(
        admin.query(
          `INSERT INTO public.products (name, category_id, subcategory_id)
           VALUES ('missing subcategory', $1, '00000000-0000-0000-0000-000000000099')`,
          [categoryOne],
        ),
        (error) => error.code === '23503',
      )
      await assert.rejects(
        admin.query(
          `UPDATE public.products SET category_id = '00000000-0000-0000-0000-000000000099'
           WHERE id = $1`,
          [productId],
        ),
        (error) => error.code === '23503',
      )
      const { rows: unchangedAfterInvalidCategory } = await admin.query(
        'SELECT category_id, subcategory_id FROM public.products WHERE id = $1',
        [productId],
      )
      assert.equal(unchangedAfterInvalidCategory[0].category_id, categoryOne)
      assert.equal(unchangedAfterInvalidCategory[0].subcategory_id, null)

      const updateResult = await callRpc('update_catalog_subcategory', [
        subcategoryForUpdate, 'updated', categoryTwo,
      ])
      assert.equal(updateResult.status, 'updated')
      assert.equal(updateResult.subcategory.category_id, categoryTwo)

      const missingCategoryResult = await callRpc('update_catalog_subcategory', [
        subcategoryForUpdate,
        'must not partially update',
        '00000000-0000-0000-0000-000000000099',
      ])
      assert.equal(missingCategoryResult.status, 'category_not_found')
      const { rows: unchangedAfterMissingCategory } = await admin.query(
        'SELECT name, category_id FROM public.subcategories WHERE id = $1',
        [subcategoryForUpdate],
      )
      assert.equal(unchangedAfterMissingCategory[0].name, 'updated')
      assert.equal(unchangedAfterMissingCategory[0].category_id, categoryTwo)

      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(
          callRpcAsRole(role, 'delete_catalog_subcategory', [subcategoryForDelete]),
          (error) => error.code === '42501',
        )
      }
      const deleteResult = await callRpcAsRole(
        'service_role',
        'delete_catalog_subcategory',
        [subcategoryForDelete],
      )
      assert.deepEqual(deleteResult, { status: 'deleted' })
      const { rows: deletedSubcategory } = await admin.query(
        'SELECT id FROM public.subcategories WHERE id = $1',
        [subcategoryForDelete],
      )
      assert.equal(deletedSubcategory.length, 0)

      const groupDeleteResult = await callRpcAsRole(
        'service_role',
        'delete_catalog_subcategory',
        [subcategoryForGroupDelete],
      )
      assert.deepEqual(groupDeleteResult, {
        status: 'comparable_groups_associated',
        comparable_group_count: 1,
      })
      const { rows: preservedComparableGroup } = await admin.query(`
        SELECT group_row.id, group_row.subcategory_id, product.comparable_group_id
        FROM public.comparable_groups AS group_row
        JOIN public.products AS product ON product.comparable_group_id = group_row.id
        WHERE group_row.id = $1
      `, [comparableGroupId])
      assert.deepEqual(preservedComparableGroup, [{
        id: comparableGroupId,
        subcategory_id: subcategoryForGroupDelete,
        comparable_group_id: comparableGroupId,
      }], 'Rejecting the deletion must preserve the comparable group and product reference')
      const { rows: noOrphanGroups } = await admin.query(`
        SELECT
          (SELECT count(*)::integer
           FROM public.comparable_groups AS group_row
           LEFT JOIN public.subcategories AS subcategory
             ON subcategory.id = group_row.subcategory_id
           WHERE subcategory.id IS NULL) AS orphan_comparable_groups,
          (SELECT count(*)::integer
           FROM public.products AS product
           LEFT JOIN public.comparable_groups AS group_row
             ON group_row.id = product.comparable_group_id
           WHERE product.comparable_group_id IS NOT NULL
             AND group_row.id IS NULL) AS orphan_product_group_references
      `)
      assert.deepEqual(noOrphanGroups, [{
        orphan_comparable_groups: 0,
        orphan_product_group_references: 0,
      }])

      await admin.query(`
        CREATE FUNCTION public.integration_reject_subcategory_delete()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $function$
        BEGIN
          IF OLD.id = '00000000-0000-0000-0000-000000000022'::uuid THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'integration_delete_failure';
          END IF;
          RETURN OLD;
        END;
        $function$;
        CREATE TRIGGER integration_reject_subcategory_delete
        BEFORE DELETE ON public.subcategories
        FOR EACH ROW EXECUTE FUNCTION public.integration_reject_subcategory_delete();
      `)
      await assert.rejects(
        callRpcAsRole('service_role', 'delete_catalog_subcategory', [subcategoryForRollbackDelete]),
        (error) => error.code === 'P0001',
      )
      const { rows: preservedAfterDeleteError } = await admin.query(
        'SELECT id FROM public.subcategories WHERE id = $1',
        [subcategoryForRollbackDelete],
      )
      assert.equal(preservedAfterDeleteError.length, 1, 'A failed delete must leave the subcategory intact')
      await admin.query(`
        DROP TRIGGER integration_reject_subcategory_delete ON public.subcategories;
        DROP FUNCTION public.integration_reject_subcategory_delete();
      `)

      const missingSubcategoryDelete = await callRpc('delete_catalog_subcategory', [
        '00000000-0000-0000-0000-000000000099',
      ])
      assert.deepEqual(missingSubcategoryDelete, { status: 'not_found' })
      const { rows: preservedEmptyAfterDelete } = await admin.query(
        'SELECT id FROM public.subcategories WHERE id = $1',
        [subcategoryToPreserve],
      )
      assert.equal(preservedEmptyAfterDelete.length, 1, 'Unrelated empty subcategories must remain')

      await beginAdminLock(subcategoryForUpdate)
      await beginWriter()
      const blockedInsert = writer.query(
        `INSERT INTO public.products (name, category_id, subcategory_id)
         VALUES ('concurrent insert', $1, $2)`,
        [categoryTwo, subcategoryForUpdate],
      )
      await waitForLock('category_integrity_writer_test')
      const concurrentUpdate = await callRpc('update_catalog_subcategory', [
        subcategoryForUpdate, 'updated again', categoryOne,
      ])
      assert.equal(concurrentUpdate.status, 'updated')
      await commitAdmin()
      await assert.rejects(blockedInsert, (error) => error.code === '23503')
      await rollbackWriter()

      await beginAdminLock(subcategoryForConcurrentDelete)
      await beginWriter()
      const blockedDeleteInsert = writer.query(
        `INSERT INTO public.products (name, category_id, subcategory_id)
         VALUES ('concurrent delete insert', $1, $2)`,
        [categoryOne, subcategoryForConcurrentDelete],
      )
      await waitForLock('category_integrity_writer_test')
      const concurrentDelete = await callRpc('delete_catalog_subcategory', [subcategoryForConcurrentDelete])
      assert.equal(concurrentDelete.status, 'deleted')
      await commitAdmin()
      await assert.rejects(blockedDeleteInsert, (error) => error.code === '23503')
      await rollbackWriter()

      await beginAdminLock(subcategoryForConcurrentProductDelete)
      await beginWriter()
      const blockedProductUpdate = writer.query(
        `UPDATE public.products
         SET category_id = $1, subcategory_id = $2
         WHERE id = $3`,
        [categoryOne, subcategoryForConcurrentProductDelete, productId],
      )
      await waitForLock('category_integrity_writer_test')
      const concurrentProductDelete = await callRpc(
        'delete_catalog_subcategory',
        [subcategoryForConcurrentProductDelete],
      )
      assert.equal(concurrentProductDelete.status, 'deleted')
      await commitAdmin()
      await assert.rejects(blockedProductUpdate, (error) => error.code === '23503')
      await rollbackWriter()
      const { rows: productAfterConcurrentSubcategoryDelete } = await admin.query(
        'SELECT category_id, subcategory_id FROM public.products WHERE id = $1',
        [productId],
      )
      assert.equal(productAfterConcurrentSubcategoryDelete[0].category_id, categoryOne)
      assert.equal(productAfterConcurrentSubcategoryDelete[0].subcategory_id, null)

      await beginAdminLock(subcategoryForReassignment)
      await beginWriter()
      const blockedReassignment = writer.query(
        `UPDATE public.products SET category_id = $1, subcategory_id = $2 WHERE id = $3`,
        [categoryOne, subcategoryForReassignment, productId],
      )
      await waitForLock('category_integrity_writer_test')
      const concurrentParentChange = await callRpc('update_catalog_subcategory', [
        subcategoryForReassignment, 'reassigned', categoryTwo,
      ])
      assert.equal(concurrentParentChange.status, 'updated')
      await commitAdmin()
      await assert.rejects(blockedReassignment, (error) => error.code === '23503')
      await rollbackWriter()

      const classificationUpdate = await callRpc('update_catalog_product_classification', [
        productId, subcategoryForReassignment,
      ])
      assert.equal(classificationUpdate.status, 'updated')
      assert.equal(classificationUpdate.product.category_id, categoryTwo)
      assert.equal(classificationUpdate.product.subcategory_id, subcategoryForReassignment)

      await beginAdminLock(subcategoryForUpdate)
      const blockedClassification = callRpcOn(writer, 'update_catalog_product_classification', [
        productId, subcategoryForUpdate,
      ])
      await waitForLock('category_integrity_writer_test')
      const concurrentClassificationParentChange = await callRpc('update_catalog_subcategory', [
        subcategoryForUpdate, 'classification race', categoryTwo,
      ])
      assert.equal(concurrentClassificationParentChange.status, 'updated')
      await commitAdmin()
      const classificationAfterParentChange = await blockedClassification
      assert.equal(classificationAfterParentChange.status, 'updated')
      assert.equal(classificationAfterParentChange.product.category_id, categoryTwo)
      assert.equal(classificationAfterParentChange.product.subcategory_id, subcategoryForUpdate)
      const { rows: classificationConsistency } = await admin.query(`
        SELECT p.category_id = s.category_id AS consistent
        FROM public.products p
        JOIN public.subcategories s ON s.id = p.subcategory_id
        WHERE p.id = $1
      `, [productId])
      assert.equal(classificationConsistency[0].consistent, true, 'Concurrent classification must use the committed subcategory parent')

      await admin.query('BEGIN')
      adminInTransaction = true
      const firstConcurrentClassification = await callRpc(
        'update_catalog_product_classification',
        [productId, subcategoryForUpdate],
      )
      assert.equal(firstConcurrentClassification.status, 'updated')
      await beginWriter()
      const secondConcurrentClassification = callRpcOn(
        writer,
        'update_catalog_product_classification',
        [productId, legacyMismatchedSubcategory],
      )
      await waitForLock('category_integrity_writer_test')
      await commitAdmin()
      const secondConcurrentResult = await secondConcurrentClassification
      assert.equal(secondConcurrentResult.status, 'updated')
      await writer.query('COMMIT')
      writerInTransaction = false
      const { rows: twoClassificationConsistency } = await admin.query(`
        SELECT p.category_id = s.category_id AS consistent,
               p.subcategory_id = $2::uuid AS second_classification_won
        FROM public.products p
        JOIN public.subcategories s ON s.id = p.subcategory_id
        WHERE p.id = $1
      `, [productId, legacyMismatchedSubcategory])
      assert.equal(twoClassificationConsistency[0].consistent, true)
      assert.equal(twoClassificationConsistency[0].second_classification_won, true)
      const restoreOccupiedClassification = await callRpc(
        'update_catalog_product_classification',
        [productId, subcategoryForUpdate],
      )
      assert.equal(restoreOccupiedClassification.status, 'updated')

      const occupiedSubcategoryUpdate = await callRpc('update_catalog_subcategory', [
        subcategoryForUpdate, 'invalid move', categoryOne,
      ])
      assert.equal(occupiedSubcategoryUpdate.status, 'products_associated')
      assert.equal(Number(occupiedSubcategoryUpdate.product_count), 1)
      const { rows: unchangedOccupiedSubcategory } = await admin.query(
        'SELECT name, category_id FROM public.subcategories WHERE id = $1',
        [subcategoryForUpdate],
      )
      assert.equal(unchangedOccupiedSubcategory[0].name, 'classification race')
      assert.equal(unchangedOccupiedSubcategory[0].category_id, categoryTwo)

      const occupiedSubcategoryDelete = await callRpc(
        'delete_catalog_subcategory',
        [subcategoryForUpdate],
      )
      assert.equal(occupiedSubcategoryDelete.status, 'products_associated')
      assert.equal(Number(occupiedSubcategoryDelete.product_count), 1)
      assert.equal(Number(occupiedSubcategoryDelete.comparable_group_count), 0)
      const { rows: preservedSubcategoryAfterRejectedDelete } = await admin.query(
        'SELECT id, name, category_id FROM public.subcategories WHERE id = $1',
        [subcategoryForUpdate],
      )
      const { rows: preservedProductAfterRejectedDelete } = await admin.query(
        'SELECT subcategory_id FROM public.products WHERE id = $1',
        [productId],
      )
      assert.deepEqual(preservedSubcategoryAfterRejectedDelete, [{
        id: subcategoryForUpdate,
        name: 'classification race',
        category_id: categoryTwo,
      }])
      assert.equal(preservedProductAfterRejectedDelete[0].subcategory_id, subcategoryForUpdate)

      await assert.rejects(
        admin.query(
          'UPDATE public.subcategories SET category_id = $1 WHERE id = $2',
          [categoryOne, subcategoryForUpdate],
        ),
        (error) => error.code === '23503',
      )
      await assert.rejects(
        admin.query(
          'DELETE FROM public.subcategories WHERE id = $1',
          [subcategoryForUpdate],
        ),
        (error) => error.code === '23503',
      )
      const { rows: unchangedSubcategory } = await admin.query(
        'SELECT category_id FROM public.subcategories WHERE id = $1',
        [subcategoryForUpdate],
      )
      assert.equal(unchangedSubcategory[0].category_id, categoryTwo)

      await assert.rejects(
        admin.query(
          `UPDATE public.products SET category_id = $1 WHERE id = $2`,
          [categoryOne, productId],
        ),
        (error) => error.code === '23503',
      )
      await assert.rejects(
        admin.query(
          `UPDATE public.products SET category_id = NULL WHERE id = $1`,
          [productId],
        ),
        (error) => error.code === '23514',
      )
      await assert.rejects(
        admin.query(
          `DELETE FROM public.subcategories WHERE id = $1`,
          [legacyNullCategorySubcategory],
        ),
        (error) => error.code === '23503',
      )

      const { rows: mismatches } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM public.products p
        LEFT JOIN public.subcategories s ON s.id = p.subcategory_id
        WHERE p.subcategory_id IS NOT NULL
          AND (s.id IS NULL OR p.category_id IS DISTINCT FROM s.category_id)
      `)
      assert.equal(mismatches[0].count, 2, 'Both deliberately seeded legacy rows should be reported')

      await admin.query(
        'UPDATE public.products SET category_id = $1 WHERE subcategory_id = $2 AND category_id IS NULL',
        [categoryOne, legacyNullCategorySubcategory],
      )
      await admin.query(
        'UPDATE public.products SET category_id = $1 WHERE subcategory_id = $2',
        [categoryOne, legacyMismatchedSubcategory],
      )
      await admin.query(
        'ALTER TABLE public.products VALIDATE CONSTRAINT products_subcategory_category_fkey',
      )
      await admin.query(
        'ALTER TABLE public.products VALIDATE CONSTRAINT products_subcategory_requires_category_check',
      )
      const { rows: validatedIntegrityConstraints } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM pg_constraint
        WHERE conrelid = 'public.products'::regclass
          AND conname IN (
            'products_subcategory_category_fkey',
            'products_subcategory_requires_category_check'
          )
          AND convalidated
      `)
      assert.equal(validatedIntegrityConstraints[0].count, 2, 'Both integrity constraints should validate after fixture repair')

      const { rows: cleanAudit } = await admin.query(`
        SELECT count(*)::integer AS count
        FROM public.products p
        LEFT JOIN public.subcategories s ON s.id = p.subcategory_id
        LEFT JOIN public.categories c ON c.id = p.category_id
        WHERE (p.subcategory_id IS NOT NULL AND p.category_id IS NULL)
          OR (p.subcategory_id IS NOT NULL AND s.id IS NULL)
          OR (p.category_id IS NOT NULL AND c.id IS NULL)
          OR (p.subcategory_id IS NOT NULL AND p.category_id IS DISTINCT FROM s.category_id)
      `)
      assert.equal(cleanAudit[0].count, 0, 'No audited historical inconsistency should remain after explicit fixture repair')
      const { rows: preservedEmptyAtEnd } = await admin.query(
        'SELECT id FROM public.subcategories WHERE id = $1',
        [subcategoryToPreserve],
      )
      assert.equal(preservedEmptyAtEnd.length, 1, 'No operation may automatically remove an empty subcategory')
      const { rows: preservedEmptyFixtures } = await admin.query(`
        SELECT id
        FROM public.subcategories
        WHERE id = ANY($1::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM public.products p WHERE p.subcategory_id = subcategories.id
          )
        ORDER BY id
      `, [emptySubcategoryIds])
      assert.deepEqual(
        preservedEmptyFixtures.map((row) => row.id),
        [...emptySubcategoryIds].sort(),
        'Preserve all fourteen empty subcategory fixture UUIDs',
      )
    } finally {
      if (adminInTransaction) await admin.query('ROLLBACK')
      if (writerInTransaction) await writer.query('ROLLBACK')
      if (baselineCreated) {
        await admin.query(`
          DROP FUNCTION IF EXISTS public.update_catalog_product_classification(integer, uuid);
          DROP FUNCTION IF EXISTS public.update_catalog_product_classification(bigint, uuid);
          DROP FUNCTION IF EXISTS public.delete_catalog_subcategory(uuid);
          DROP FUNCTION IF EXISTS public.update_catalog_subcategory(uuid, text, uuid);
          DROP INDEX IF EXISTS public.subcategories_nondefault_uuid_ops_idx;
          DROP INDEX IF EXISTS public.products_nondefault_uuid_ops_idx;
          DROP TABLE IF EXISTS public.products CASCADE;
          DROP TABLE IF EXISTS public.comparable_groups CASCADE;
          DROP TABLE IF EXISTS public.subcategories CASCADE;
          DROP TABLE IF EXISTS public.categories CASCADE;
          DROP FUNCTION IF EXISTS public.integration_reject_subcategory_delete();
          DROP OPERATOR CLASS IF EXISTS public.uuid_nondefault_ops USING btree;
        `)
      }
      await Promise.all(connectedClients.map((client) => client.end()))
    }
  },
)
