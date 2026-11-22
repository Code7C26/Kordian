const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')
const { test } = require('node:test')

const connectionString = process.env.PRICE_STATUS_OUTBOX_TEST_DATABASE_URL
const migration = fs.readFileSync(
  path.join(__dirname, 'migrations', '20261113_durable_price_status_outbox.sql'),
  'utf8',
)

function getTestDatabaseName(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('PRICE_STATUS_OUTBOX_TEST_DATABASE_URL must be a valid PostgreSQL URL')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('PRICE_STATUS_OUTBOX_TEST_DATABASE_URL must use PostgreSQL')
  }
  if (url.search || url.hash) {
    throw new Error('PRICE_STATUS_OUTBOX_TEST_DATABASE_URL cannot include connection overrides')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Price status outbox tests are restricted to loopback hosts')
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!/^[a-z0-9_][a-z0-9_-]*_test$/i.test(databaseName)) {
    throw new Error('Price status outbox tests require a database name ending in _test')
  }
  return databaseName
}

function statusPayload(productId) {
  const timestamp = new Date().toISOString()
  return JSON.stringify({
    product_id: String(productId),
    classification: 'INFORMACION_INSUFICIENTE',
    anomaly_score: 0,
    offer_score: 0,
    confidence: 'baja',
    confidence_percentage: 0,
    data_quality: { historyPoints: 0, supermarkets: 0, comparables: 0, quality: 'baja' },
    rules_version: 'integration-test',
    price_fingerprint: `fixture-${productId}`,
    comparable_product_ids: [String(productId)],
    analysis_details: {
      indicators: { percentageVariation: null, inflationDeviation: null, signals: [] },
      references: { references: [] },
      priceHistory: [],
      pricePeriods: [],
    },
    analyzed_at: timestamp,
    updated_at: timestamp,
  })
}

async function saveAndComplete(client, claim, payload = statusPayload(claim.product_id)) {
  const { rows } = await client.query(
    'SELECT public.save_and_complete_product_price_status_refresh($1, $2, $3, $4::jsonb) AS state',
    [claim.product_id, claim.generation, claim.lease_token, payload],
  )
  return rows[0].state
}

async function drainClaims(client) {
  const { rows: claims } = await client.query(
    'SELECT * FROM public.claim_product_price_status_refresh(100, 300)',
  )
  for (const claim of claims) assert.equal(await saveAndComplete(client, claim), 'completed')
  return claims
}

async function waitForLockWait(client, applicationName, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE application_name = $1
          AND state = 'active'
          AND wait_event_type = 'Lock'
      ) AS waiting
    `, [applicationName])
    if (rows[0].waiting) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${applicationName} to block on the queue capacity lock`)
}

test('rejects remote hosts and non-test PostgreSQL databases before connecting', () => {
  assert.equal(
    getTestDatabaseName('postgres://tester:secret@localhost:5432/price_status_test'),
    'price_status_test',
  )
  assert.throws(
    () => getTestDatabaseName('postgres://tester:secret@db.example.com:5432/price_status_test'),
    /loopback hosts/,
  )
  assert.throws(
    () => getTestDatabaseName('postgres://tester:secret@localhost:5432/price_status'),
    /ending in _test/,
  )
  assert.throws(
    () => getTestDatabaseName('postgres://tester:secret@localhost:5432/price_status_test?host=db.example.com'),
    /connection overrides/,
  )
})

