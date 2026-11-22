BEGIN;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS is_catalog_visible boolean NOT NULL DEFAULT true;

UPDATE public.offers
SET is_catalog_visible = true
WHERE is_catalog_visible IS NULL;

ALTER TABLE public.offers
  ALTER COLUMN is_catalog_visible SET DEFAULT true,
  ALTER COLUMN is_catalog_visible SET NOT NULL;

DROP POLICY IF EXISTS offers_public_read ON public.offers;
CREATE POLICY offers_public_read ON public.offers
  FOR SELECT TO anon, authenticated
  USING (is_catalog_visible IS TRUE);

CREATE OR REPLACE FUNCTION public.refresh_catalog_offer_price_summary(p_offer_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.catalog_offer_price_summary (
    offer_id, product_id, normalized_price, price_change_percentage, updated_at
  )
  SELECT
    o.id,
    o.product_id,
    public.catalog_normalize_offer_price(p.source, o.cash_price),
    public.catalog_latest_offer_price_change(o.id),
    now()
  FROM public.offers o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.id = p_offer_id
    AND o.is_catalog_visible IS TRUE
  ON CONFLICT (offer_id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    normalized_price = EXCLUDED.normalized_price,
    price_change_percentage = EXCLUDED.price_change_percentage,
    updated_at = EXCLUDED.updated_at;

  IF NOT FOUND THEN
    DELETE FROM public.catalog_offer_price_summary WHERE offer_id = p_offer_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_catalog_offer_price_summary(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_offer_price_summary(bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_taxonomy_counts()
RETURNS TABLE(category_id uuid, subcategory_id uuid, product_count bigint)
LANGUAGE sql
STABLE
AS $function$
  SELECT p.category_id, p.subcategory_id, count(DISTINCT p.id)
  FROM public.products p
  WHERE EXISTS (
    SELECT 1
    FROM public.offers o
    WHERE o.product_id = p.id
      AND o.cash_price > 0
      AND o.is_catalog_visible IS TRUE
      AND nullif(btrim(coalesce(o.supermarket, '')), '') IS NOT NULL
  )
  GROUP BY p.category_id, p.subcategory_id;
$function$;

COMMIT;
