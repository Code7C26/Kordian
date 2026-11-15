-- Isolated product-classification RPC. This does not install or alter
-- category/subcategory constraints or the subcategory administration RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_catalog_product_classification(
  p_product_id integer,
  p_subcategory_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_category_id uuid;
  v_product public.products%ROWTYPE;
BEGIN
  SELECT category_id
  INTO v_category_id
  FROM public.subcategories
  WHERE id = p_subcategory_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'subcategory_not_found');
  END IF;

  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  UPDATE public.products
  SET category_id = v_category_id,
      subcategory_id = p_subcategory_id,
      classification_source = 'manual',
      classification_confidence = 'manual'
  WHERE id = p_product_id
  RETURNING * INTO v_product;

  RETURN jsonb_build_object('status', 'updated', 'product', to_jsonb(v_product));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_catalog_product_classification(integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_catalog_product_classification(integer, uuid)
  TO service_role;

COMMIT;
