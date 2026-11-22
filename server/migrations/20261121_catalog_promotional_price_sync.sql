BEGIN;

CREATE OR REPLACE FUNCTION public.apply_catalog_promotion_sync(
  p_supermarket text,
  p_updates jsonb
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
  v_expected_cash_price numeric;
  v_previous_list_price numeric;
  v_updated_list_price numeric;
  v_seen bigint[] := '{}'::bigint[];
  v_update_count integer := 0;
BEGIN
  IF p_supermarket IS NULL
    OR p_supermarket NOT IN ('Disco', 'Mami')
    OR jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_promotion_sync_updates';
  END IF;
  IF jsonb_array_length(p_updates) = 0 THEN
    RETURN jsonb_build_object('updated', 0);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR jsonb_typeof(v_item -> 'offerId') <> 'number'
      OR jsonb_typeof(v_item -> 'productId') <> 'number'
      OR jsonb_typeof(v_item -> 'sourceProductId') <> 'string'
      OR btrim(v_item ->> 'sourceProductId') = ''
      OR jsonb_typeof(v_item -> 'expectedCashPrice') <> 'number'
      OR NOT (v_item ? 'previousListPrice')
      OR jsonb_typeof(v_item -> 'previousListPrice') NOT IN ('number', 'null')
      OR NOT (v_item ? 'updatedListPrice')
      OR jsonb_typeof(v_item -> 'updatedListPrice') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_promotion_sync_update';
    END IF;
    IF (v_item ->> 'offerId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'productId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'offerId')::numeric > 9007199254740991
      OR (v_item ->> 'productId')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_promotion_sync_update';
    END IF;

    v_expected_cash_price := (v_item ->> 'expectedCashPrice')::numeric;
    v_previous_list_price := NULLIF(v_item ->> 'previousListPrice', '')::numeric;
    v_updated_list_price := NULLIF(v_item ->> 'updatedListPrice', '')::numeric;
    IF v_expected_cash_price <= 0
      OR (v_updated_list_price IS NOT NULL AND v_updated_list_price <= v_expected_cash_price) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_promotion_sync_price';
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  PERFORM public.assert_catalog_write_allowed(p_supermarket);

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    v_offer_id := (v_item ->> 'offerId')::bigint;
    v_product_id := (v_item ->> 'productId')::bigint;
    v_expected_cash_price := (v_item ->> 'expectedCashPrice')::numeric;
    v_previous_list_price := NULLIF(v_item ->> 'previousListPrice', '')::numeric;
    IF v_offer_id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate_promotion_sync_offer';
    END IF;
    v_seen := array_append(v_seen, v_offer_id);

    SELECT * INTO v_offer FROM public.offers WHERE id = v_offer_id FOR UPDATE;
    IF NOT FOUND
      OR v_offer.product_id <> v_product_id
      OR v_offer.supermarket <> p_supermarket
      OR v_offer.cash_price IS DISTINCT FROM v_expected_cash_price
      OR v_offer.list_price IS DISTINCT FROM v_previous_list_price THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promotion_sync_offer_changed';
    END IF;

    PERFORM public.assert_catalog_write_allowed(p_supermarket);
    PERFORM 1 FROM public.products
    WHERE id = v_product_id
      AND source = lower(p_supermarket)
      AND source_product_id = (v_item ->> 'sourceProductId')
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promotion_sync_product_changed';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    v_offer_id := (v_item ->> 'offerId')::bigint;
    v_product_id := (v_item ->> 'productId')::bigint;
    v_updated_list_price := NULLIF(v_item ->> 'updatedListPrice', '')::numeric;
    UPDATE public.offers
    SET list_price = v_updated_list_price
    WHERE id = v_offer_id
      AND product_id = v_product_id
      AND supermarket = p_supermarket;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promotion_sync_offer_changed';
    END IF;
    v_update_count := v_update_count + 1;
  END LOOP;

  RETURN jsonb_build_object('updated', v_update_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_catalog_promotion_sync(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_catalog_promotion_sync(text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_catalog_price_promotion_sync(
  p_supermarket text,
  p_source text,
  p_updates jsonb,
  p_promotion_updates jsonb,
  p_removals jsonb,
  p_log jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_price_result jsonb;
  v_promotion_result jsonb;
BEGIN
  IF jsonb_typeof(p_promotion_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_promotion_sync_updates';
  END IF;

  v_price_result := public.apply_catalog_price_sync(
    p_supermarket,
    p_source,
    p_updates,
    p_removals,
    p_log
  );
  v_promotion_result := public.apply_catalog_promotion_sync(p_supermarket, p_promotion_updates);

  RETURN v_price_result || jsonb_build_object(
    'promotions_updated',
    v_promotion_result -> 'updated'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_catalog_price_promotion_sync(text, text, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_catalog_price_promotion_sync(text, text, jsonb, jsonb, jsonb, jsonb)
  TO service_role;

COMMIT;
