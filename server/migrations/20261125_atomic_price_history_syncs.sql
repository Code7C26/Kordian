BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.offers') IS NULL
    OR to_regclass('public.products') IS NULL
    OR to_regclass('public.price_history') IS NULL
    OR to_regclass('public.price_update_log') IS NULL
    OR to_regclass('public.carrefour_sync_state') IS NULL
    OR to_regprocedure('public.assert_catalog_write_allowed(text)') IS NULL
  THEN
    RAISE EXCEPTION 'Atomic price sync dependencies are missing; no changes applied';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.apply_catalog_disco_public_search_sync(
  p_updates jsonb,
  p_new_offers jsonb,
  p_log jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item jsonb;
  v_offer public.offers%ROWTYPE;
  v_offer_id bigint;
  v_product_id bigint;
  v_product_source text;
  v_product_source_product_id text;
  v_previous_cash_price numeric;
  v_updated_cash_price numeric;
  v_previous_list_price numeric;
  v_updated_list_price numeric;
  v_seen_offer_ids bigint[] := '{}'::bigint[];
  v_seen_product_ids bigint[] := '{}'::bigint[];
  v_update_count integer := 0;
  v_insert_count integer := 0;
  v_history_count integer := 0;
BEGIN
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_new_offers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_price_changes';
  END IF;

  IF jsonb_typeof(p_log) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_log -> 'filters') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_log -> 'changes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_price_log';
  END IF;
  IF jsonb_typeof(p_log -> 'admin_username') IS DISTINCT FROM 'string'
    OR btrim(p_log ->> 'admin_username') = ''
    OR (p_log -> 'filters' ->> 'source') IS DISTINCT FROM 'disco_public_search'
    OR jsonb_typeof(p_log -> 'filters' -> 'operationId') IS DISTINCT FROM 'string'
    OR (p_log -> 'filters' ->> 'operationId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_log -> 'percentage') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_log -> 'products_updated') IS DISTINCT FROM 'number'
    OR (p_log ->> 'products_updated') !~ '^(0|[1-9][0-9]*)$'
    OR (p_log ->> 'products_updated')::numeric
      <> jsonb_array_length(p_updates) + jsonb_array_length(p_new_offers) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_price_log';
  END IF;

  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  PERFORM public.assert_catalog_write_allowed('Disco');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item -> 'offerId') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item -> 'productId') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item -> 'sourceProductId') IS DISTINCT FROM 'string'
      OR btrim(v_item ->> 'sourceProductId') = ''
      OR NOT (v_item ? 'productSource')
      OR jsonb_typeof(v_item -> 'productSource') NOT IN ('string', 'null')
      OR NOT (v_item ? 'productSourceProductId')
      OR jsonb_typeof(v_item -> 'productSourceProductId') NOT IN ('string', 'null')
      OR NOT (v_item ? 'previousCashPrice')
      OR jsonb_typeof(v_item -> 'previousCashPrice') NOT IN ('number', 'null')
      OR jsonb_typeof(v_item -> 'updatedCashPrice') IS DISTINCT FROM 'number'
      OR NOT (v_item ? 'previousListPrice')
      OR jsonb_typeof(v_item -> 'previousListPrice') NOT IN ('number', 'null')
      OR NOT (v_item ? 'updatedListPrice')
      OR jsonb_typeof(v_item -> 'updatedListPrice') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_price_update';
    END IF;
    IF (v_item ->> 'offerId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'productId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'offerId')::numeric > 9007199254740991
      OR (v_item ->> 'productId')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_price_update';
    END IF;
    v_previous_cash_price := NULLIF(v_item ->> 'previousCashPrice', '')::numeric;
    v_updated_cash_price := (v_item ->> 'updatedCashPrice')::numeric;
    v_updated_list_price := NULLIF(v_item ->> 'updatedListPrice', '')::numeric;
    IF v_updated_cash_price <= 0
      OR (v_previous_cash_price IS NOT NULL AND v_previous_cash_price <= 0)
      OR (v_updated_list_price IS NOT NULL AND v_updated_list_price <= v_updated_cash_price) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_price_update';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_new_offers)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item -> 'productId') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item -> 'sourceProductId') IS DISTINCT FROM 'string'
      OR btrim(v_item ->> 'sourceProductId') = ''
      OR NOT (v_item ? 'productSource')
      OR jsonb_typeof(v_item -> 'productSource') NOT IN ('string', 'null')
      OR NOT (v_item ? 'productSourceProductId')
      OR jsonb_typeof(v_item -> 'productSourceProductId') NOT IN ('string', 'null')
      OR jsonb_typeof(v_item -> 'cashPrice') IS DISTINCT FROM 'number'
      OR NOT (v_item ? 'listPrice')
      OR jsonb_typeof(v_item -> 'listPrice') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_new_offer';
    END IF;
    IF (v_item ->> 'productId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'productId')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_new_offer';
    END IF;
    v_updated_cash_price := (v_item ->> 'cashPrice')::numeric;
    v_updated_list_price := NULLIF(v_item ->> 'listPrice', '')::numeric;
    IF v_updated_cash_price <= 0
      OR (v_updated_list_price IS NOT NULL AND v_updated_list_price <= v_updated_cash_price) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_disco_search_new_offer';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    v_offer_id := (v_item ->> 'offerId')::bigint;
    v_product_id := (v_item ->> 'productId')::bigint;
    IF v_offer_id = ANY(v_seen_offer_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate_disco_search_offer';
    END IF;
    v_seen_offer_ids := array_append(v_seen_offer_ids, v_offer_id);

    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = v_offer_id
    FOR UPDATE;
    IF NOT FOUND
      OR v_offer.product_id <> v_product_id
      OR v_offer.supermarket <> 'Disco'
      OR v_offer.cash_price IS DISTINCT FROM NULLIF(v_item ->> 'previousCashPrice', '')::numeric
      OR v_offer.list_price IS DISTINCT FROM NULLIF(v_item ->> 'previousListPrice', '')::numeric THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'disco_search_offer_changed';
    END IF;

    SELECT source, source_product_id
    INTO v_product_source, v_product_source_product_id
    FROM public.products
    WHERE id = v_product_id
    FOR SHARE;
    IF NOT FOUND
      OR v_product_source IS DISTINCT FROM v_item ->> 'productSource'
      OR v_product_source_product_id IS DISTINCT FROM v_item ->> 'productSourceProductId'
      OR (v_product_source = 'disco'
        AND v_product_source_product_id IS DISTINCT FROM v_item ->> 'sourceProductId') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'disco_search_product_changed';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_new_offers)
    ORDER BY (value ->> 'productId')::bigint
  LOOP
    v_product_id := (v_item ->> 'productId')::bigint;
    IF v_product_id = ANY(v_seen_product_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate_disco_search_product';
    END IF;
    v_seen_product_ids := array_append(v_seen_product_ids, v_product_id);

    SELECT source, source_product_id
    INTO v_product_source, v_product_source_product_id
    FROM public.products
    WHERE id = v_product_id
    FOR SHARE;
    IF NOT FOUND
      OR v_product_source IS DISTINCT FROM v_item ->> 'productSource'
      OR v_product_source_product_id IS DISTINCT FROM v_item ->> 'productSourceProductId'
      OR (v_product_source = 'disco'
        AND v_product_source_product_id IS DISTINCT FROM v_item ->> 'sourceProductId') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'disco_search_product_changed';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.offers
      WHERE product_id = v_product_id AND supermarket = 'Disco'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'disco_search_offer_already_exists';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    v_offer_id := (v_item ->> 'offerId')::bigint;
    v_product_id := (v_item ->> 'productId')::bigint;
    v_previous_cash_price := NULLIF(v_item ->> 'previousCashPrice', '')::numeric;
    v_updated_cash_price := (v_item ->> 'updatedCashPrice')::numeric;
    v_updated_list_price := NULLIF(v_item ->> 'updatedListPrice', '')::numeric;
    UPDATE public.offers
    SET cash_price = v_updated_cash_price,
        list_price = v_updated_list_price
    WHERE id = v_offer_id
      AND product_id = v_product_id
      AND supermarket = 'Disco';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'disco_search_offer_changed';
    END IF;
    IF v_previous_cash_price IS DISTINCT FROM v_updated_cash_price THEN
      INSERT INTO public.price_history (product_id, offer_id, cash_price, source)
      VALUES (v_product_id, v_offer_id, v_updated_cash_price, 'disco_public_search');
      v_history_count := v_history_count + 1;
    END IF;
    v_update_count := v_update_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_new_offers)
    ORDER BY (value ->> 'productId')::bigint
  LOOP
    v_product_id := (v_item ->> 'productId')::bigint;
    v_updated_cash_price := (v_item ->> 'cashPrice')::numeric;
    v_updated_list_price := NULLIF(v_item ->> 'listPrice', '')::numeric;
    INSERT INTO public.offers (product_id, supermarket, cash_price, list_price)
    VALUES (v_product_id, 'Disco', v_updated_cash_price, v_updated_list_price)
    RETURNING id INTO v_offer_id;
    INSERT INTO public.price_history (product_id, offer_id, cash_price, source)
    VALUES (v_product_id, v_offer_id, v_updated_cash_price, 'disco_public_search');
    v_insert_count := v_insert_count + 1;
    v_history_count := v_history_count + 1;
  END LOOP;

  INSERT INTO public.price_update_log (
    admin_username, filters, percentage, products_updated, changes
  ) VALUES (
    p_log ->> 'admin_username',
    p_log -> 'filters',
    (p_log ->> 'percentage')::numeric,
    (p_log ->> 'products_updated')::integer,
    p_log -> 'changes'
  );

  RETURN jsonb_build_object(
    'updated', v_update_count,
    'inserted', v_insert_count,
    'history_inserted', v_history_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_catalog_disco_public_search_sync(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_catalog_disco_public_search_sync(jsonb, jsonb, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_catalog_carrefour_price_sync(
  p_updates jsonb,
  p_next_offer_id integer,
  p_log jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item jsonb;
  v_offer public.offers%ROWTYPE;
  v_offer_id bigint;
  v_product_id bigint;
  v_product_source text;
  v_product_source_product_id text;
  v_product_ean text;
  v_previous_cash_price numeric;
  v_updated_cash_price numeric;
  v_updated_list_price numeric;
  v_seen_offer_ids bigint[] := '{}'::bigint[];
  v_price_change_count integer := 0;
  v_history_count integer := 0;
BEGIN
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array'
    OR (p_next_offer_id IS NOT NULL AND p_next_offer_id <= 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_carrefour_sync_changes';
  END IF;
  IF jsonb_typeof(p_log) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_log -> 'filters') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_log -> 'changes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_carrefour_sync_log';
  END IF;
  IF jsonb_typeof(p_log -> 'admin_username') IS DISTINCT FROM 'string'
    OR btrim(p_log ->> 'admin_username') = ''
    OR (p_log -> 'filters' ->> 'source') IS DISTINCT FROM 'carrefour_sync'
    OR jsonb_typeof(p_log -> 'filters' -> 'operationId') IS DISTINCT FROM 'string'
    OR (p_log -> 'filters' ->> 'operationId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_log -> 'percentage') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_log -> 'products_updated') IS DISTINCT FROM 'number'
    OR (p_log ->> 'products_updated') !~ '^(0|[1-9][0-9]*)$'
    OR jsonb_array_length(p_log -> 'changes') <> jsonb_array_length(p_updates) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_carrefour_sync_log';
  END IF;

  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  PERFORM public.assert_catalog_write_allowed('Carrefour');

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
    ORDER BY CASE
      WHEN (value ->> 'offerId') ~ '^[1-9][0-9]*$'
      THEN (value ->> 'offerId')::numeric
      ELSE 0
    END
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item -> 'offerId') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item -> 'productId') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item -> 'sourceProductId') IS DISTINCT FROM 'string'
      OR btrim(v_item ->> 'sourceProductId') = ''
      OR NOT (v_item ? 'productSource')
      OR jsonb_typeof(v_item -> 'productSource') NOT IN ('string', 'null')
      OR NOT (v_item ? 'productSourceProductId')
      OR jsonb_typeof(v_item -> 'productSourceProductId') NOT IN ('string', 'null')
      OR NOT (v_item ? 'productEan')
      OR jsonb_typeof(v_item -> 'productEan') NOT IN ('string', 'null')
      OR NOT (v_item ? 'previousCashPrice')
      OR jsonb_typeof(v_item -> 'previousCashPrice') NOT IN ('number', 'null')
      OR jsonb_typeof(v_item -> 'updatedCashPrice') IS DISTINCT FROM 'number'
      OR NOT (v_item ? 'previousListPrice')
      OR jsonb_typeof(v_item -> 'previousListPrice') NOT IN ('number', 'null')
      OR NOT (v_item ? 'updatedListPrice')
      OR jsonb_typeof(v_item -> 'updatedListPrice') NOT IN ('number', 'null')
      OR NOT (v_item ? 'previousSourceProductId')
      OR jsonb_typeof(v_item -> 'previousSourceProductId') NOT IN ('string', 'null')
      OR NOT (v_item ? 'previousSourceSku')
      OR jsonb_typeof(v_item -> 'previousSourceSku') NOT IN ('string', 'null')
      OR NOT (v_item ? 'previousSourceUrl')
      OR jsonb_typeof(v_item -> 'previousSourceUrl') NOT IN ('string', 'null')
      OR jsonb_typeof(v_item -> 'sourceSku') IS DISTINCT FROM 'string'
      OR btrim(v_item ->> 'sourceSku') = ''
      OR NOT (v_item ? 'sourceUrl')
      OR jsonb_typeof(v_item -> 'sourceUrl') NOT IN ('string', 'null')
      OR jsonb_typeof(v_item -> 'priceChanged') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_carrefour_sync_update';
    END IF;
    IF (v_item ->> 'offerId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'productId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'offerId')::numeric > 9007199254740991
      OR (v_item ->> 'productId')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_carrefour_sync_update';
    END IF;

    v_previous_cash_price := NULLIF(v_item ->> 'previousCashPrice', '')::numeric;
    v_updated_cash_price := (v_item ->> 'updatedCashPrice')::numeric;
    v_updated_list_price := NULLIF(v_item ->> 'updatedListPrice', '')::numeric;
    IF v_updated_cash_price <= 0
      OR (v_previous_cash_price IS NOT NULL AND v_previous_cash_price <= 0)
      OR (v_updated_list_price IS NOT NULL AND v_updated_list_price <= v_updated_cash_price) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_carrefour_sync_price';
    END IF;
    IF (v_item ->> 'priceChanged')::boolean THEN
      v_price_change_count := v_price_change_count + 1;
    END IF;

    v_offer_id := (v_item ->> 'offerId')::bigint;
    v_product_id := (v_item ->> 'productId')::bigint;
    IF v_offer_id = ANY(v_seen_offer_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate_carrefour_sync_offer';
    END IF;
    v_seen_offer_ids := array_append(v_seen_offer_ids, v_offer_id);

    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = v_offer_id
    FOR UPDATE;
    IF NOT FOUND
      OR v_offer.product_id <> v_product_id
      OR v_offer.supermarket <> 'Carrefour'
      OR v_offer.cash_price IS DISTINCT FROM v_previous_cash_price
      OR v_offer.list_price IS DISTINCT FROM NULLIF(v_item ->> 'previousListPrice', '')::numeric
      OR v_offer.source_product_id IS DISTINCT FROM v_item ->> 'previousSourceProductId'
      OR v_offer.source_sku IS DISTINCT FROM v_item ->> 'previousSourceSku'
      OR v_offer.source_url IS DISTINCT FROM v_item ->> 'previousSourceUrl' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'carrefour_sync_offer_changed';
    END IF;

    SELECT source, source_product_id, ean
    INTO v_product_source, v_product_source_product_id, v_product_ean
    FROM public.products
    WHERE id = v_product_id
    FOR SHARE;
    IF NOT FOUND
      OR v_product_source IS DISTINCT FROM v_item ->> 'productSource'
      OR v_product_source_product_id IS DISTINCT FROM v_item ->> 'productSourceProductId'
      OR v_product_ean IS DISTINCT FROM v_item ->> 'productEan' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'carrefour_sync_product_changed';
    END IF;
    IF NULLIF(btrim(v_offer.source_product_id), '') IS NOT NULL THEN
      IF v_offer.source_product_id IS DISTINCT FROM v_item ->> 'sourceProductId' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'carrefour_sync_identity_changed';
      END IF;
    ELSIF v_product_source IS DISTINCT FROM 'carrefour'
      OR v_product_source_product_id IS DISTINCT FROM v_item ->> 'sourceProductId' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'carrefour_sync_identity_changed';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_log -> 'changes') logged(value)
      WHERE logged.value -> 'offerId' = v_item -> 'offerId'
        AND logged.value -> 'productId' = v_item -> 'productId'
        AND logged.value -> 'sourceProductId' = v_item -> 'sourceProductId'
        AND logged.value -> 'priceChanged' = v_item -> 'priceChanged'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'carrefour_sync_log_mismatch';
    END IF;
  END LOOP;

  IF (p_log ->> 'products_updated')::numeric <> v_price_change_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'carrefour_sync_log_mismatch';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    v_offer_id := (v_item ->> 'offerId')::bigint;
    v_product_id := (v_item ->> 'productId')::bigint;
    v_updated_cash_price := (v_item ->> 'updatedCashPrice')::numeric;
    v_updated_list_price := NULLIF(v_item ->> 'updatedListPrice', '')::numeric;
    UPDATE public.offers
    SET cash_price = v_updated_cash_price,
        list_price = v_updated_list_price,
        source_product_id = (v_item ->> 'sourceProductId'),
        source_sku = (v_item ->> 'sourceSku'),
        source_url = v_item ->> 'sourceUrl'
    WHERE id = v_offer_id
      AND product_id = v_product_id
      AND supermarket = 'Carrefour';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'carrefour_sync_offer_changed';
    END IF;

    IF (v_item ->> 'priceChanged')::boolean THEN
      INSERT INTO public.price_history (product_id, offer_id, cash_price, source)
      VALUES (v_product_id, v_offer_id, v_updated_cash_price, 'carrefour_sync');
      v_history_count := v_history_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.carrefour_sync_state (sync_key, last_offer_id, updated_at)
  VALUES ('daily', p_next_offer_id, now())
  ON CONFLICT (sync_key) DO UPDATE
  SET last_offer_id = EXCLUDED.last_offer_id,
      updated_at = EXCLUDED.updated_at;

  INSERT INTO public.price_update_log (
    admin_username, filters, percentage, products_updated, changes
  ) VALUES (
    p_log ->> 'admin_username',
    p_log -> 'filters',
    (p_log ->> 'percentage')::numeric,
    (p_log ->> 'products_updated')::integer,
    p_log -> 'changes'
  );

  RETURN jsonb_build_object(
    'updated', jsonb_array_length(p_updates),
    'history_inserted', v_history_count,
    'next_offer_id', p_next_offer_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_catalog_carrefour_price_sync(jsonb, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_catalog_carrefour_price_sync(jsonb, integer, jsonb)
  TO service_role;

COMMIT;
