BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.catalog_maintenance_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  blocked_supermarkets text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.catalog_maintenance_state (singleton, blocked_supermarkets)
VALUES (true, '{}'::text[])
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.catalog_maintenance_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_maintenance_state FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.catalog_maintenance_blocked_supermarkets()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_blocked text[];
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  SELECT blocked_supermarkets
  INTO v_blocked
  FROM public.catalog_maintenance_state
  WHERE singleton = true;
  RETURN coalesce(v_blocked, '{}'::text[]);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_catalog_maintenance(p_blocked_supermarkets text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_blocked text[] := '{}'::text[];
  v_value text;
  v_normalized text;
BEGIN
  IF p_blocked_supermarkets IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_blocked_supermarkets';
  END IF;

  FOREACH v_value IN ARRAY p_blocked_supermarkets LOOP
    IF v_value IS NULL OR btrim(v_value) = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_blocked_supermarket';
    END IF;
    v_normalized := lower(btrim(v_value));
    IF v_normalized NOT IN ('mami', 'disco', 'carrefour') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_blocked_supermarket';
    END IF;
    IF v_normalized = 'mami' THEN
      v_blocked := array_append(v_blocked, 'Mami');
    ELSIF v_normalized = 'disco' THEN
      v_blocked := array_append(v_blocked, 'Disco');
    ELSE
      v_blocked := array_append(v_blocked, 'Carrefour');
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(DISTINCT item ORDER BY item), '{}'::text[])
  INTO v_blocked
  FROM unnest(v_blocked) AS blocked(item);

  PERFORM pg_advisory_xact_lock(194735821, 1);
  INSERT INTO public.catalog_maintenance_state (singleton, blocked_supermarkets, updated_at)
  VALUES (true, v_blocked, now())
  ON CONFLICT (singleton) DO UPDATE
    SET blocked_supermarkets = EXCLUDED.blocked_supermarkets,
        updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('blockedSupermarkets', to_jsonb(v_blocked));
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_catalog_write_allowed(p_supermarket text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_blocked text[];
  v_canonical text;
  v_is_known boolean;
BEGIN
  v_canonical := CASE lower(btrim(coalesce(p_supermarket, '')))
    WHEN 'mami' THEN 'Mami'
    WHEN 'disco' THEN 'Disco'
    WHEN 'carrefour' THEN 'Carrefour'
    ELSE NULL
  END;
  v_blocked := public.catalog_maintenance_blocked_supermarkets();
  v_is_known := v_canonical IS NOT NULL;
  IF (v_is_known AND v_canonical = ANY(v_blocked))
    OR (NOT v_is_known AND cardinality(v_blocked) > 0) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'catalog_maintenance',
      DETAIL = CASE
        WHEN v_is_known THEN jsonb_build_object('blockedSupermarket', v_canonical)::text
        ELSE jsonb_build_object(
          'reason', 'unclassified_catalog_write',
          'blockedSupermarkets', to_jsonb(v_blocked)
        )::text
      END;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_catalog_product_write_allowed(
  p_product_id bigint,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_supermarket text;
  v_has_offer boolean := false;
  v_source text := lower(btrim(coalesce(p_source, '')));
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF v_source IN ('mami', 'disco', 'carrefour') THEN
    PERFORM public.assert_catalog_write_allowed(v_source);
  END IF;
  IF p_product_id IS NOT NULL THEN
    FOR v_supermarket IN
      SELECT DISTINCT supermarket
      FROM public.offers
      WHERE product_id = p_product_id
    LOOP
      v_has_offer := true;
      PERFORM public.assert_catalog_write_allowed(v_supermarket);
    END LOOP;
  END IF;
  IF v_source NOT IN ('mami', 'disco', 'carrefour') AND NOT v_has_offer THEN
    PERFORM public.assert_catalog_write_allowed(p_source);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_offer_catalog_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.assert_catalog_write_allowed(OLD.supermarket);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.assert_catalog_write_allowed(NEW.supermarket);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_product_catalog_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.assert_catalog_product_write_allowed(OLD.id, OLD.source);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.assert_catalog_product_write_allowed(NEW.id, NEW.source);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_product_history_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product_id bigint;
  v_offer_id bigint;
  v_supermarket text;
  v_source text;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP <> 'INSERT' THEN
    v_product_id := OLD.product_id;
    v_offer_id := OLD.offer_id;
    IF v_offer_id IS NOT NULL THEN
      SELECT supermarket INTO v_supermarket FROM public.offers WHERE id = v_offer_id;
      IF FOUND THEN
        PERFORM public.assert_catalog_write_allowed(v_supermarket);
      ELSIF TG_OP = 'UPDATE'
        AND NEW.offer_id IS NULL
        AND (to_jsonb(OLD) - 'offer_id') = (to_jsonb(NEW) - 'offer_id') THEN
        RETURN NEW;
      ELSE
        PERFORM public.assert_catalog_write_allowed(NULL);
      END IF;
    ELSE
      SELECT source INTO v_source FROM public.products WHERE id = v_product_id;
      PERFORM public.assert_catalog_product_write_allowed(v_product_id, v_source);
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_product_id := NEW.product_id;
    v_offer_id := NEW.offer_id;
    IF TG_OP = 'UPDATE' AND OLD.offer_id IS NOT NULL AND NEW.offer_id IS NULL THEN
      NULL;
    ELSIF v_offer_id IS NOT NULL THEN
      SELECT supermarket INTO v_supermarket FROM public.offers WHERE id = v_offer_id;
      IF FOUND THEN
        PERFORM public.assert_catalog_write_allowed(v_supermarket);
      ELSE
        PERFORM public.assert_catalog_write_allowed(NULL);
      END IF;
    ELSE
      SELECT source INTO v_source FROM public.products WHERE id = v_product_id;
      PERFORM public.assert_catalog_product_write_allowed(v_product_id, v_source);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_product_analysis_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product_id bigint;
  v_source text;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP <> 'INSERT' THEN
    v_product_id := OLD.product_id;
    SELECT source INTO v_source FROM public.products WHERE id = v_product_id;
    PERFORM public.assert_catalog_product_write_allowed(v_product_id, v_source);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_product_id := NEW.product_id;
    SELECT source INTO v_source FROM public.products WHERE id = v_product_id;
    PERFORM public.assert_catalog_product_write_allowed(v_product_id, v_source);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_price_update_log_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row record;
  v_filters jsonb;
  v_changes jsonb;
  v_source text;
  v_supermarket text;
  v_offer_id bigint;
  v_scope_known boolean;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP <> 'INSERT' THEN
    v_filters := OLD.filters;
    v_changes := OLD.changes;
    v_source := v_filters ->> 'source';
    v_scope_known := false;
    IF v_source IN ('mami_import', 'mami_price_repair') THEN
      PERFORM public.assert_catalog_write_allowed('Mami');
      v_scope_known := true;
    ELSIF v_source IN ('disco_import', 'disco_sync', 'disco_public_search') THEN
      PERFORM public.assert_catalog_write_allowed('Disco');
      v_scope_known := true;
    ELSIF v_source IN ('carrefour_import', 'carrefour_sync') THEN
      PERFORM public.assert_catalog_write_allowed('Carrefour');
      v_scope_known := true;
    END IF;
    IF jsonb_typeof(v_filters) = 'object'
      AND jsonb_typeof(v_filters -> 'supermarket') = 'string'
      AND btrim(v_filters ->> 'supermarket') <> '' THEN
      PERFORM public.assert_catalog_write_allowed(v_filters ->> 'supermarket');
      v_scope_known := true;
    END IF;
    IF jsonb_typeof(v_changes) = 'array' THEN
      FOR v_row IN SELECT value FROM jsonb_array_elements(v_changes)
      LOOP
        IF jsonb_typeof(v_row.value -> 'offerId') = 'number'
          AND (v_row.value ->> 'offerId') ~ '^[1-9][0-9]*$'
          AND (v_row.value ->> 'offerId')::numeric <= 9007199254740991 THEN
          v_offer_id := (v_row.value ->> 'offerId')::bigint;
          SELECT supermarket INTO v_supermarket
          FROM public.offers
          WHERE id = v_offer_id;
          IF FOUND AND v_supermarket IS NOT NULL AND btrim(v_supermarket) <> '' THEN
            v_scope_known := true;
          END IF;
          PERFORM public.assert_catalog_write_allowed(v_supermarket);
        ELSIF v_source NOT IN (
          'mami_import', 'mami_price_repair',
          'disco_import', 'disco_sync', 'disco_public_search',
          'carrefour_import', 'carrefour_sync'
        ) THEN
          v_scope_known := false;
        END IF;
      END LOOP;
    ELSIF v_source NOT IN (
      'mami_import', 'mami_price_repair',
      'disco_import', 'disco_sync', 'disco_public_search',
      'carrefour_import', 'carrefour_sync'
    ) THEN
      v_scope_known := false;
    END IF;
    IF NOT v_scope_known THEN
      PERFORM public.assert_catalog_write_allowed(NULL);
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_filters := NEW.filters;
    v_changes := NEW.changes;
    v_source := v_filters ->> 'source';
    v_scope_known := false;
    IF v_source IN ('mami_import', 'mami_price_repair') THEN
      PERFORM public.assert_catalog_write_allowed('Mami');
      v_scope_known := true;
    ELSIF v_source IN ('disco_import', 'disco_sync', 'disco_public_search') THEN
      PERFORM public.assert_catalog_write_allowed('Disco');
      v_scope_known := true;
    ELSIF v_source IN ('carrefour_import', 'carrefour_sync') THEN
      PERFORM public.assert_catalog_write_allowed('Carrefour');
      v_scope_known := true;
    END IF;
    IF jsonb_typeof(v_filters) = 'object'
      AND jsonb_typeof(v_filters -> 'supermarket') = 'string'
      AND btrim(v_filters ->> 'supermarket') <> '' THEN
      PERFORM public.assert_catalog_write_allowed(v_filters ->> 'supermarket');
      v_scope_known := true;
    END IF;
    IF jsonb_typeof(v_changes) = 'array' THEN
      FOR v_row IN SELECT value FROM jsonb_array_elements(v_changes)
      LOOP
        IF jsonb_typeof(v_row.value -> 'offerId') = 'number'
          AND (v_row.value ->> 'offerId') ~ '^[1-9][0-9]*$'
          AND (v_row.value ->> 'offerId')::numeric <= 9007199254740991 THEN
          v_offer_id := (v_row.value ->> 'offerId')::bigint;
          SELECT supermarket INTO v_supermarket
          FROM public.offers
          WHERE id = v_offer_id;
          IF FOUND AND v_supermarket IS NOT NULL AND btrim(v_supermarket) <> '' THEN
            v_scope_known := true;
          END IF;
          PERFORM public.assert_catalog_write_allowed(v_supermarket);
        ELSIF v_source NOT IN (
          'mami_import', 'mami_price_repair',
          'disco_import', 'disco_sync', 'disco_public_search',
          'carrefour_import', 'carrefour_sync'
        ) THEN
          v_scope_known := false;
        END IF;
      END LOOP;
    ELSIF v_source NOT IN (
      'mami_import', 'mami_price_repair',
      'disco_import', 'disco_sync', 'disco_public_search',
      'carrefour_import', 'carrefour_sync'
    ) THEN
      v_scope_known := false;
    END IF;
    IF NOT v_scope_known THEN
      PERFORM public.assert_catalog_write_allowed(NULL);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_brand_catalog_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product record;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  FOR v_product IN
    SELECT id, source FROM public.products
    WHERE brand_id = OLD.id
  LOOP
    PERFORM public.assert_catalog_product_write_allowed(v_product.id, v_product.source);
  END LOOP;
  IF TG_OP <> 'DELETE' THEN
    FOR v_product IN
      SELECT id, source FROM public.products
      WHERE brand_id = NEW.id
    LOOP
      PERFORM public.assert_catalog_product_write_allowed(v_product.id, v_product.source);
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_category_catalog_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product record;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  FOR v_product IN
    SELECT product.id, product.source
    FROM public.products product
    WHERE product.category_id = OLD.id
       OR product.subcategory_id IN (
         SELECT subcategory.id
         FROM public.subcategories subcategory
         WHERE subcategory.category_id = OLD.id
       )
  LOOP
    PERFORM public.assert_catalog_product_write_allowed(v_product.id, v_product.source);
  END LOOP;
  IF TG_OP <> 'DELETE' THEN
    FOR v_product IN
      SELECT product.id, product.source
      FROM public.products product
      WHERE product.category_id = NEW.id
         OR product.subcategory_id IN (
           SELECT subcategory.id
           FROM public.subcategories subcategory
           WHERE subcategory.category_id = NEW.id
         )
    LOOP
      PERFORM public.assert_catalog_product_write_allowed(v_product.id, v_product.source);
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_subcategory_catalog_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product record;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  FOR v_product IN
    SELECT product.id, product.source
    FROM public.products product
    WHERE product.subcategory_id = OLD.id
  LOOP
    PERFORM public.assert_catalog_product_write_allowed(v_product.id, v_product.source);
  END LOOP;
  IF TG_OP <> 'DELETE' THEN
    FOR v_product IN
      SELECT product.id, product.source
      FROM public.products product
      WHERE product.subcategory_id = NEW.id
    LOOP
      PERFORM public.assert_catalog_product_write_allowed(v_product.id, v_product.source);
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_supermarket_catalog_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_catalog_write_allowed(NEW.name);
    RETURN NEW;
  END IF;
  PERFORM public.assert_catalog_write_allowed(OLD.name);
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.assert_catalog_write_allowed(NEW.name);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS catalog_maintenance_offers_guard ON public.offers;
CREATE TRIGGER catalog_maintenance_offers_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.guard_offer_catalog_write();

DROP TRIGGER IF EXISTS catalog_maintenance_products_guard ON public.products;
CREATE TRIGGER catalog_maintenance_products_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_product_catalog_write();

DROP TRIGGER IF EXISTS catalog_maintenance_price_history_guard ON public.price_history;
CREATE TRIGGER catalog_maintenance_price_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.price_history
FOR EACH ROW EXECUTE FUNCTION public.guard_product_history_write();

DROP TRIGGER IF EXISTS catalog_maintenance_price_analysis_guard ON public.price_analysis;
CREATE TRIGGER catalog_maintenance_price_analysis_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.price_analysis
FOR EACH ROW EXECUTE FUNCTION public.guard_product_analysis_write();

DROP TRIGGER IF EXISTS catalog_maintenance_price_update_log_guard ON public.price_update_log;
CREATE TRIGGER catalog_maintenance_price_update_log_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.price_update_log
FOR EACH ROW EXECUTE FUNCTION public.guard_price_update_log_write();

DROP TRIGGER IF EXISTS catalog_maintenance_brands_guard ON public.brands;
CREATE TRIGGER catalog_maintenance_brands_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.guard_brand_catalog_write();

DROP TRIGGER IF EXISTS catalog_maintenance_categories_guard ON public.categories;
CREATE TRIGGER catalog_maintenance_categories_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.guard_category_catalog_write();

DROP TRIGGER IF EXISTS catalog_maintenance_subcategories_guard ON public.subcategories;
CREATE TRIGGER catalog_maintenance_subcategories_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.subcategories
FOR EACH ROW EXECUTE FUNCTION public.guard_subcategory_catalog_write();

DROP TRIGGER IF EXISTS catalog_maintenance_supermarkets_guard ON public.supermarkets;
CREATE TRIGGER catalog_maintenance_supermarkets_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.supermarkets
FOR EACH ROW EXECUTE FUNCTION public.guard_supermarket_catalog_write();

CREATE OR REPLACE FUNCTION public.revert_price_update(p_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_update public.price_update_log%ROWTYPE;
  v_filters jsonb;
  v_changes jsonb;
  v_change jsonb;
  v_offer public.offers%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_source text;
  v_expected_supermarket text;
  v_offer_id bigint;
  v_product_id bigint;
  v_previous numeric;
  v_updated numeric;
  v_seen bigint[] := '{}'::bigint[];
  v_total integer;
  v_current_offer_id bigint;
  v_stage text := 'validation';
  v_error_message text;
  v_error_detail text;
  v_error_code text;
  v_has_source boolean;
  v_valid_filter boolean;
  v_any_filter boolean;
  v_item jsonb;
  v_keys text[];
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  BEGIN
    SELECT * INTO v_update
    FROM public.price_update_log
    WHERE id = p_log_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;
    v_filters := v_update.filters;
    v_changes := v_update.changes;
    IF jsonb_typeof(v_filters) <> 'object' OR jsonb_typeof(v_changes) <> 'array' THEN
      RETURN jsonb_build_object('status', 'not_reversible');
    END IF;
    v_total := jsonb_array_length(v_changes);

    v_has_source := v_filters ? 'source';
    v_source := CASE WHEN jsonb_typeof(v_filters -> 'source') = 'string'
      THEN v_filters ->> 'source' ELSE NULL END;
    IF v_has_source THEN
      IF v_source IN ('mami_import', 'mami_price_repair') THEN
        IF 'Mami' = ANY(public.catalog_maintenance_blocked_supermarkets()) THEN
          RETURN jsonb_build_object(
            'status', 'catalog_maintenance',
            'blockedSupermarket', 'Mami',
            'partialRevert', false,
            'restoredOfferCount', 0,
            'pendingOfferCount', v_total
          );
        END IF;
      ELSIF v_source IN ('disco_import', 'disco_sync', 'disco_public_search') THEN
        IF 'Disco' = ANY(public.catalog_maintenance_blocked_supermarkets()) THEN
          RETURN jsonb_build_object(
            'status', 'catalog_maintenance',
            'blockedSupermarket', 'Disco',
            'partialRevert', false,
            'restoredOfferCount', 0,
            'pendingOfferCount', v_total
          );
        END IF;
      ELSIF v_source IN ('carrefour_import', 'carrefour_sync') THEN
        IF 'Carrefour' = ANY(public.catalog_maintenance_blocked_supermarkets()) THEN
          RETURN jsonb_build_object(
            'status', 'catalog_maintenance',
            'blockedSupermarket', 'Carrefour',
            'partialRevert', false,
            'restoredOfferCount', 0,
            'pendingOfferCount', v_total
          );
        END IF;
      END IF;
      IF v_source = 'disco_sync'
        AND (
          CASE
            WHEN jsonb_typeof(v_filters -> 'removedOffers') = 'array'
            THEN jsonb_array_length(v_filters -> 'removedOffers') > 0
            ELSE false
          END
          OR CASE
            WHEN jsonb_typeof(v_filters -> 'unavailable') = 'array'
            THEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements(v_filters -> 'unavailable') unavailable(item)
              WHERE unavailable.item ? 'removedOfferId'
            )
            ELSE false
          END
        ) THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      IF v_source = 'carrefour_sync'
        AND jsonb_typeof(v_changes) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_changes) change(item)
          WHERE change.item -> 'identityChanged' = 'true'::jsonb
            OR change.item -> 'listPriceChanged' = 'true'::jsonb
        ) THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      IF v_source IN ('mami_import', 'carrefour_import', 'disco_import', 'disco_public_search') THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      ELSIF v_source = 'admin_edit' THEN
        IF jsonb_typeof(v_filters -> 'supermarket') = 'string'
          AND EXISTS (
            SELECT 1
            FROM unnest(public.catalog_maintenance_blocked_supermarkets()) AS blocked(name)
            WHERE lower(blocked.name) = lower(btrim(v_filters ->> 'supermarket'))
          ) THEN
          RETURN jsonb_build_object(
            'status', 'catalog_maintenance',
            'blockedSupermarket', v_filters ->> 'supermarket',
            'partialRevert', false,
            'restoredOfferCount', 0,
            'pendingOfferCount', v_total
          );
        END IF;
        RETURN jsonb_build_object('status', 'not_reversible');
      ELSIF v_source = 'mami_price_repair' THEN
        v_expected_supermarket := 'Mami';
      ELSIF v_source = 'disco_sync' THEN
        v_expected_supermarket := 'Disco';
      ELSIF v_source = 'carrefour_sync' THEN
        v_expected_supermarket := 'Carrefour';
      ELSE
        IF 'Mami' = ANY(public.catalog_maintenance_blocked_supermarkets())
          OR 'Disco' = ANY(public.catalog_maintenance_blocked_supermarkets()) THEN
          RETURN jsonb_build_object(
            'status', 'catalog_maintenance',
            'blockedSupermarkets', to_jsonb(public.catalog_maintenance_blocked_supermarkets()),
            'partialRevert', false,
            'restoredOfferCount', 0,
            'pendingOfferCount', v_total
          );
        END IF;
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
    ELSE
      SELECT coalesce(array_agg(key ORDER BY key), '{}'::text[])
      INTO v_keys
      FROM jsonb_object_keys(v_filters) AS keys(key);
      IF v_keys IS DISTINCT FROM ARRAY['brandId', 'categoryId', 'supermarket']::text[] THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;

      v_any_filter := false;
      FOREACH v_item IN ARRAY ARRAY[v_filters -> 'categoryId', v_filters -> 'brandId'] LOOP
        v_valid_filter := jsonb_typeof(v_item) = 'null'
          OR (jsonb_typeof(v_item) = 'string' AND btrim(v_item #>> '{}') <> '')
          OR (jsonb_typeof(v_item) = 'number'
            AND (v_item #>> '{}') ~ '^[1-9][0-9]*$'
            AND (v_item #>> '{}')::numeric <= 9007199254740991);
        IF NOT v_valid_filter THEN
          RETURN jsonb_build_object('status', 'not_reversible');
        END IF;
        IF jsonb_typeof(v_item) = 'string' AND btrim(v_item #>> '{}') <> ''
          OR jsonb_typeof(v_item) = 'number' THEN
          v_any_filter := true;
        END IF;
      END LOOP;
      v_item := v_filters -> 'supermarket';
      v_valid_filter := jsonb_typeof(v_item) = 'null'
        OR (jsonb_typeof(v_item) = 'string' AND btrim(v_item #>> '{}') <> '');
      IF NOT v_valid_filter THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      IF jsonb_typeof(v_item) = 'string' AND btrim(v_item #>> '{}') <> '' THEN
        v_any_filter := true;
        v_expected_supermarket := btrim(v_item #>> '{}');
      END IF;
      IF NOT v_any_filter THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
    END IF;

    IF jsonb_array_length(v_changes) = 0 THEN
      RETURN jsonb_build_object('status', 'not_reversible');
    END IF;
    FOR v_change IN SELECT value FROM jsonb_array_elements(v_changes)
    LOOP
      IF jsonb_typeof(v_change) <> 'object'
        OR jsonb_typeof(v_change -> 'offerId') <> 'number'
        OR jsonb_typeof(v_change -> 'productId') <> 'number'
        OR jsonb_typeof(v_change -> 'previousCashPrice') <> 'number'
        OR jsonb_typeof(v_change -> 'updatedCashPrice') <> 'number'
        OR (v_change ->> 'offerId') !~ '^[1-9][0-9]*$'
        OR (v_change ->> 'productId') !~ '^[1-9][0-9]*$'
        OR (v_change ->> 'offerId')::numeric > 9007199254740991
        OR (v_change ->> 'productId')::numeric > 9007199254740991 THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      v_offer_id := (v_change ->> 'offerId')::bigint;
      v_product_id := (v_change ->> 'productId')::bigint;
      v_previous := (v_change ->> 'previousCashPrice')::numeric;
      v_updated := (v_change ->> 'updatedCashPrice')::numeric;
      IF v_previous <= 0 OR v_updated <= 0 THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      IF v_offer_id = ANY(v_seen) THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      v_seen := array_append(v_seen, v_offer_id);
    END LOOP;

    FOR v_change IN
      SELECT value FROM jsonb_array_elements(v_changes)
      ORDER BY (value ->> 'offerId')::bigint
    LOOP
      v_offer_id := (v_change ->> 'offerId')::bigint;
      v_product_id := (v_change ->> 'productId')::bigint;
      v_updated := (v_change ->> 'updatedCashPrice')::numeric;
      SELECT * INTO v_offer FROM public.offers WHERE id = v_offer_id FOR UPDATE;
      IF NOT FOUND OR v_offer.product_id IS DISTINCT FROM v_product_id THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      SELECT * INTO v_product
      FROM public.products
      WHERE id = v_product_id
      FOR SHARE;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      IF NOT v_has_source THEN
        IF jsonb_typeof(v_filters -> 'categoryId') <> 'null'
          AND v_filters ->> 'categoryId' IS DISTINCT FROM v_product.category_id::text
          AND NOT EXISTS (
            SELECT 1 FROM public.categories category
            WHERE category.id = v_product.category_id
              AND category.name = v_filters ->> 'categoryId'
          ) THEN
          RETURN jsonb_build_object('status', 'not_reversible');
        END IF;
        IF jsonb_typeof(v_filters -> 'brandId') <> 'null'
          AND v_filters ->> 'brandId' IS DISTINCT FROM v_product.brand_id::text
          AND NOT EXISTS (
            SELECT 1 FROM public.brands brand
            WHERE brand.id = v_product.brand_id
              AND brand.name = v_filters ->> 'brandId'
          ) THEN
          RETURN jsonb_build_object('status', 'not_reversible');
        END IF;
      END IF;
      IF v_expected_supermarket IS NOT NULL
        AND lower(btrim(coalesce(v_offer.supermarket, '')))
          IS DISTINCT FROM lower(v_expected_supermarket) THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      IF v_offer.supermarket IS NULL OR btrim(v_offer.supermarket) = '' THEN
        RETURN jsonb_build_object('status', 'not_reversible');
      END IF;
      IF v_offer.cash_price IS DISTINCT FROM v_updated THEN
        RETURN jsonb_build_object(
          'status', 'price_update_stale',
          'partialRevert', false,
          'restoredOfferCount', 0,
          'pendingOfferCount', v_total,
          'offerId', v_offer_id
        );
      END IF;
      PERFORM public.assert_catalog_write_allowed(v_offer.supermarket);
    END LOOP;

    IF NOT v_has_source THEN
      FOR v_change IN SELECT value FROM jsonb_array_elements(v_changes)
      LOOP
        SELECT coalesce(array_agg(key ORDER BY key), '{}'::text[])
        INTO v_keys
        FROM jsonb_object_keys(v_change) AS keys(key);
        IF v_keys IS DISTINCT FROM ARRAY[
          'offerId', 'previousCashPrice', 'productId', 'updatedCashPrice'
        ]::text[] THEN
          RETURN jsonb_build_object('status', 'not_reversible');
        END IF;
      END LOOP;
    END IF;

    v_stage := 'restore';
    FOR v_change IN
      SELECT value FROM jsonb_array_elements(v_changes)
      ORDER BY (value ->> 'offerId')::bigint
    LOOP
      v_current_offer_id := (v_change ->> 'offerId')::bigint;
      UPDATE public.offers
      SET cash_price = (v_change ->> 'previousCashPrice')::numeric
      WHERE id = v_current_offer_id
        AND product_id = (v_change ->> 'productId')::bigint
        AND cash_price = (v_change ->> 'updatedCashPrice')::numeric;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_update_stale';
      END IF;
      v_stage := 'history';
      INSERT INTO public.price_history (product_id, offer_id, cash_price, source)
      VALUES (
        (v_change ->> 'productId')::bigint,
        v_current_offer_id,
        (v_change ->> 'previousCashPrice')::numeric,
        'bulk_admin_revert'
      );
      v_stage := 'restore';
    END LOOP;

    v_current_offer_id := NULL;
    DELETE FROM public.price_update_log WHERE id = p_log_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_update_log_delete_failed';
    END IF;

    RETURN jsonb_build_object(
      'status', 'reverted',
      'restoredOfferCount', v_total,
      'pendingOfferCount', 0,
      'partialRevert', false
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_error_message = MESSAGE_TEXT,
      v_error_detail = PG_EXCEPTION_DETAIL,
      v_error_code = RETURNED_SQLSTATE;
    RETURN jsonb_build_object(
      'status', CASE
        WHEN v_error_message = 'catalog_maintenance' THEN 'catalog_maintenance'
        WHEN v_error_message = 'price_update_stale' THEN 'price_update_stale'
        WHEN v_stage = 'history' THEN 'price_update_history_failed'
        ELSE 'price_update_revert_failed'
      END,
      'sqlState', v_error_code,
      'message', v_error_message,
      'detail', v_error_detail,
      'partialRevert', false,
      'restoredOfferCount', 0,
      'pendingOfferCount', coalesce(v_total, 0),
      'offerId', v_current_offer_id
    );
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_catalog_price_sync(
  p_supermarket text,
  p_source text,
  p_updates jsonb,
  p_removals jsonb,
  p_log jsonb DEFAULT NULL
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
  v_previous numeric;
  v_updated numeric;
  v_seen bigint[] := '{}'::bigint[];
  v_update_count integer := 0;
  v_removal_count integer := 0;
BEGIN
  IF p_supermarket IS NULL OR p_source IS NULL
    OR (p_supermarket, p_source) NOT IN (
    ('Mami', 'mami_price_repair'),
    ('Disco', 'disco_sync')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_source';
  END IF;
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_removals) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_changes';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR jsonb_typeof(v_item -> 'offerId') <> 'number'
      OR jsonb_typeof(v_item -> 'productId') <> 'number'
      OR jsonb_typeof(v_item -> 'sourceProductId') <> 'string'
      OR btrim(v_item ->> 'sourceProductId') = ''
      OR jsonb_typeof(v_item -> 'previousCashPrice') <> 'number'
      OR jsonb_typeof(v_item -> 'updatedCashPrice') <> 'number' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_update';
    END IF;
    IF (v_item ->> 'offerId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'productId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'offerId')::numeric > 9007199254740991
      OR (v_item ->> 'productId')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_update';
    END IF;
    v_previous := (v_item ->> 'previousCashPrice')::numeric;
    v_updated := (v_item ->> 'updatedCashPrice')::numeric;
    IF v_previous <= 0 OR v_updated <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_update';
    END IF;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_removals)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR jsonb_typeof(v_item -> 'offerId') <> 'number'
      OR jsonb_typeof(v_item -> 'productId') <> 'number'
      OR jsonb_typeof(v_item -> 'sourceProductId') <> 'string'
      OR btrim(v_item ->> 'sourceProductId') = ''
      OR jsonb_typeof(v_item -> 'previousCashPrice') <> 'number' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_removal';
    END IF;
    IF (v_item ->> 'offerId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'productId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'offerId')::numeric > 9007199254740991
      OR (v_item ->> 'productId')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_removal';
    END IF;
    v_previous := (v_item ->> 'previousCashPrice')::numeric;
    IF v_previous <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_removal';
    END IF;
  END LOOP;
  IF (jsonb_array_length(p_updates) > 0 OR jsonb_array_length(p_removals) > 0)
    AND p_log IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'price_sync_log_required';
  END IF;

  PERFORM pg_advisory_xact_lock_shared(194735821, 1);
  PERFORM public.assert_catalog_write_allowed(p_supermarket);

  FOR v_item IN
    SELECT value FROM (
      SELECT value FROM jsonb_array_elements(p_updates)
      UNION ALL
      SELECT value FROM jsonb_array_elements(p_removals)
    ) changes
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR jsonb_typeof(v_item -> 'offerId') <> 'number'
      OR jsonb_typeof(v_item -> 'productId') <> 'number'
      OR jsonb_typeof(v_item -> 'sourceProductId') <> 'string'
      OR btrim(v_item ->> 'sourceProductId') = ''
      OR (v_item ->> 'offerId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'productId') !~ '^[1-9][0-9]*$'
      OR (v_item ->> 'offerId')::numeric > 9007199254740991
      OR (v_item ->> 'productId')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_change';
    END IF;
    v_offer_id := (v_item ->> 'offerId')::bigint;
    IF v_offer_id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate_price_sync_offer';
    END IF;
    v_seen := array_append(v_seen, v_offer_id);
    SELECT * INTO v_offer FROM public.offers WHERE id = v_offer_id FOR UPDATE;
    IF NOT FOUND OR v_offer.product_id <> (v_item ->> 'productId')::bigint
      OR v_offer.supermarket <> p_supermarket THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_sync_offer_changed';
    END IF;
    PERFORM public.assert_catalog_write_allowed(v_offer.supermarket);
    IF v_offer.cash_price IS DISTINCT FROM (v_item ->> 'previousCashPrice')::numeric THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_sync_offer_changed';
    END IF;
    PERFORM 1 FROM public.products
    WHERE id = v_offer.product_id
      AND source = lower(p_supermarket)
      AND source_product_id = (v_item ->> 'sourceProductId')
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_sync_product_changed';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    v_offer_id := (v_item ->> 'offerId')::bigint;
    v_product_id := (v_item ->> 'productId')::bigint;
    v_updated := (v_item ->> 'updatedCashPrice')::numeric;
    UPDATE public.offers SET cash_price = v_updated
    WHERE id = v_offer_id AND product_id = v_product_id AND supermarket = p_supermarket;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_sync_offer_changed';
    END IF;
    INSERT INTO public.price_history (product_id, offer_id, cash_price, source)
    VALUES (v_product_id, v_offer_id, v_updated, p_source);
    v_update_count := v_update_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_removals)
    ORDER BY (value ->> 'offerId')::bigint
  LOOP
    IF p_supermarket <> 'Disco' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'price_sync_removal_not_allowed';
    END IF;
    v_offer_id := (v_item ->> 'offerId')::bigint;
    DELETE FROM public.offers
    WHERE id = v_offer_id
      AND product_id = (v_item ->> 'productId')::bigint
      AND supermarket = p_supermarket;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_sync_offer_changed';
    END IF;
    v_removal_count := v_removal_count + 1;
  END LOOP;

  IF p_log IS NOT NULL THEN
    IF jsonb_typeof(p_log) <> 'object'
      OR jsonb_typeof(p_log -> 'filters') <> 'object'
      OR jsonb_typeof(p_log -> 'changes') <> 'array'
      OR jsonb_typeof(p_log -> 'percentage') <> 'number'
      OR jsonb_typeof(p_log -> 'products_updated') <> 'number'
      OR jsonb_typeof(p_log -> 'admin_username') <> 'string'
      OR btrim(p_log ->> 'admin_username') = ''
      OR (p_log -> 'filters' ->> 'source') IS DISTINCT FROM p_source
      OR jsonb_typeof(p_log -> 'filters' -> 'operationId') IS DISTINCT FROM 'string'
      OR (p_log -> 'filters' ->> 'operationId')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (p_log ->> 'products_updated') !~ '^(0|[1-9][0-9]*)$'
      OR (p_log ->> 'products_updated')::numeric > 2147483647
      OR (p_log ->> 'products_updated')::integer <> jsonb_array_length(p_updates)
      OR (CASE
        WHEN jsonb_typeof(p_log -> 'changes') = 'array'
        THEN jsonb_array_length(p_log -> 'changes') <> jsonb_array_length(p_updates)
        ELSE true
      END)
      OR (
        jsonb_array_length(p_removals) > 0
        AND (
          jsonb_typeof(p_log -> 'filters' -> 'removedOffers') IS DISTINCT FROM 'array'
          OR (CASE
            WHEN jsonb_typeof(p_log -> 'filters' -> 'removedOffers') = 'array'
            THEN jsonb_array_length(p_log -> 'filters' -> 'removedOffers') <> jsonb_array_length(p_removals)
            ELSE true
          END)
        )
      ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_price_sync_log';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_log -> 'changes') logged(value)
        WHERE jsonb_typeof(logged.value) = 'object'
          AND logged.value -> 'offerId' = v_item -> 'offerId'
          AND logged.value -> 'productId' = v_item -> 'productId'
          AND logged.value -> 'sourceProductId' = v_item -> 'sourceProductId'
          AND logged.value -> 'previousCashPrice' = v_item -> 'previousCashPrice'
          AND logged.value -> 'updatedCashPrice' = v_item -> 'updatedCashPrice'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'price_sync_log_mismatch';
      END IF;
    END LOOP;
    IF jsonb_array_length(p_removals) > 0 THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(p_removals)
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_log -> 'filters' -> 'removedOffers') logged(value)
          WHERE jsonb_typeof(logged.value) = 'object'
            AND logged.value -> 'offerId' = v_item -> 'offerId'
            AND logged.value -> 'productId' = v_item -> 'productId'
            AND logged.value -> 'sourceProductId' = v_item -> 'sourceProductId'
            AND logged.value -> 'previousCashPrice' = v_item -> 'previousCashPrice'
        ) THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'price_sync_removal_log_mismatch';
        END IF;
      END LOOP;
    END IF;
    INSERT INTO public.price_update_log (
      admin_username, filters, percentage, products_updated, changes
    ) VALUES (
      p_log ->> 'admin_username',
      p_log -> 'filters',
      (p_log ->> 'percentage')::numeric,
      (p_log ->> 'products_updated')::integer,
      p_log -> 'changes'
    );
  END IF;

  RETURN jsonb_build_object(
    'updated', v_update_count,
    'removed', v_removal_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.catalog_maintenance_blocked_supermarkets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_catalog_maintenance(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_catalog_write_allowed(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_catalog_product_write_allowed(bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_offer_catalog_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_product_catalog_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_product_history_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_product_analysis_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_price_update_log_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_brand_catalog_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_category_catalog_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_subcategory_catalog_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_supermarket_catalog_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_price_update(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_catalog_price_sync(text, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_catalog_maintenance(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_maintenance_blocked_supermarkets() TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_catalog_write_allowed(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_catalog_product_write_allowed(bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_offer_catalog_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_product_catalog_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_product_history_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_product_analysis_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_price_update_log_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_brand_catalog_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_category_catalog_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_subcategory_catalog_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_supermarket_catalog_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_price_update(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_catalog_price_sync(text, text, jsonb, jsonb, jsonb)
  TO service_role;

COMMIT;
