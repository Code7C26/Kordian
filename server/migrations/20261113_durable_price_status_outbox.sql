BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = pg_catalog, public;

LOCK TABLE
  public.products,
  public.offers,
  public.price_history,
  public.price_update_log,
  public.categories,
  public.subcategories,
  public.brands
IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_products_id_type oid;
  v_products_category_type oid;
  v_products_subcategory_type oid;
  v_products_brand_type oid;
  v_offers_product_id_type oid;
  v_history_product_id_type oid;
  v_status_product_id_type oid;
  v_status_comparables_type oid;
  v_log_changes_type oid;
BEGIN
  IF current_setting('server_version_num')::integer < 130000
    OR current_setting('server_encoding') <> 'UTF8'
  THEN
    RAISE EXCEPTION
      'Comparable-group normalization requires PostgreSQL 13+ with UTF8 server encoding';
  END IF;

  IF to_regclass('public.products') IS NULL
    OR to_regclass('public.offers') IS NULL
    OR to_regclass('public.price_history') IS NULL
    OR to_regclass('public.product_price_status') IS NULL
    OR to_regclass('public.categories') IS NULL
    OR to_regclass('public.subcategories') IS NULL
    OR to_regclass('public.brands') IS NULL
    OR to_regclass('public.price_update_log') IS NULL
  THEN
    RAISE EXCEPTION
      'Required catalog, history, status, taxonomy, brand, and price_update_log tables must exist';
  END IF;

  IF to_regclass('public.product_price_status_refresh_queue') IS NOT NULL
    OR to_regclass('public.product_price_status_refresh_metrics') IS NOT NULL
    OR to_regclass('public.product_price_status_refresh_alerts') IS NOT NULL
    OR to_regclass('public.product_price_status_comparable_group_memberships') IS NOT NULL
    OR to_regprocedure('public.complete_product_price_status_refresh(integer,bigint,uuid)') IS NOT NULL
    OR to_regprocedure('public.delete_catalog_product(integer)') IS NOT NULL
    OR to_regprocedure('public.monitor_product_price_status_refresh_queue()') IS NOT NULL
    OR to_regprocedure('public.enqueue_product_price_status_refresh_related(integer[],uuid[])') IS NOT NULL
    OR to_regclass('public.product_price_status_refresh_queue_pending_idx') IS NOT NULL
    OR to_regclass('public.product_price_status_refresh_queue_expired_idx') IS NOT NULL
    OR to_regclass('public.product_price_status_comparable_group_memberships_group_idx') IS NOT NULL
  THEN
    RAISE EXCEPTION
      'A durable price-status target object already exists; inspect migration state instead of applying or rerunning this candidate';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('product_price_status_refresh_queue_products', 'products'),
      ('product_price_status_refresh_queue_product_delete', 'products'),
      ('product_price_status_refresh_queue_offers', 'offers'),
      ('product_price_status_refresh_queue_price_history', 'price_history'),
      ('product_price_status_refresh_queue_price_update_log', 'price_update_log'),
      ('product_price_status_refresh_queue_categories', 'categories'),
      ('product_price_status_refresh_queue_category_delete', 'categories'),
      ('product_price_status_refresh_queue_subcategories', 'subcategories'),
      ('product_price_status_refresh_queue_subcategory_delete', 'subcategories'),
      ('product_price_status_refresh_queue_brands', 'brands'),
      ('product_price_status_refresh_queue_brand_delete', 'brands')
    ) AS expected(trigger_name, table_name)
    JOIN pg_trigger AS trigger_row
      ON trigger_row.tgrelid = to_regclass('public.' || expected.table_name)
     AND trigger_row.tgname = expected.trigger_name
     AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'A durable price-status trigger name already exists; inspect the partial/applied migration state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.enqueue_product_price_status_refresh(integer[])'),
      ('public.enqueue_product_price_status_refresh_related(integer[],uuid[])'),
      ('public.enqueue_product_price_status_refresh_related(integer[],uuid[],integer[])'),
      ('public.normalize_price_status_comparable_text(text)'),
      ('public.product_price_status_comparable_group_key(integer)'),
      ('public.refresh_product_price_status_comparable_group_memberships(integer[])'),
      ('public.get_product_price_status_refresh_history(integer[])'),
      ('public.claim_product_price_status_refresh(integer,integer)'),
      ('public.save_and_complete_product_price_status_refresh(integer,bigint,uuid,jsonb)'),
      ('public.fail_product_price_status_refresh(integer,bigint,uuid,text)'),
      ('public.requeue_product_price_status_refresh_dead_letters(integer[])'),
      ('public.delete_catalog_product(integer)'),
      ('public.monitor_product_price_status_refresh_queue()'),
      ('public.queue_product_price_status_refresh_from_product()'),
      ('public.queue_product_price_status_refresh_before_product_delete()'),
      ('public.queue_product_price_status_refresh_from_child()'),
      ('public.queue_product_price_status_refresh_from_price_update_log()'),
      ('public.queue_product_price_status_refresh_from_category()'),
      ('public.queue_product_price_status_refresh_from_subcategory()'),
      ('public.queue_product_price_status_refresh_from_brand()')
    ) AS expected(signature)
    WHERE to_regprocedure(expected.signature) IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'A durable price-status function already exists; inspect migration state instead of replacing it';
  END IF;

  SELECT atttypid INTO v_products_id_type
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'id' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_products_category_type
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'category_id' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_products_subcategory_type
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'subcategory_id' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_products_brand_type
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'brand_id' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_offers_product_id_type
  FROM pg_attribute
  WHERE attrelid = 'public.offers'::regclass
    AND attname = 'product_id' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_history_product_id_type
  FROM pg_attribute
  WHERE attrelid = 'public.price_history'::regclass
    AND attname = 'product_id' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_status_product_id_type
  FROM pg_attribute
  WHERE attrelid = 'public.product_price_status'::regclass
    AND attname = 'product_id' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_status_comparables_type
  FROM pg_attribute
  WHERE attrelid = 'public.product_price_status'::regclass
    AND attname = 'comparable_product_ids' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid INTO v_log_changes_type
  FROM pg_attribute
  WHERE attrelid = 'public.price_update_log'::regclass
    AND attname = 'changes' AND attnum > 0 AND NOT attisdropped;

  IF v_products_id_type IS DISTINCT FROM 'integer'::regtype::oid
    OR v_products_category_type IS DISTINCT FROM 'uuid'::regtype::oid
    OR v_products_subcategory_type IS DISTINCT FROM 'uuid'::regtype::oid
    OR v_products_brand_type IS DISTINCT FROM 'uuid'::regtype::oid
    OR v_offers_product_id_type IS DISTINCT FROM 'integer'::regtype::oid
    OR v_history_product_id_type IS DISTINCT FROM 'bigint'::regtype::oid
    OR v_status_product_id_type IS DISTINCT FROM 'bigint'::regtype::oid
    OR v_status_comparables_type IS DISTINCT FROM 'bigint[]'::regtype::oid
    OR v_log_changes_type IS DISTINCT FROM 'jsonb'::regtype::oid
  THEN
    RAISE EXCEPTION
      'Unexpected catalog identifiers or history/status/log column types; inspect the live schema before applying';
  END IF;

  IF EXISTS (
    WITH expected(table_name, column_name, expected_type) AS (
      VALUES
        ('product_price_status', 'classification', 'text'),
        ('product_price_status', 'anomaly_score', 'numeric'),
        ('product_price_status', 'offer_score', 'numeric'),
        ('product_price_status', 'confidence', 'text'),
        ('product_price_status', 'confidence_percentage', 'numeric'),
        ('product_price_status', 'data_quality', 'jsonb'),
        ('product_price_status', 'rules_version', 'text'),
        ('product_price_status', 'price_fingerprint', 'text'),
        ('product_price_status', 'analysis_details', 'jsonb'),
        ('product_price_status', 'analyzed_at', 'timestamp with time zone'),
        ('product_price_status', 'updated_at', 'timestamp with time zone'),
        ('price_update_log', 'updated_at', 'timestamp with time zone'),
        ('categories', 'id', 'uuid'),
        ('subcategories', 'id', 'uuid'),
        ('brands', 'id', 'uuid')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_class AS relation
      ON relation.oid = to_regclass('public.' || expected.table_name)
    LEFT JOIN pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE format_type(attribute.atttypid, attribute.atttypmod)
      IS DISTINCT FROM expected.expected_type
  ) THEN
    RAISE EXCEPTION
      'A required status, history-log, category, subcategory, or brand column is missing or has an unexpected type';
  END IF;
END;
$preflight$;

CREATE TABLE public.product_price_status_refresh_queue (
  product_id integer PRIMARY KEY
    REFERENCES public.products(id)
    ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  first_enqueued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT product_price_status_refresh_queue_lease_state_check CHECK (
    (status = 'processing'
      AND claimed_at IS NOT NULL
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing'
      AND claimed_at IS NULL
      AND lease_token IS NULL
      AND lease_expires_at IS NULL)
  )
);

CREATE INDEX product_price_status_refresh_queue_pending_idx
  ON public.product_price_status_refresh_queue (available_at, product_id)
  WHERE status = 'pending';
CREATE INDEX product_price_status_refresh_queue_expired_idx
  ON public.product_price_status_refresh_queue (lease_expires_at, product_id)
  WHERE status = 'processing';

ALTER TABLE public.product_price_status_refresh_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_price_status_refresh_queue FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.product_price_status_refresh_queue FROM service_role;
CREATE POLICY product_price_status_refresh_queue_service_role
  ON public.product_price_status_refresh_queue
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
GRANT SELECT, UPDATE, DELETE
  ON public.product_price_status_refresh_queue TO service_role;

CREATE TABLE public.product_price_status_refresh_metrics (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  total_enqueued bigint NOT NULL DEFAULT 0 CHECK (total_enqueued >= 0),
  total_completed bigint NOT NULL DEFAULT 0 CHECK (total_completed >= 0),
  total_failures bigint NOT NULL DEFAULT 0 CHECK (total_failures >= 0),
  total_retries bigint NOT NULL DEFAULT 0 CHECK (total_retries >= 0),
  total_expired_leases bigint NOT NULL DEFAULT 0 CHECK (total_expired_leases >= 0),
  last_successful_at timestamptz,
  sample_at timestamptz,
  sampled_enqueued_total bigint NOT NULL DEFAULT 0,
  sampled_completed_total bigint NOT NULL DEFAULT 0,
  enqueue_rate_per_minute numeric,
  processing_rate_per_minute numeric,
  pending_count integer NOT NULL DEFAULT 0,
  processing_count integer NOT NULL DEFAULT 0,
  dead_letter_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  oldest_event_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.product_price_status_refresh_metrics (singleton)
VALUES (true);

ALTER TABLE public.product_price_status_refresh_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_price_status_refresh_metrics
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_price_status_refresh_metrics FROM service_role;
CREATE POLICY product_price_status_refresh_metrics_service_role
  ON public.product_price_status_refresh_metrics
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
GRANT SELECT, UPDATE ON public.product_price_status_refresh_metrics TO service_role;

CREATE TABLE public.product_price_status_refresh_alerts (
  alert_key text PRIMARY KEY,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'critical', 'incident')),
  threshold numeric NOT NULL,
  notification_interval_seconds integer NOT NULL CHECK (notification_interval_seconds > 0),
  active boolean NOT NULL DEFAULT false,
  first_triggered_at timestamptz,
  last_triggered_at timestamptz,
  last_notified_at timestamptz,
  resolved_at timestamptz,
  observed_value numeric,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.product_price_status_refresh_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_price_status_refresh_alerts
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_price_status_refresh_alerts FROM service_role;
CREATE POLICY product_price_status_refresh_alerts_service_role
  ON public.product_price_status_refresh_alerts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.product_price_status_refresh_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_product_price_status_refresh(
  p_product_ids integer[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product_ids integer[];
  v_queue_count integer;
  v_new_count integer;
  v_queued_count integer;
BEGIN
  SELECT array_agg(DISTINCT requested.product_id ORDER BY requested.product_id)
  INTO v_product_ids
  FROM unnest(COALESCE(p_product_ids, ARRAY[]::integer[])) AS requested(product_id)
  JOIN public.products AS product ON product.id = requested.product_id
  WHERE requested.product_id IS NOT NULL;

  IF COALESCE(cardinality(v_product_ids), 0) = 0 THEN
    RETURN 0;
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P7502',
      MESSAGE = 'PRICE_STATUS_QUEUE_REQUIRES_READ_COMMITTED',
      DETAIL = 'The durable queue capacity check requires READ COMMITTED so the advisory lock is followed by a fresh snapshot.';
  END IF;

  -- Serialize all enqueue capacity checks before counting and inserting rows.
  PERFORM pg_advisory_xact_lock(20261113, 25000);

  SELECT count(*)::integer
  INTO v_queue_count
  FROM public.product_price_status_refresh_queue;

  SELECT count(*)::integer
  INTO v_new_count
  FROM unnest(v_product_ids) AS requested(product_id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_price_status_refresh_queue AS queue
    WHERE queue.product_id = requested.product_id
  );

  IF v_queue_count + v_new_count > 25000 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P7501',
      MESSAGE = 'PRICE_STATUS_QUEUE_CAPACITY_EXCEEDED',
      DETAIL = 'The durable price-status queue hard cap is 25000 rows; the source transaction was rolled back.';
  END IF;

  INSERT INTO public.product_price_status_refresh_queue (
    product_id,
    generation,
    status,
    attempts,
    available_at,
    claimed_at,
    lease_token,
    lease_expires_at,
    last_error,
    first_enqueued_at,
    created_at,
    updated_at
  )
  SELECT
    candidate.product_id,
    1,
    'pending',
    0,
    clock_timestamp(),
    NULL,
    NULL,
    NULL,
    NULL,
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp()
  FROM (
    SELECT unnest(v_product_ids) AS product_id
  ) AS candidate
  ON CONFLICT (product_id) DO UPDATE
  SET
    generation = CASE
      WHEN public.product_price_status_refresh_queue.status IN ('processing', 'dead_letter')
        THEN public.product_price_status_refresh_queue.generation + 1
      ELSE public.product_price_status_refresh_queue.generation
    END,
    status = 'pending',
    attempts = CASE
      WHEN public.product_price_status_refresh_queue.status = 'dead_letter' THEN 0
      ELSE public.product_price_status_refresh_queue.attempts
    END,
    available_at = clock_timestamp(),
    claimed_at = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    last_error = NULL,
    updated_at = clock_timestamp();

  GET DIAGNOSTICS v_queued_count = ROW_COUNT;
  IF v_new_count > 0 THEN
    UPDATE public.product_price_status_refresh_metrics AS metrics
    SET
      total_enqueued = metrics.total_enqueued + v_new_count,
      updated_at = clock_timestamp()
    WHERE metrics.singleton;
  END IF;
  RETURN v_queued_count;
END;
$function$;

DO $comparability_preflight$
BEGIN
  IF to_regclass('public.product_price_status_comparable_group_memberships') IS NOT NULL
    OR to_regprocedure('public.product_price_status_comparable_group_key(integer)') IS NOT NULL
    OR to_regprocedure('public.refresh_product_price_status_comparable_group_memberships(integer[])') IS NOT NULL
  THEN
    RAISE EXCEPTION
      'Comparable-group membership objects already exist; inspect the partial/applied migration state instead of rerunning';
  END IF;
END;
$comparability_preflight$;

CREATE TABLE public.product_price_status_comparable_group_memberships (
  product_id integer PRIMARY KEY
    REFERENCES public.products(id)
    ON DELETE CASCADE,
  group_key text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX product_price_status_comparable_group_memberships_group_idx
  ON public.product_price_status_comparable_group_memberships (group_key, product_id)
  WHERE group_key IS NOT NULL;

ALTER TABLE public.product_price_status_comparable_group_memberships
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_price_status_comparable_group_memberships
  FROM PUBLIC, anon, authenticated;
CREATE POLICY product_price_status_comparable_group_memberships_service_role
  ON public.product_price_status_comparable_group_memberships
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.product_price_status_comparable_group_memberships TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_price_status_comparable_text(
  p_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT lower(regexp_replace(
    normalize(COALESCE(p_value, ''), NFD),
    U&'[\0300-\036F]',
    '',
    'g'
  ));
$function$;

CREATE OR REPLACE FUNCTION public.product_price_status_comparable_group_key(
  p_product_id integer
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_category_id uuid;
  v_subcategory_id uuid;
  v_category_name text;
  v_subcategory_name text;
  v_searchable_text text;
  v_inferred_category text;
  v_inferred_subcategory text;
BEGIN
  SELECT
    product.category_id,
    product.subcategory_id,
    COALESCE(
      NULLIF(to_jsonb(product) ->> 'category', ''),
      NULLIF(to_jsonb(product) ->> 'category_name', ''),
      category.name
    ),
    COALESCE(
      NULLIF(to_jsonb(product) ->> 'subcategory', ''),
      NULLIF(to_jsonb(product) ->> 'subcategory_name', ''),
      subcategory.name
    ),
    public.normalize_price_status_comparable_text(concat_ws(' ',
      to_jsonb(product) ->> 'name',
      COALESCE(NULLIF(to_jsonb(product) ->> 'brand', ''), brand.name),
      to_jsonb(product) ->> 'description',
      to_jsonb(product) ->> 'variant',
      to_jsonb(product) ->> 'presentation',
      COALESCE(NULLIF(to_jsonb(product) ->> 'subcategory', ''), subcategory.name)
    ))
  INTO
    v_category_id,
    v_subcategory_id,
    v_category_name,
    v_subcategory_name,
    v_searchable_text
  FROM public.products AS product
  LEFT JOIN public.categories AS category ON category.id = product.category_id
  LEFT JOIN public.subcategories AS subcategory ON subcategory.id = product.subcategory_id
  LEFT JOIN public.brands AS brand ON brand.id = product.brand_id
  WHERE product.id = p_product_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_category_id IS NOT NULL AND v_subcategory_id IS NOT NULL THEN
    RETURN jsonb_build_array('ids', v_category_id::text, v_subcategory_id::text)::text;
  END IF;
  IF v_category_name IS NOT NULL AND v_subcategory_name IS NOT NULL THEN
    RETURN jsonb_build_array(
      'names',
      public.normalize_price_status_comparable_text(v_category_name),
      public.normalize_price_status_comparable_text(v_subcategory_name)
    )::text;
  END IF;

  SELECT rule.category_key, rule.subcategory_key
  INTO v_inferred_category, v_inferred_subcategory
  FROM (VALUES
    (1, 'alimentos', 'golosinas', ARRAY['alfajor']::text[]),
    (2, 'alimentos', 'golosinas', ARRAY['chocolate']::text[]),
    (3, 'alimentos', 'golosinas', ARRAY['caramelo']::text[]),
    (4, 'alimentos', 'golosinas', ARRAY['chicle']::text[]),
    (5, 'alimentos', 'lacteos', ARRAY['leche']::text[]),
    (6, 'alimentos', 'lacteos', ARRAY['yogur']::text[]),
    (7, 'alimentos', 'lacteos', ARRAY['queso']::text[]),
    (8, 'alimentos', 'bebidas', ARRAY['agua', 'gaseosa', 'jugo', 'cerveza', 'vino', 'coca']::text[]),
    (9, 'alimentos', 'almacen', ARRAY['arroz']::text[]),
    (10, 'limpieza', 'lavado-ropa', ARRAY['jabon', 'detergente', 'suavizante']::text[]),
    (11, 'limpieza', 'desinfeccion', ARRAY['lavandina', 'desinfectante']::text[]),
    (12, 'higiene-cuidado-personal', 'higiene-bucal', ARRAY['dentifrico', 'pasta dental', 'cepillo dental']::text[]),
    (13, 'higiene-cuidado-personal', 'cabello', ARRAY['shampoo', 'acondicionador']::text[]),
    (14, 'salud', 'medicamentos', ARRAY['medicamento', 'alcohol etilico', 'analgesico', 'vitamina', 'jarabe', 'tafirol']::text[]),
    (15, 'electrodomesticos-tecnologia', 'electrodomesticos', ARRAY['electrodomestico', 'pava electrica', 'licuadora', 'heladera']::text[])
  ) AS rule(priority, category_key, subcategory_key, terms)
  WHERE EXISTS (
    SELECT 1
    FROM unnest(rule.terms) AS term(value)
    WHERE strpos(v_searchable_text, term.value) > 0
  )
  ORDER BY rule.priority
  LIMIT 1;

  IF v_inferred_category IS NULL OR v_inferred_subcategory IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_array(
    'classification',
    v_inferred_category,
    v_inferred_subcategory
  )::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_product_price_status_comparable_group_memberships(
  p_product_ids integer[]
)
RETURNS integer[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product_ids integer[] := COALESCE(
    ARRAY(
      SELECT DISTINCT requested.product_id
      FROM unnest(COALESCE(p_product_ids, ARRAY[]::integer[]))
        AS requested(product_id)
      WHERE requested.product_id IS NOT NULL
      ORDER BY requested.product_id
    ),
    ARRAY[]::integer[]
  );
  v_group_keys text[];
  v_affected_product_ids integer[];
BEGIN
  IF cardinality(v_product_ids) = 0 THEN
    RETURN ARRAY[]::integer[];
  END IF;

  PERFORM membership.product_id
  FROM public.product_price_status_comparable_group_memberships AS membership
  WHERE membership.product_id = ANY(v_product_ids)
  ORDER BY membership.product_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(DISTINCT membership.group_key)
      FILTER (WHERE membership.group_key IS NOT NULL), ARRAY[]::text[])
  INTO v_group_keys
  FROM public.product_price_status_comparable_group_memberships AS membership
  WHERE membership.product_id = ANY(v_product_ids);

  DELETE FROM public.product_price_status_comparable_group_memberships
  WHERE product_id = ANY(v_product_ids);

  INSERT INTO public.product_price_status_comparable_group_memberships (
    product_id, group_key, updated_at
  )
  SELECT product.id,
         public.product_price_status_comparable_group_key(product.id),
         clock_timestamp()
  FROM public.products AS product
  WHERE product.id = ANY(v_product_ids)
  ON CONFLICT (product_id) DO UPDATE
  SET group_key = EXCLUDED.group_key,
      updated_at = EXCLUDED.updated_at;

  SELECT COALESCE(array_agg(DISTINCT affected.product_id ORDER BY affected.product_id),
      ARRAY[]::integer[])
  INTO v_affected_product_ids
  FROM (
    SELECT requested.product_id
    FROM unnest(v_product_ids) AS requested(product_id)
    UNION
    SELECT membership.product_id
    FROM public.product_price_status_comparable_group_memberships AS membership
    WHERE membership.group_key = ANY(v_group_keys)
      AND membership.group_key IS NOT NULL
    UNION
    SELECT membership.product_id
    FROM public.product_price_status_comparable_group_memberships AS membership
    WHERE membership.product_id = ANY(v_product_ids)
      AND membership.group_key IS NOT NULL
    UNION
    SELECT peer.product_id
    FROM public.product_price_status_comparable_group_memberships AS peer
    JOIN public.product_price_status_comparable_group_memberships AS changed
      ON changed.group_key = peer.group_key
    WHERE changed.product_id = ANY(v_product_ids)
      AND peer.group_key IS NOT NULL
  ) AS affected;

  RETURN v_affected_product_ids;
END;
$function$;

INSERT INTO public.product_price_status_comparable_group_memberships (
  product_id,
  group_key
)
SELECT product.id,
       public.product_price_status_comparable_group_key(product.id)
FROM public.products AS product;

CREATE OR REPLACE FUNCTION public.enqueue_product_price_status_refresh_related(
  p_product_ids integer[],
  p_subcategory_ids uuid[] DEFAULT NULL,
  p_excluded_product_ids integer[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_related_ids integer[];
BEGIN
  SELECT array_agg(DISTINCT candidate.product_id ORDER BY candidate.product_id)
  INTO v_related_ids
  FROM (
    SELECT requested.product_id
    FROM unnest(COALESCE(p_product_ids, ARRAY[]::integer[])) AS requested(product_id)
    WHERE requested.product_id IS NOT NULL

    UNION

    SELECT peer.id
    FROM public.products AS peer
    WHERE peer.subcategory_id IN (
      SELECT matched.subcategory_id
      FROM unnest(COALESCE(p_product_ids, ARRAY[]::integer[]))
        AS requested(product_id)
      JOIN public.products AS matched ON matched.id = requested.product_id
      WHERE matched.subcategory_id IS NOT NULL
      UNION
      SELECT requested.subcategory_id
      FROM unnest(COALESCE(p_subcategory_ids, ARRAY[]::uuid[]))
        AS requested(subcategory_id)
      WHERE requested.subcategory_id IS NOT NULL
    )

    UNION

    SELECT membership_peer.product_id
    FROM public.product_price_status_comparable_group_memberships AS changed_membership
    JOIN public.product_price_status_comparable_group_memberships AS membership_peer
      ON membership_peer.group_key = changed_membership.group_key
    WHERE changed_membership.product_id = ANY(
      COALESCE(p_product_ids, ARRAY[]::integer[])
    )
      AND changed_membership.group_key IS NOT NULL

    UNION

    SELECT status.product_id::integer
    FROM public.product_price_status AS status
    WHERE status.comparable_product_ids
      && COALESCE(
        ARRAY(
          SELECT requested.product_id::bigint
          FROM unnest(COALESCE(p_product_ids, ARRAY[]::integer[])) AS requested(product_id)
          WHERE requested.product_id IS NOT NULL
        ),
        ARRAY[]::bigint[]
      )
  ) AS candidate
  WHERE NOT (candidate.product_id = ANY(
    COALESCE(p_excluded_product_ids, ARRAY[]::integer[])
  ));

  RETURN public.enqueue_product_price_status_refresh(
    COALESCE(v_related_ids, ARRAY[]::integer[])
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_price_status_refresh_history(
  p_product_ids integer[]
)
RETURNS TABLE (
  updated_at timestamptz,
  changes jsonb
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT log.updated_at, log.changes
  FROM public.price_update_log AS log
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(log.changes) = 'array' THEN log.changes
        ELSE '[]'::jsonb
      END
    ) AS change(entry)
    WHERE CASE
      WHEN change.entry ->> 'productId' ~ '^[1-9][0-9]*$' THEN
        CASE
          WHEN (change.entry ->> 'productId')::numeric <= 2147483647 THEN
            (change.entry ->> 'productId')::integer
              = ANY(COALESCE(p_product_ids, ARRAY[]::integer[]))
          ELSE false
        END
      ELSE false
    END
  )
  ORDER BY log.updated_at;
$function$;

CREATE OR REPLACE FUNCTION public.claim_product_price_status_refresh(
  p_batch_size integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  product_id integer,
  generation bigint,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_batch_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 1), 1), 100);
  v_lease_seconds integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 30), 3600);
  v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT queue.product_id, queue.status = 'processing' AS expired_lease
    FROM public.product_price_status_refresh_queue AS queue
    WHERE (queue.status = 'pending' AND queue.available_at <= v_now)
      OR (
        queue.status = 'processing'
        AND queue.lease_expires_at <= v_now
      )
    ORDER BY queue.available_at, queue.product_id
    FOR UPDATE SKIP LOCKED
    LIMIT v_batch_size
  ),
  claimed AS (
    UPDATE public.product_price_status_refresh_queue AS queue
    SET
      status = 'processing',
      attempts = queue.attempts + 1,
      claimed_at = v_now,
      lease_token = pg_catalog.gen_random_uuid(),
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      updated_at = v_now
    FROM candidates
    WHERE queue.product_id = candidates.product_id
    RETURNING queue.product_id, queue.generation, queue.lease_token, candidates.expired_lease
  ),
  metrics_updated AS (
    UPDATE public.product_price_status_refresh_metrics AS metrics
    SET
      total_expired_leases = metrics.total_expired_leases
        + (SELECT count(*) FROM claimed WHERE expired_lease),
      updated_at = v_now
    WHERE metrics.singleton
      AND EXISTS (SELECT 1 FROM claimed)
    RETURNING metrics.singleton
  )
  SELECT claimed.product_id, claimed.generation, claimed.lease_token
  FROM claimed
  CROSS JOIN metrics_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_and_complete_product_price_status_refresh(
  p_product_id integer,
  p_generation bigint,
  p_lease_token uuid,
  p_status jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_queue public.product_price_status_refresh_queue%ROWTYPE;
  v_deleted_count integer;
BEGIN
  SELECT queue.*
  INTO v_queue
  FROM public.product_price_status_refresh_queue AS queue
  WHERE queue.product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'lease_lost';
  END IF;
  IF v_queue.generation <> p_generation THEN
    RETURN 'superseded';
  END IF;
  IF v_queue.status <> 'processing'
    OR v_queue.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN 'lease_lost';
  END IF;
  IF v_queue.lease_expires_at <= clock_timestamp() THEN
    RETURN 'lease_expired';
  END IF;
  IF p_status IS NULL
    OR p_status ->> 'product_id' IS DISTINCT FROM p_product_id::text
    OR NULLIF(p_status ->> 'classification', '') IS NULL
    OR NULLIF(p_status ->> 'rules_version', '') IS NULL
    OR NULLIF(p_status ->> 'price_fingerprint', '') IS NULL
    OR jsonb_typeof(p_status -> 'comparable_product_ids') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_status -> 'analysis_details') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_status -> 'data_quality') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_status -> 'analysis_details' -> 'indicators') IS DISTINCT FROM 'object'
    OR NOT ((p_status -> 'analysis_details' -> 'indicators') ? 'percentageVariation')
    OR NOT ((p_status -> 'analysis_details' -> 'indicators') ? 'inflationDeviation')
    OR jsonb_typeof(p_status -> 'analysis_details' -> 'indicators' -> 'signals') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_status -> 'analysis_details' -> 'references' -> 'references') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_status -> 'analysis_details' -> 'priceHistory') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_status -> 'analysis_details' -> 'pricePeriods') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_status -> 'data_quality' -> 'historyPoints') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_status -> 'data_quality' -> 'supermarkets') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_status -> 'data_quality' -> 'comparables') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_status -> 'data_quality' -> 'quality') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_product_price_status_refresh_result';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RETURN 'product_missing';
  END IF;

  INSERT INTO public.product_price_status (
    product_id,
    classification,
    anomaly_score,
    offer_score,
    confidence,
    confidence_percentage,
    data_quality,
    rules_version,
    price_fingerprint,
    comparable_product_ids,
    analysis_details,
    analyzed_at,
    updated_at
  )
  VALUES (
    p_product_id::bigint,
    p_status ->> 'classification',
    COALESCE(NULLIF(p_status ->> 'anomaly_score', '')::numeric, 0),
    COALESCE(NULLIF(p_status ->> 'offer_score', '')::numeric, 0),
    COALESCE(NULLIF(p_status ->> 'confidence', ''), 'baja'),
    COALESCE(NULLIF(p_status ->> 'confidence_percentage', '')::numeric, 0),
    p_status -> 'data_quality',
    p_status ->> 'rules_version',
    p_status ->> 'price_fingerprint',
    ARRAY(
      SELECT value::bigint
      FROM jsonb_array_elements_text(p_status -> 'comparable_product_ids') AS item(value)
    ),
    p_status -> 'analysis_details',
    COALESCE(NULLIF(p_status ->> 'analyzed_at', '')::timestamptz, clock_timestamp()),
    COALESCE(NULLIF(p_status ->> 'updated_at', '')::timestamptz, clock_timestamp())
  )
  ON CONFLICT (product_id) DO UPDATE
  SET
    classification = EXCLUDED.classification,
    anomaly_score = EXCLUDED.anomaly_score,
    offer_score = EXCLUDED.offer_score,
    confidence = EXCLUDED.confidence,
    confidence_percentage = EXCLUDED.confidence_percentage,
    data_quality = EXCLUDED.data_quality,
    rules_version = EXCLUDED.rules_version,
    price_fingerprint = EXCLUDED.price_fingerprint,
    comparable_product_ids = EXCLUDED.comparable_product_ids,
    analysis_details = EXCLUDED.analysis_details,
    analyzed_at = EXCLUDED.analyzed_at,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM public.product_price_status_refresh_queue AS queue
  WHERE queue.product_id = p_product_id
    AND queue.generation = p_generation
    AND queue.status = 'processing'
    AND queue.lease_token = p_lease_token
    AND queue.lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'price_status_refresh_fence_changed_during_save';
  END IF;

  UPDATE public.product_price_status_refresh_metrics AS metrics
  SET
    total_completed = metrics.total_completed + 1,
    last_successful_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE metrics.singleton;

  RETURN 'completed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_product_price_status_refresh(
  p_product_id integer,
  p_generation bigint,
  p_lease_token uuid,
  p_error text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_status text;