test(
  'durable refresh queue survives retries and concurrent workers without losing newer work',
  {
    skip: !connectionString
      ? 'Set PRICE_STATUS_OUTBOX_TEST_DATABASE_URL to a dedicated empty loopback PostgreSQL test database ending in _test'
      : false,
  },
  async () => {
    const databaseName = getTestDatabaseName(connectionString)
    const admin = new Client({ connectionString, application_name: 'price_status_outbox_admin_test' })
    const firstWorker = new Client({ connectionString, application_name: 'price_status_outbox_worker_one_test' })
    const secondWorker = new Client({ connectionString, application_name: 'price_status_outbox_worker_two_test' })
    const restartedWorker = new Client({ connectionString, application_name: 'price_status_outbox_restarted_worker_test' })
    const clients = [admin, firstWorker, secondWorker, restartedWorker]
    let connected = 0

    try {
      for (const client of clients) {
        await client.connect()
        connected += 1
      }

      const { rows: identityRows } = await admin.query(`
        SELECT
          current_database() AS database_name,
          current_user AS executed_as,
          current_setting('server_version_num')::integer AS server_version_num,
          inet_server_addr()::text AS server_address,
          inet_server_port() AS server_port,
          has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_in_database,
          has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public
      `)
      const identity = identityRows[0]
      assert.equal(identity.database_name, databaseName, 'Connected database does not match the test database name')
      assert.ok(identity.database_name.endsWith('_test'), 'Refusing to write outside a _test database')
      assert.ok(identity.server_version_num >= 130000, 'PostgreSQL 13 or later is required')
      assert.ok(
        ['127.0.0.1', '::1'].includes(identity.server_address),
        'Refusing to write unless the PostgreSQL server address is loopback',
      )
      assert.ok(identity.server_port > 0, 'Unable to identify the PostgreSQL server port')
      assert.equal(identity.can_create_in_database, true, 'The test role cannot create in the test database')
      assert.equal(identity.can_create_in_public, true, 'The test role cannot create in the public schema')

      const { rows: requiredRoles } = await admin.query(`
        SELECT count(*)::integer AS role_count
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
      `)
      assert.equal(
        requiredRoles[0].role_count,
        3,
        'The test server must already provide anon, authenticated, and service_role roles',
      )

      const { rows: existingObjects } = await admin.query(`
        SELECT count(*)::integer AS object_count
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      `)
      assert.equal(existingObjects[0].object_count, 0, `Refusing to modify non-empty test database ${databaseName}`)

      await admin.query(`
        CREATE TABLE public.products (
          id integer PRIMARY KEY,
          name text,
          image text,
          brand_id uuid,
          category_id uuid,
          subcategory_id uuid,
          comparable_group_id uuid,
          source text,
          source_product_id text,
          ean text,
          classification_source text,
          classification_confidence text
        );
        CREATE TABLE public.categories (
          id uuid PRIMARY KEY,
          name text NOT NULL
        );
        CREATE TABLE public.subcategories (
          id uuid PRIMARY KEY,
          name text NOT NULL,
          category_id uuid NOT NULL REFERENCES public.categories(id)
        );
        CREATE TABLE public.brands (
          id uuid PRIMARY KEY,
          name text NOT NULL
        );
        CREATE TABLE public.offers (
          id integer PRIMARY KEY,
          product_id integer REFERENCES public.products(id) ON DELETE CASCADE,
          cash_price numeric,
          supermarket text,
          previous_price numeric
        );
        CREATE TABLE public.price_history (
          id bigserial PRIMARY KEY,
          product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
          offer_id bigint,
          observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          cash_price numeric,
          source text
        );
        CREATE TABLE public.price_update_log (
          id bigserial PRIMARY KEY,
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          changes jsonb NOT NULL DEFAULT '[]'::jsonb
        );
        CREATE TABLE public.product_price_status (
          product_id bigint PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
          classification text NOT NULL
            CHECK (classification IN ('INFORMACION_INSUFICIENTE', 'OFERTA')),
          anomaly_score numeric NOT NULL,
          offer_score numeric NOT NULL,
          confidence text NOT NULL,
          confidence_percentage numeric NOT NULL,
          data_quality jsonb NOT NULL,
          rules_version text NOT NULL,
          price_fingerprint text NOT NULL,
          comparable_product_ids bigint[] NOT NULL DEFAULT '{}'::bigint[],
          analysis_details jsonb NOT NULL,
          analyzed_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        );
      `)

      await admin.query(`
        INSERT INTO public.products (id, name)
        SELECT product_id, 'capacity fixture ' || product_id
        FROM generate_series(1000, 25998) AS ids(product_id)
      `)
      await admin.query(
        "INSERT INTO public.products (id, name) VALUES (98, 'unrelated metadata fixture')",
      )
      await admin.query(`
        CREATE FUNCTION public.enqueue_product_price_status_refresh_related(integer[], uuid[])
        RETURNS integer
        LANGUAGE sql
        AS $$ SELECT 0 $$
      `)
      await assert.rejects(
        admin.query(migration),
        /A durable price-status function already exists/,
      )
      await admin.query('ROLLBACK')
      await admin.query(
        'DROP FUNCTION public.enqueue_product_price_status_refresh_related(integer[], uuid[])',
      )
      await admin.query(migration)
      await assert.rejects(
        admin.query(migration),
        /A durable price-status target object already exists/,
      )
      await admin.query('ROLLBACK')

      const { rows: security } = await admin.query(`
        SELECT
          (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_price_status_refresh_queue'::regclass) AS rls_enabled,
          has_function_privilege('service_role', 'public.claim_product_price_status_refresh(integer,integer)', 'EXECUTE') AS service_can_claim,
          has_function_privilege('anon', 'public.claim_product_price_status_refresh(integer,integer)', 'EXECUTE') AS anon_can_claim,
          has_table_privilege('service_role', 'public.product_price_status_refresh_queue', 'INSERT') AS service_can_insert_queue
      `)
      assert.deepEqual(security[0], {
        rls_enabled: true,
        service_can_claim: true,
        anon_can_claim: false,
        service_can_insert_queue: false,
      })

      await admin.query(`
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE
          ON public.products, public.offers, public.price_history, public.price_update_log,
             public.product_price_status, public.categories, public.subcategories, public.brands
          TO service_role;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
        SET ROLE service_role;
        INSERT INTO public.products (id, name) VALUES (13, 'service role writer');
        RESET ROLE;
      `)
      const { rows: serviceRoleQueue } = await admin.query(`
        SELECT status
        FROM public.product_price_status_refresh_queue
        WHERE product_id = 13
      `)
      assert.deepEqual(serviceRoleQueue, [{ status: 'pending' }])
      await admin.query('DELETE FROM public.products WHERE id = 13')

      const categoryId = '00000000-0000-0000-0000-000000000001'
      const subcategoryId = '00000000-0000-0000-0000-000000000002'
      await admin.query('INSERT INTO public.categories (id, name) VALUES ($1, $2)', [categoryId, 'Fixture'])
      await admin.query(
        'INSERT INTO public.subcategories (id, name, category_id) VALUES ($1, $2, $3)',
        [subcategoryId, 'Fixture subcategory', categoryId],
      )
      await admin.query(
        'INSERT INTO public.products (id, name, category_id, subcategory_id) VALUES (10, $1, $2, $3), (11, $1, $2, $3), (12, $1, $2, $3)',
        ['fixture', categoryId, subcategoryId],
      )
      await admin.query(
        'INSERT INTO public.offers (id, product_id, cash_price, supermarket) VALUES (100, 10, 100, $1), (110, 11, 120, $1), (120, 12, 140, $1)',
        ['Fixture market'],
      )
      await admin.query('INSERT INTO public.price_history (id, product_id) VALUES (1000, 10), (1100, 11), (1200, 12)')

      const { rows: initialQueue } = await admin.query(`
        SELECT product_id, generation, status
        FROM public.product_price_status_refresh_queue
        ORDER BY product_id
      `)
      assert.deepEqual(initialQueue, [
        { product_id: 10, generation: '1', status: 'pending' },
        { product_id: 11, generation: '1', status: 'pending' },
        { product_id: 12, generation: '1', status: 'pending' },
      ])

      await admin.query(
        'SELECT public.enqueue_product_price_status_refresh(ARRAY[10, 10, 11]::integer[])',
      )
      const { rows: deduplicated } = await admin.query(`
        SELECT product_id, generation, count(*) OVER (PARTITION BY product_id) AS copies
        FROM public.product_price_status_refresh_queue
        ORDER BY product_id
      `)
      assert.deepEqual(deduplicated.map((row) => [row.product_id, row.generation, row.copies]), [
        [10, '1', '1'],
        [11, '1', '1'],
        [12, '1', '1'],
      ])

      await admin.query('BEGIN')
      await admin.query(
        'SELECT product_id FROM public.product_price_status_refresh_queue WHERE product_id = 10 FOR UPDATE',
      )
      const { rows: unlockedClaims } = await secondWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(3, 300)',
      )
      assert.deepEqual(unlockedClaims.map((claim) => claim.product_id).sort((a, b) => a - b), [11, 12])
      await admin.query('ROLLBACK')

      const { rows: lockedClaim } = await firstWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(lockedClaim.length, 1)
      assert.equal(lockedClaim[0].product_id, 10)

      await admin.query('INSERT INTO public.price_history (id, product_id) VALUES (1001, 10)')
      assert.equal(await saveAndComplete(admin, lockedClaim[0]), 'superseded')
      const { rows: staleStatusCount } = await admin.query(
        'SELECT count(*)::integer AS count FROM public.product_price_status WHERE product_id = 10',
      )
      assert.equal(staleStatusCount[0].count, 0)

      const { rows: latestClaim } = await secondWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(latestClaim[0].product_id, 10)
      assert.equal(Number(latestClaim[0].generation), Number(lockedClaim[0].generation) + 1)
      const invalidStatus = JSON.parse(statusPayload(10))
      invalidStatus.classification = 'INVALID'
      await assert.rejects(saveAndComplete(admin, latestClaim[0], JSON.stringify(invalidStatus)))
      const { rows: rolledBackSave } = await admin.query(`
        SELECT queue.status, status.price_fingerprint
        FROM public.product_price_status_refresh_queue AS queue
        LEFT JOIN public.product_price_status AS status USING (product_id)
        WHERE queue.product_id = 10
      `)
      assert.deepEqual(rolledBackSave, [{
        status: 'processing',
        price_fingerprint: null,
      }])
      const { rows: failedAtomicSave } = await admin.query(
        'SELECT public.fail_product_price_status_refresh($1, $2, $3, $4) AS status',
        [latestClaim[0].product_id, latestClaim[0].generation, latestClaim[0].lease_token, 'fixture constraint failure'],
      )
      assert.equal(failedAtomicSave[0].status, 'pending')
      await admin.query(`
        UPDATE public.product_price_status_refresh_queue
        SET available_at = clock_timestamp()
        WHERE product_id = 10
      `)
      const { rows: retryAfterSaveFailure } = await secondWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(retryAfterSaveFailure[0].product_id, 10)
      assert.equal(Number(retryAfterSaveFailure[0].generation), Number(latestClaim[0].generation))
      assert.notEqual(retryAfterSaveFailure[0].lease_token, latestClaim[0].lease_token)
      assert.equal(await saveAndComplete(admin, retryAfterSaveFailure[0]), 'completed')
      const { rows: savedLatestStatus } = await admin.query(
        'SELECT classification FROM public.product_price_status WHERE product_id = 10',
      )
      assert.deepEqual(savedLatestStatus, [{ classification: 'INFORMACION_INSUFICIENTE' }])

      for (const claim of unlockedClaims) {
        assert.equal(await saveAndComplete(admin, claim), 'completed')
      }

      await admin.query('SELECT public.enqueue_product_price_status_refresh(ARRAY[11]::integer[])')
      const { rows: concurrentClaim } = await firstWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      const firstConcurrentStatus = JSON.parse(statusPayload(11))
      firstConcurrentStatus.price_fingerprint = 'concurrent-first'
      const secondConcurrentStatus = JSON.parse(statusPayload(11))
      secondConcurrentStatus.price_fingerprint = 'concurrent-second'
      const concurrentResults = await Promise.all([
        saveAndComplete(firstWorker, concurrentClaim[0], JSON.stringify(firstConcurrentStatus)),
        saveAndComplete(secondWorker, concurrentClaim[0], JSON.stringify(secondConcurrentStatus)),
      ])
      assert.deepEqual([...concurrentResults].sort(), ['completed', 'lease_lost'])
      const { rows: concurrentStatus } = await admin.query(
        'SELECT price_fingerprint FROM public.product_price_status WHERE product_id = 11',
      )
      assert.ok(['concurrent-first', 'concurrent-second'].includes(concurrentStatus[0].price_fingerprint))

      await admin.query('SELECT public.enqueue_product_price_status_refresh(ARRAY[10]::integer[])')
      const { rows: recoveredAfterRestart } = await restartedWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(recoveredAfterRestart[0].product_id, 10)
      assert.equal(await saveAndComplete(admin, recoveredAfterRestart[0]), 'completed')

      await admin.query('SELECT public.enqueue_product_price_status_refresh(ARRAY[10]::integer[])')
      const { rows: abandonedLease } = await firstWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      await admin.query(`
        UPDATE public.product_price_status_refresh_queue
        SET lease_expires_at = clock_timestamp() - interval '10 minutes'
        WHERE product_id = 10
      `)
      assert.equal(await saveAndComplete(admin, abandonedLease[0]), 'lease_expired')
      const { rows: expiredStatus } = await admin.query(
        'SELECT price_fingerprint FROM public.product_price_status WHERE product_id = 10',
      )
      assert.deepEqual(expiredStatus, [{ price_fingerprint: 'fixture-10' }])
      const { rows: reclaimedLease } = await secondWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(reclaimedLease[0].product_id, 10)
      assert.notEqual(reclaimedLease[0].lease_token, abandonedLease[0].lease_token)
      assert.equal(await saveAndComplete(admin, abandonedLease[0]), 'lease_lost')
      assert.equal(await saveAndComplete(admin, reclaimedLease[0]), 'completed')

      await admin.query('SELECT public.enqueue_product_price_status_refresh(ARRAY[10]::integer[])')
      let failedClaim
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { rows: claims } = await firstWorker.query(
          'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
        )
        assert.equal(claims.length, 1)
        failedClaim = claims[0]
        const { rows: failure } = await admin.query(
          'SELECT public.fail_product_price_status_refresh($1, $2, $3, $4) AS status',
          [failedClaim.product_id, failedClaim.generation, failedClaim.lease_token, 'fixture failure'],
        )
        if (attempt < 7) {
          assert.equal(failure[0].status, 'pending')
          await admin.query(`
            UPDATE public.product_price_status_refresh_queue
            SET available_at = clock_timestamp()
            WHERE product_id = 10
          `)
        } else {
          assert.equal(failure[0].status, 'dead_letter')
        }
      }

      const { rows: deadLetter } = await admin.query(`
        SELECT status, attempts, last_error
        FROM public.product_price_status_refresh_queue
        WHERE product_id = 10
      `)
      assert.deepEqual(deadLetter[0], {
        status: 'dead_letter',
        attempts: 8,
        last_error: 'fixture failure',
      })

      const { rows: requeued } = await admin.query(
        'SELECT public.requeue_product_price_status_refresh_dead_letters(ARRAY[10]::integer[]) AS count',
      )
      assert.equal(requeued[0].count, 1)
      const { rows: afterRequeue } = await admin.query(`
        SELECT status, attempts, generation
        FROM public.product_price_status_refresh_queue
        WHERE product_id = 10
      `)
      assert.equal(afterRequeue[0].status, 'pending')
      assert.equal(afterRequeue[0].attempts, 0)
      assert.equal(Number(afterRequeue[0].generation), Number(failedClaim.generation) + 1)

      const { rows: finalClaim } = await firstWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(finalClaim.length, 1)
      assert.equal(await saveAndComplete(admin, finalClaim[0]), 'completed')

      await admin.query('UPDATE public.categories SET name = $1 WHERE id = $2', ['Renamed fixture', categoryId])
      const { rows: categoryDependents } = await admin.query(`
        SELECT product_id
        FROM public.product_price_status_refresh_queue
        ORDER BY product_id
      `)
      assert.deepEqual(categoryDependents.map((row) => row.product_id), [10, 11, 12])
      assert.equal((await drainClaims(admin)).length, 3)

      await admin.query(
        'UPDATE public.subcategories SET name = $1 WHERE id = $2',
        ['Renamed fixture subcategory', subcategoryId],
      )
      assert.equal((await drainClaims(admin)).length, 3)

      await admin.query(
        `INSERT INTO public.price_update_log (changes)
         VALUES ($1::jsonb)`,
        [JSON.stringify([{ productId: 10, offerId: 100, updatedCashPrice: 125 }])],
      )
      const { rows: freshHistory } = await admin.query(
        'SELECT * FROM public.get_product_price_status_refresh_history(ARRAY[10]::integer[])',
      )
      assert.equal(freshHistory.length, 1)
      assert.equal(freshHistory[0].changes[0].updatedCashPrice, 125)
      const { rows: logEnqueue } = await admin.query(`
        SELECT product_id
        FROM public.product_price_status_refresh_queue
        ORDER BY product_id
      `)
      assert.deepEqual(logEnqueue.map((row) => row.product_id), [10, 11, 12])
      assert.equal((await drainClaims(admin)).length, 3)

      await admin.query(
        'UPDATE public.offers SET cash_price = 130 WHERE id = 100',
      )
      const { rows: offerDependents } = await admin.query(`
        SELECT product_id
        FROM public.product_price_status_refresh_queue
        ORDER BY product_id
      `)
      assert.deepEqual(offerDependents.map((row) => row.product_id), [10, 11, 12])
      assert.equal((await drainClaims(admin)).length, 3)

      await admin.query(`
        INSERT INTO public.products (id, name)
        VALUES
          (20, 'Alfajor de chocolate'),
          (21, 'Alfajor clásico'),
          (22, 'Producto sin clasificación')
      `)
      const { rows: inferredMemberships } = await admin.query(`
        SELECT product_id, group_key
        FROM public.product_price_status_comparable_group_memberships
        WHERE product_id IN (20, 21, 22)
        ORDER BY product_id
      `)
      assert.deepEqual(inferredMemberships.map((row) => row.group_key), [
        '["classification", "alimentos", "golosinas"]',
        '["classification", "alimentos", "golosinas"]',
        null,
      ])
      const { rows: inferredQueue } = await admin.query(`
        SELECT product_id
        FROM public.product_price_status_refresh_queue
        WHERE product_id >= 20
        ORDER BY product_id
      `)
      assert.deepEqual(inferredQueue.map((row) => row.product_id), [20, 21, 22])
      assert.equal((await drainClaims(admin)).length, 3)

      await admin.query(
        `INSERT INTO public.offers (id, product_id, cash_price, supermarket)
         VALUES (200, 20, 100, 'Fixture market')`,
      )
      const { rows: inferredOfferDependents } = await admin.query(`
        SELECT product_id
        FROM public.product_price_status_refresh_queue
        WHERE product_id >= 20
        ORDER BY product_id
      `)
      assert.deepEqual(inferredOfferDependents.map((row) => row.product_id), [20, 21])
      assert.equal((await drainClaims(admin)).length, 2)

      await admin.query(
        `UPDATE public.products
         SET name = 'Producto sin clasificación'
         WHERE id = 21`,
      )
      const { rows: oldInferredGroupDependents } = await admin.query(`
        SELECT product_id
        FROM public.product_price_status_refresh_queue
        WHERE product_id >= 20
        ORDER BY product_id
      `)
      assert.deepEqual(oldInferredGroupDependents.map((row) => row.product_id), [20, 21])
      assert.equal((await drainClaims(admin)).length, 2)

      const { rows: prefilled } = await admin.query(`
        SELECT public.enqueue_product_price_status_refresh(
          ARRAY(SELECT product_id FROM generate_series(1000, 25998) AS ids(product_id))
        ) AS count
      `)
      assert.equal(prefilled[0].count, 24999)

      const { rows: initialEvent } = await admin.query(`
        SELECT first_enqueued_at
        FROM public.product_price_status_refresh_queue
        WHERE product_id = 1000
      `)
      await admin.query(
        'INSERT INTO public.offers (id, product_id, cash_price, supermarket) VALUES (90000, 1000, 50, $1)',
        ['Capacity fixture'],
      )
      await admin.query('UPDATE public.products SET image = $1 WHERE id = 1000', ['unrelated-image-change'])
      await admin.query('INSERT INTO public.price_history (product_id, cash_price) VALUES (1000, 51)')
      const { rows: coalescedCount } = await admin.query(
        'SELECT count(*)::integer AS count FROM public.product_price_status_refresh_queue',
      )
      assert.equal(coalescedCount[0].count, 24999)

      await admin.query('INSERT INTO public.products (id, name) VALUES (99, $1)', ['capacity boundary'])
      const { rows: fullQueue } = await admin.query(
        'SELECT count(*)::integer AS count FROM public.product_price_status_refresh_queue',
      )
      assert.equal(fullQueue[0].count, 25000)

      await admin.query(`
        UPDATE public.products
        SET source_product_id = 'source-only-change',
            ean = '7790000000098',
            classification_source = 'manual',
            classification_confidence = 'high',
            comparable_group_id = '00000000-0000-0000-0000-000000000001'
        WHERE id = 98
      `)
      const { rows: unrelatedMetadataAtCapacity } = await admin.query(`
        SELECT
          count(*)::integer AS queue_count,
          count(*) FILTER (WHERE product_id = 98)::integer AS metadata_product_queued
        FROM public.product_price_status_refresh_queue
      `)
      assert.deepEqual(unrelatedMetadataAtCapacity[0], {
        queue_count: 25000,
        metadata_product_queued: 0,
      })

      await assert.rejects(
        admin.query('INSERT INTO public.products (id, name) VALUES (999, $1)', ['must roll back']),
        (error) => error.code === 'P7501',
      )
      const { rows: overflowRollback } = await admin.query(`
        SELECT
          (SELECT count(*)::integer FROM public.products WHERE id = 999) AS product_count,
          (SELECT count(*)::integer FROM public.product_price_status_refresh_queue) AS queue_count
      `)
      assert.deepEqual(overflowRollback[0], { product_count: 0, queue_count: 25000 })

      await firstWorker.query('BEGIN')
      await firstWorker.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
      await assert.rejects(
        firstWorker.query('INSERT INTO public.products (id, name) VALUES (103, $1)', ['isolation guard']),
        (error) => error.code === 'P7502',
      )
      await firstWorker.query('ROLLBACK')
      const { rows: isolationRollback } = await admin.query(`
        SELECT
          (SELECT count(*)::integer FROM public.products WHERE id = 103) AS product_count,
          (SELECT count(*)::integer FROM public.product_price_status_refresh_queue) AS queue_count
      `)
      assert.deepEqual(isolationRollback[0], { product_count: 0, queue_count: 25000 })

      await admin.query(
        'DELETE FROM public.product_price_status_refresh_queue WHERE product_id = 25998',
      )
      await firstWorker.query('BEGIN')
      await firstWorker.query('SELECT pg_advisory_xact_lock(20261113, 25000)')
      const firstConcurrentEnqueue = firstWorker.query(
        'INSERT INTO public.products (id, name) VALUES (100, $1)',
        ['concurrent one'],
      )
      await firstConcurrentEnqueue
      const secondConcurrentEnqueue = secondWorker.query(
        'INSERT INTO public.products (id, name) VALUES (101, $1)',
        ['concurrent two'],
      )
      let lockWaitError = null
      try {
        await waitForLockWait(admin, 'price_status_outbox_worker_two_test')
      } catch (error) {
        lockWaitError = error
      } finally {
        await firstWorker.query('COMMIT')
      }
      const concurrentEnqueues = await Promise.allSettled([
        firstConcurrentEnqueue,
        secondConcurrentEnqueue,
      ])
      assert.ifError(lockWaitError)
      assert.equal(concurrentEnqueues.filter((result) => result.status === 'fulfilled').length, 1)
      assert.equal(
        concurrentEnqueues.filter((result) => result.status === 'rejected' && result.reason.code === 'P7501').length,
        1,
      )
      const { rows: concurrentCapacity } = await admin.query(`
        SELECT
          count(*)::integer AS queue_count,
          (SELECT count(*)::integer FROM public.products WHERE id IN (100, 101)) AS committed_products
        FROM public.product_price_status_refresh_queue
      `)
      assert.deepEqual(concurrentCapacity[0], { queue_count: 25000, committed_products: 1 })

      await admin.query(`
        UPDATE public.product_price_status_refresh_queue
        SET available_at = clock_timestamp() + interval '1 hour'
        WHERE product_id <> 1000
      `)
      const { rows: firstAttempt } = await firstWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(firstAttempt[0].product_id, 1000)
      await admin.query(
        'SELECT public.fail_product_price_status_refresh($1, $2, $3, $4)',
        [firstAttempt[0].product_id, firstAttempt[0].generation, firstAttempt[0].lease_token, 'capacity test retry'],
      )
      await admin.query(`
        UPDATE public.product_price_status_refresh_queue
        SET available_at = clock_timestamp()
        WHERE product_id = 1000
      `)
      const { rows: retryAttempt } = await secondWorker.query(
        'SELECT * FROM public.claim_product_price_status_refresh(1, 300)',
      )
      assert.equal(retryAttempt[0].product_id, 1000)
      const { rows: preservedEventAge } = await admin.query(`
        SELECT first_enqueued_at
        FROM public.product_price_status_refresh_queue
        WHERE product_id = 1000
      `)
      assert.equal(
        preservedEventAge[0].first_enqueued_at.toISOString(),
        initialEvent[0].first_enqueued_at.toISOString(),
      )

      const { rows: monitorSnapshot } = await admin.query(
        'SELECT public.monitor_product_price_status_refresh_queue() AS snapshot',
      )
      const snapshot = monitorSnapshot[0].snapshot
      assert.equal(snapshot.queue.total, 25000)
      assert.equal(snapshot.queue.capacity, 25000)
      assert.ok(snapshot.metrics.total_enqueued >= 25000)
      assert.ok(snapshot.notifications.some((alert) => alert.key === 'queue_rows_warning_15000'))
      assert.ok(snapshot.notifications.some((alert) => alert.key === 'queue_rows_critical_20000'))
      assert.ok(snapshot.notifications.some((alert) => alert.key === 'queue_rows_hard_cap_25000'))

      await admin.query(`
        UPDATE public.product_price_status_refresh_queue
        SET first_enqueued_at = clock_timestamp() - interval '25 hours'
        WHERE product_id = 1000
      `)
      const { rows: agedMonitorSnapshot } = await admin.query(
        'SELECT public.monitor_product_price_status_refresh_queue() AS snapshot',
      )
      const agedNotifications = agedMonitorSnapshot[0].snapshot.notifications
      assert.ok(agedNotifications.some((alert) => alert.key === 'queue_age_warning_12h'))
      assert.ok(agedNotifications.some((alert) => alert.key === 'queue_age_critical_18h'))
      assert.ok(agedNotifications.some((alert) => alert.key === 'queue_age_incident_24h'))
      const { rows: monitorQueueCount } = await admin.query(
        'SELECT count(*)::integer AS count FROM public.product_price_status_refresh_queue',
      )
      assert.equal(monitorQueueCount[0].count, 25000)

      await admin.query(
        "INSERT INTO public.offers (id, product_id, cash_price, supermarket) VALUES (90001, 25997, 50, 'Capacity fixture')",
      )
      await admin.query(
        'DELETE FROM public.product_price_status_refresh_queue WHERE product_id = 25997',
      )
      await admin.query('INSERT INTO public.products (id, name) VALUES (102, $1)', ['refill capacity'])
      const { rows: deletedUnqueuedProduct } = await admin.query(
        'SELECT public.delete_catalog_product(25997) AS result',
      )
      assert.deepEqual(deletedUnqueuedProduct[0].result, { status: 'deleted' })
      const { rows: fullAfterUnqueuedDelete } = await admin.query(
        'SELECT count(*)::integer AS count FROM public.product_price_status_refresh_queue',
      )
      assert.equal(fullAfterUnqueuedDelete[0].count, 25000)

      const { rows: deletedProduct } = await admin.query(
        "SELECT public.delete_catalog_product(1000) AS result",
      )
      assert.deepEqual(deletedProduct[0].result, { status: 'deleted' })
      const { rows: deletionState } = await admin.query(`
        SELECT
          (SELECT count(*)::integer FROM public.products WHERE id = 1000) AS product_count,
          (SELECT count(*)::integer FROM public.offers WHERE id = 90000) AS offer_count,
          (SELECT count(*)::integer FROM public.product_price_status_refresh_queue WHERE product_id = 1000) AS queue_count
      `)
      assert.deepEqual(deletionState[0], { product_count: 0, offer_count: 0, queue_count: 0 })
      const { rows: resolvedMonitor } = await admin.query(
        'SELECT public.monitor_product_price_status_refresh_queue() AS snapshot',
      )
      const hardCapResolution = resolvedMonitor[0].snapshot.notifications.find(
        (notification) => notification.key === 'queue_rows_hard_cap_25000',
      )
      assert.deepEqual(hardCapResolution, {
        key: 'queue_rows_hard_cap_25000',
        severity: 'incident',
        description: 'La cola alcanzó su límite duro de 25.000 filas.',
        threshold: 25_000,
        observed_value: 24_999,
        resolved: true,
      })
    } finally {
      await admin.query('ROLLBACK').catch(() => {})
      for (const client of clients) {
        if (connected > 0) {
          await client.end().catch(() => {})
          connected -= 1
        }
      }
    }
  },
)