BEGIN
  UPDATE public.product_price_status_refresh_queue AS queue
  SET
    status = CASE WHEN queue.attempts >= 8 THEN 'dead_letter' ELSE 'pending' END,
    available_at = CASE
      WHEN queue.attempts >= 8 THEN queue.available_at
      ELSE clock_timestamp() + make_interval(
        secs => LEAST(3600, (5 * power(2, LEAST(queue.attempts, 10)))::integer)
      )
    END,
    claimed_at = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    last_error = left(COALESCE(p_error, 'Unknown refresh error'), 2000),
    updated_at = clock_timestamp()
  WHERE queue.product_id = p_product_id
    AND queue.generation = p_generation
    AND queue.status = 'processing'
    AND queue.lease_token = p_lease_token
    AND queue.lease_expires_at > clock_timestamp()
  RETURNING queue.status INTO v_status;

  IF v_status IS NOT NULL THEN
    UPDATE public.product_price_status_refresh_metrics AS metrics
    SET
      total_failures = metrics.total_failures + 1,
      total_retries = metrics.total_retries + CASE WHEN v_status = 'pending' THEN 1 ELSE 0 END,
      updated_at = clock_timestamp()
    WHERE metrics.singleton;
  END IF;

  RETURN v_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.requeue_product_price_status_refresh_dead_letters(
  p_product_ids integer[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_requeued_count integer;
BEGIN
  UPDATE public.product_price_status_refresh_queue AS queue
  SET
    generation = queue.generation + 1,
    status = 'pending',
    attempts = 0,
    available_at = clock_timestamp(),
    claimed_at = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    last_error = NULL,
    updated_at = clock_timestamp()
  WHERE queue.status = 'dead_letter'
    AND (p_product_ids IS NULL OR queue.product_id = ANY(p_product_ids));

  GET DIAGNOSTICS v_requeued_count = ROW_COUNT;
  IF v_requeued_count > 0 THEN
    UPDATE public.product_price_status_refresh_metrics AS metrics
    SET
      total_retries = metrics.total_retries + v_requeued_count,
      updated_at = clock_timestamp()
    WHERE metrics.singleton;
  END IF;
  RETURN v_requeued_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.monitor_product_price_status_refresh_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_pending_count integer;
  v_processing_count integer;
  v_dead_letter_count integer;
  v_total_count integer;
  v_oldest_event_at timestamptz;
  v_oldest_age_seconds numeric;
  v_metrics public.product_price_status_refresh_metrics%ROWTYPE;
  v_elapsed_seconds numeric;
  v_enqueue_rate numeric;
  v_processing_rate numeric;
  v_sample_due boolean := false;
  v_alert record;
  v_existing_alert public.product_price_status_refresh_alerts%ROWTYPE;
  v_alert_exists boolean;
  v_notification_due boolean;
  v_notifications jsonb := '[]'::jsonb;
  v_active_alerts jsonb;
BEGIN
  SELECT
    count(*) FILTER (WHERE queue.status = 'pending')::integer,
    count(*) FILTER (WHERE queue.status = 'processing')::integer,
    count(*) FILTER (WHERE queue.status = 'dead_letter')::integer,
    count(*)::integer,
    min(queue.first_enqueued_at)
  INTO
    v_pending_count,
    v_processing_count,
    v_dead_letter_count,
    v_total_count,
    v_oldest_event_at
  FROM public.product_price_status_refresh_queue AS queue;

  IF v_oldest_event_at IS NOT NULL THEN
    v_oldest_age_seconds := greatest(
      0,
      extract(epoch FROM (v_now - v_oldest_event_at))
    );
  END IF;

  SELECT metrics.*
  INTO v_metrics
  FROM public.product_price_status_refresh_metrics AS metrics
  WHERE metrics.singleton
  FOR UPDATE;

  IF v_metrics.sample_at IS NULL THEN
    v_sample_due := true;
  ELSE
    v_elapsed_seconds := extract(epoch FROM (v_now - v_metrics.sample_at));
    v_sample_due := v_elapsed_seconds >= 50;
  END IF;

  v_enqueue_rate := v_metrics.enqueue_rate_per_minute;
  v_processing_rate := v_metrics.processing_rate_per_minute;
  IF v_sample_due THEN
    IF v_metrics.sample_at IS NOT NULL AND v_elapsed_seconds > 0 THEN
      v_enqueue_rate := greatest(
        0,
        v_metrics.total_enqueued - v_metrics.sampled_enqueued_total
      )::numeric * 60 / v_elapsed_seconds;
      v_processing_rate := greatest(
        0,
        v_metrics.total_completed - v_metrics.sampled_completed_total
      )::numeric * 60 / v_elapsed_seconds;
    END IF;

    UPDATE public.product_price_status_refresh_metrics AS metrics
    SET
      sample_at = v_now,
      sampled_enqueued_total = metrics.total_enqueued,
      sampled_completed_total = metrics.total_completed,
      enqueue_rate_per_minute = v_enqueue_rate,
      processing_rate_per_minute = v_processing_rate,
      pending_count = v_pending_count,
      processing_count = v_processing_count,
      dead_letter_count = v_dead_letter_count,
      total_count = v_total_count,
      oldest_event_at = v_oldest_event_at,
      updated_at = v_now
    WHERE metrics.singleton;
  ELSE
    UPDATE public.product_price_status_refresh_metrics AS metrics
    SET
      pending_count = v_pending_count,
      processing_count = v_processing_count,
      dead_letter_count = v_dead_letter_count,
      total_count = v_total_count,
      oldest_event_at = v_oldest_event_at,
      updated_at = v_now
    WHERE metrics.singleton;
  END IF;

  FOR v_alert IN
    SELECT *
    FROM (VALUES
      (
        'queue_rows_warning_15000',
        'La cola de actualización de precios superó 15.000 filas.',
        'warning',
        15000::numeric,
        300,
        v_total_count >= 15000,
        v_total_count::numeric
      ),
      (
        'queue_rows_critical_20000',
        'La cola de actualización de precios superó 20.000 filas.',
        'critical',
        20000::numeric,
        60,
        v_total_count >= 20000,
        v_total_count::numeric
      ),
      (
        'queue_rows_hard_cap_25000',
        'La cola alcanzó su límite duro de 25.000 filas.',
        'incident',
        25000::numeric,
        60,
        v_total_count >= 25000,
        v_total_count::numeric
      ),
      (
        'queue_age_warning_12h',
        'El evento sin resolver más antiguo tiene al menos 12 horas.',
        'warning',
        43200::numeric,
        900,
        COALESCE(v_oldest_age_seconds >= 43200, false),
        COALESCE(v_oldest_age_seconds, 0)
      ),
      (
        'queue_age_critical_18h',
        'El evento sin resolver más antiguo tiene al menos 18 horas.',
        'critical',
        64800::numeric,
        300,
        COALESCE(v_oldest_age_seconds >= 64800, false),
        COALESCE(v_oldest_age_seconds, 0)
      ),
      (
        'queue_age_incident_24h',
        'El evento sin resolver más antiguo tiene al menos 24 horas.',
        'incident',
        86400::numeric,
        60,
        COALESCE(v_oldest_age_seconds >= 86400, false),
        COALESCE(v_oldest_age_seconds, 0)
      )
    ) AS configured_alerts(
      alert_key,
      description,
      severity,
      threshold,
      notification_interval_seconds,
      triggered,
      observed_value
    )
  LOOP
    SELECT alert.*
    INTO v_existing_alert
    FROM public.product_price_status_refresh_alerts AS alert
    WHERE alert.alert_key = v_alert.alert_key
    FOR UPDATE;
    v_alert_exists := FOUND;

    IF v_alert.triggered THEN
      v_notification_due := NOT v_alert_exists
        OR NOT v_existing_alert.active
        OR v_existing_alert.last_notified_at IS NULL
        OR v_existing_alert.last_notified_at
          <= v_now - make_interval(secs => v_alert.notification_interval_seconds);

      INSERT INTO public.product_price_status_refresh_alerts (
        alert_key,
        description,
        severity,
        threshold,
        notification_interval_seconds,
        active,
        first_triggered_at,
        last_triggered_at,
        last_notified_at,
        resolved_at,
        observed_value,
        updated_at
      )
      VALUES (
        v_alert.alert_key,
        v_alert.description,
        v_alert.severity,
        v_alert.threshold,
        v_alert.notification_interval_seconds,
        true,
        v_now,
        v_now,
        CASE WHEN v_notification_due THEN v_now ELSE NULL END,
        NULL,
        v_alert.observed_value,
        v_now
      )
      ON CONFLICT (alert_key) DO UPDATE
      SET
        description = EXCLUDED.description,
        severity = EXCLUDED.severity,
        threshold = EXCLUDED.threshold,
        notification_interval_seconds = EXCLUDED.notification_interval_seconds,
        active = true,
        first_triggered_at = CASE
          WHEN NOT public.product_price_status_refresh_alerts.active THEN v_now
          ELSE public.product_price_status_refresh_alerts.first_triggered_at
        END,
        last_triggered_at = v_now,
        last_notified_at = CASE
          WHEN v_notification_due THEN v_now
          ELSE public.product_price_status_refresh_alerts.last_notified_at
        END,
        resolved_at = NULL,
        observed_value = EXCLUDED.observed_value,
        updated_at = v_now;

      IF v_notification_due THEN
        v_notifications := v_notifications || jsonb_build_array(jsonb_build_object(
          'key', v_alert.alert_key,
          'severity', v_alert.severity,
          'description', v_alert.description,
          'threshold', v_alert.threshold,
          'observed_value', v_alert.observed_value,
          'resolved', false
        ));
      END IF;
    ELSIF v_alert_exists AND v_existing_alert.active THEN
      UPDATE public.product_price_status_refresh_alerts AS alert
      SET
        active = false,
        resolved_at = v_now,
        observed_value = v_alert.observed_value,
        updated_at = v_now
      WHERE alert.alert_key = v_alert.alert_key;

      v_notifications := v_notifications || jsonb_build_array(jsonb_build_object(
        'key', v_alert.alert_key,
        'severity', v_alert.severity,
        'description', v_alert.description,
        'threshold', v_alert.threshold,
        'observed_value', v_alert.observed_value,
        'resolved', true
      ));
    END IF;
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'key', alert.alert_key,
      'severity', alert.severity,
      'description', alert.description,
      'threshold', alert.threshold,
      'observed_value', alert.observed_value,
      'first_triggered_at', alert.first_triggered_at,
      'last_notified_at', alert.last_notified_at
    ) ORDER BY alert.severity, alert.alert_key),
    '[]'::jsonb
  )
  INTO v_active_alerts
  FROM public.product_price_status_refresh_alerts AS alert
  WHERE alert.active;

  SELECT metrics.*
  INTO v_metrics
  FROM public.product_price_status_refresh_metrics AS metrics
  WHERE metrics.singleton;

  RETURN jsonb_build_object(
    'sampled_at', v_now,
    'queue', jsonb_build_object(
      'pending', v_pending_count,
      'processing', v_processing_count,
      'dead_letter', v_dead_letter_count,
      'total', v_total_count,
      'capacity', 25000,
      'oldest_event_at', v_oldest_event_at,
      'oldest_age_seconds', v_oldest_age_seconds
    ),
    'metrics', jsonb_build_object(
      'enqueue_rate_per_minute', v_metrics.enqueue_rate_per_minute,
      'processing_rate_per_minute', v_metrics.processing_rate_per_minute,
      'total_enqueued', v_metrics.total_enqueued,
      'total_completed', v_metrics.total_completed,
      'total_failures', v_metrics.total_failures,
      'total_retries', v_metrics.total_retries,
      'total_expired_leases', v_metrics.total_expired_leases,
      'last_successful_at', v_metrics.last_successful_at
    ),
    'notifications', v_notifications,
    'active_alerts', v_active_alerts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_catalog_product(p_product_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM 1
  FROM public.products AS product
  WHERE product.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- The product DELETE trigger queues affected peers; its offer rows need no separate event.
  PERFORM pg_catalog.set_config(
    'kordian.deleting_catalog_product_id',
    p_product_id::text,
    true
  );
  DELETE FROM public.offers AS offer
  WHERE offer.product_id = p_product_id;
  PERFORM pg_catalog.set_config('kordian.deleting_catalog_product_id', '', true);

  DELETE FROM public.products AS product
  WHERE product.id = p_product_id;

  RETURN jsonb_build_object('status', 'deleted');
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_product_price_status_refresh_from_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_product_ids integer[];
  v_subcategory_ids uuid[];
  v_relevant_changed boolean;
  v_scope_changed boolean;
BEGIN
  v_new := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    v_product_ids := ARRAY[(v_new ->> 'id')::integer];
    v_subcategory_ids := ARRAY[NULLIF(v_new ->> 'subcategory_id', '')::uuid];
  ELSE
    v_old := to_jsonb(OLD);
    SELECT EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'name', 'brand_id', 'category_id', 'subcategory_id', 'source',
        'brand', 'category', 'subcategory', 'description', 'variant',
        'presentation', 'unit'
      ]) AS field(name)
      WHERE (v_old -> field.name) IS DISTINCT FROM (v_new -> field.name)
    ) INTO v_relevant_changed;
    IF NOT v_relevant_changed THEN
      RETURN NULL;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'name', 'brand_id', 'category_id', 'subcategory_id', 'brand',
        'category', 'subcategory', 'description', 'variant', 'presentation',
        'unit'
      ]) AS field(name)
      WHERE (v_old -> field.name) IS DISTINCT FROM (v_new -> field.name)
    ) INTO v_scope_changed;
    v_product_ids := ARRAY[
      (v_old ->> 'id')::integer,
      (v_new ->> 'id')::integer
    ];
    v_subcategory_ids := CASE WHEN v_scope_changed THEN ARRAY[
      NULLIF(v_old ->> 'subcategory_id', '')::uuid,
      NULLIF(v_new ->> 'subcategory_id', '')::uuid
    ] ELSE ARRAY[]::uuid[] END;
  END IF;

  v_product_ids := public.refresh_product_price_status_comparable_group_memberships(
    v_product_ids
  );
  PERFORM public.enqueue_product_price_status_refresh_related(
    v_product_ids,
    v_subcategory_ids
  );
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_product_price_status_refresh_before_product_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_old jsonb := to_jsonb(OLD);
BEGIN
  PERFORM public.enqueue_product_price_status_refresh_related(
    ARRAY[(v_old ->> 'id')::integer],
    ARRAY[NULLIF(v_old ->> 'subcategory_id', '')::uuid],
    ARRAY[(v_old ->> 'id')::integer]
  );
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_product_price_status_refresh_from_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_product_ids integer[];
  v_scope_changed boolean;
  v_relevant_changed boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'offers' THEN
      SELECT EXISTS (
        SELECT 1
        FROM unnest(ARRAY['product_id', 'cash_price', 'supermarket', 'previous_price']) AS field(name)
        WHERE (v_old -> field.name) IS DISTINCT FROM (v_new -> field.name)
      ) INTO v_relevant_changed;
      IF NOT v_relevant_changed THEN RETURN NULL; END IF;
      SELECT EXISTS (
        SELECT 1
        FROM unnest(ARRAY['product_id', 'cash_price']) AS field(name)
        WHERE (v_old -> field.name) IS DISTINCT FROM (v_new -> field.name)
      ) INTO v_scope_changed;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM unnest(ARRAY['product_id', 'offer_id', 'observed_at', 'cash_price', 'source']) AS field(name)
        WHERE v_old -> field.name IS DISTINCT FROM v_new -> field.name
      ) INTO v_relevant_changed;
      IF NOT v_relevant_changed THEN RETURN NULL; END IF;
      v_scope_changed := false;
    END IF;
    v_product_ids := ARRAY[
      NULLIF(v_old ->> 'product_id', '')::integer,
      NULLIF(v_new ->> 'product_id', '')::integer
    ];
  ELSIF TG_OP = 'INSERT' THEN
    v_product_ids := ARRAY[NULLIF(v_new ->> 'product_id', '')::integer];
    v_scope_changed := TG_TABLE_NAME = 'offers';
  ELSE
    v_product_ids := ARRAY[NULLIF(v_old ->> 'product_id', '')::integer];
    v_scope_changed := TG_TABLE_NAME = 'offers';
  END IF;

  IF TG_TABLE_NAME = 'offers'
    AND TG_OP = 'DELETE'
    AND current_setting('kordian.deleting_catalog_product_id', true)
      = (v_old ->> 'product_id') THEN
    RETURN NULL;
  END IF;

  IF v_scope_changed THEN
    PERFORM public.enqueue_product_price_status_refresh_related(v_product_ids, NULL);
  ELSE
    PERFORM public.enqueue_product_price_status_refresh(v_product_ids);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_product_price_status_refresh_from_price_update_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_changes jsonb := '[]'::jsonb;
  v_product_ids integer[];
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE'
    AND v_old -> 'changes' IS NOT DISTINCT FROM v_new -> 'changes'
    AND v_old -> 'updated_at' IS NOT DISTINCT FROM v_new -> 'updated_at' THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' AND jsonb_typeof(v_old -> 'changes') = 'array' THEN
    v_changes := v_changes || (v_old -> 'changes');
  END IF;
  IF TG_OP <> 'DELETE' AND jsonb_typeof(v_new -> 'changes') = 'array' THEN
    v_changes := v_changes || (v_new -> 'changes');
  END IF;

  SELECT array_agg(DISTINCT candidate.product_id)
  INTO v_product_ids
  FROM (
    SELECT CASE
      WHEN change.entry ->> 'productId' ~ '^[1-9][0-9]*$' THEN
        CASE
          WHEN (change.entry ->> 'productId')::numeric <= 2147483647
            THEN (change.entry ->> 'productId')::integer
          ELSE NULL
        END
      ELSE NULL
    END AS product_id
    FROM jsonb_array_elements(v_changes) AS change(entry)
  ) AS candidate
  WHERE candidate.product_id IS NOT NULL;

  PERFORM public.enqueue_product_price_status_refresh_related(
    v_product_ids,
    NULL
  );
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_product_price_status_refresh_from_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_category_id uuid;
  v_product_ids integer[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_category_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_category_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;
  SELECT array_agg(product.id)
  INTO v_product_ids
  FROM public.products AS product
  WHERE product.category_id = v_category_id;
  v_product_ids := public.refresh_product_price_status_comparable_group_memberships(
    v_product_ids
  );
  PERFORM public.enqueue_product_price_status_refresh_related(v_product_ids, NULL);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_product_price_status_refresh_from_subcategory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_subcategory_id uuid;
  v_product_ids integer[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_subcategory_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_subcategory_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;
  SELECT array_agg(product.id)
  INTO v_product_ids
  FROM public.products AS product
  WHERE product.subcategory_id = v_subcategory_id;
  v_product_ids := public.refresh_product_price_status_comparable_group_memberships(
    v_product_ids
  );
  PERFORM public.enqueue_product_price_status_refresh_related(
    v_product_ids,
    ARRAY[v_subcategory_id]
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_product_price_status_refresh_from_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_brand_id uuid;
  v_product_ids integer[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_brand_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_brand_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;
  SELECT array_agg(product.id)
  INTO v_product_ids
  FROM public.products AS product
  WHERE product.brand_id = v_brand_id;
  v_product_ids := public.refresh_product_price_status_comparable_group_memberships(
    v_product_ids
  );
  PERFORM public.enqueue_product_price_status_refresh_related(v_product_ids, NULL);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER product_price_status_refresh_queue_products
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_product();

CREATE TRIGGER product_price_status_refresh_queue_product_delete
  BEFORE DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_before_product_delete();

CREATE TRIGGER product_price_status_refresh_queue_offers
  AFTER INSERT OR UPDATE OR DELETE ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_child();

CREATE TRIGGER product_price_status_refresh_queue_price_history
  AFTER INSERT OR UPDATE OR DELETE ON public.price_history
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_child();

CREATE TRIGGER product_price_status_refresh_queue_price_update_log
  AFTER INSERT OR UPDATE OR DELETE ON public.price_update_log
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_price_update_log();

CREATE TRIGGER product_price_status_refresh_queue_categories
  AFTER INSERT OR UPDATE OF name ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_category();

CREATE TRIGGER product_price_status_refresh_queue_category_delete
  BEFORE DELETE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_category();

CREATE TRIGGER product_price_status_refresh_queue_subcategories
  AFTER INSERT OR UPDATE OF name, category_id ON public.subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_subcategory();

CREATE TRIGGER product_price_status_refresh_queue_subcategory_delete
  BEFORE DELETE ON public.subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_subcategory();

CREATE TRIGGER product_price_status_refresh_queue_brands
  AFTER INSERT OR UPDATE OF name ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_brand();

CREATE TRIGGER product_price_status_refresh_queue_brand_delete
  BEFORE DELETE ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_product_price_status_refresh_from_brand();

REVOKE ALL ON FUNCTION public.enqueue_product_price_status_refresh(integer[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_product_price_status_refresh_related(integer[], uuid[], integer[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_product_price_status_refresh_queue()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_catalog_product(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_price_status_comparable_text(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_price_status_comparable_group_key(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_product_price_status_comparable_group_memberships(integer[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_product_price_status_refresh_history(integer[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_price_status_refresh(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_and_complete_product_price_status_refresh(integer, bigint, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_price_status_refresh(integer, bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_product_price_status_refresh_dead_letters(integer[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_product_price_status_refresh_from_product()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_product_price_status_refresh_before_product_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_product_price_status_refresh_from_child()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_product_price_status_refresh_from_price_update_log()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_product_price_status_refresh_from_category()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_product_price_status_refresh_from_subcategory()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_product_price_status_refresh_from_brand()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_product_price_status_refresh(integer[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_product_price_status_refresh_related(integer[], uuid[], integer[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.monitor_product_price_status_refresh_queue()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_catalog_product(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_price_status_comparable_text(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.product_price_status_comparable_group_key(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_product_price_status_comparable_group_memberships(integer[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_product_price_status_refresh_history(integer[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_price_status_refresh(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_and_complete_product_price_status_refresh(integer, bigint, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_price_status_refresh(integer, bigint, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_product_price_status_refresh_dead_letters(integer[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_product_price_status_refresh_from_product()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_product_price_status_refresh_before_product_delete()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_product_price_status_refresh_from_child()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_product_price_status_refresh_from_price_update_log()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_product_price_status_refresh_from_category()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_product_price_status_refresh_from_subcategory()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_product_price_status_refresh_from_brand()
  TO service_role;

COMMIT;
