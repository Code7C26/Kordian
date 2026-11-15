-- Install the catalog administration RPCs without the FK changes in the
-- historical 20261108_category_subcategory_integrity.sql migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_catalog_subcategory(
  p_subcategory_id uuid,
  p_name text,
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_category_id uuid;
  v_current_category_id uuid;
  v_product_count bigint;
BEGIN
  IF nullif(btrim(p_name), '') IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_name');
  END IF;

  SELECT id
  INTO v_category_id
  FROM public.categories
  WHERE id = p_category_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'category_not_found');
  END IF;

  SELECT category_id
  INTO v_current_category_id
  FROM public.subcategories
  WHERE id = p_subcategory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_current_category_id IS DISTINCT FROM p_category_id THEN
    SELECT count(*)
    INTO v_product_count
    FROM public.products
    WHERE subcategory_id = p_subcategory_id;

    IF v_product_count > 0 THEN
      RETURN jsonb_build_object(
        'status', 'products_associated',
        'product_count', v_product_count
      );
    END IF;
  END IF;

  UPDATE public.subcategories
  SET name = btrim(p_name),
      category_id = p_category_id
  WHERE id = p_subcategory_id;

  RETURN jsonb_build_object(
    'status', 'updated',
    'subcategory', jsonb_build_object(
      'id', p_subcategory_id,
      'name', btrim(p_name),
      'category_id', p_category_id
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_catalog_subcategory(
  p_subcategory_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product_count bigint;
  v_comparable_group_count bigint;
BEGIN
  PERFORM 1
  FROM public.subcategories
  WHERE id = p_subcategory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT count(*)
  INTO v_product_count
  FROM public.products
  WHERE subcategory_id = p_subcategory_id;

  SELECT count(*)
  INTO v_comparable_group_count
  FROM public.comparable_groups
  WHERE subcategory_id = p_subcategory_id;

  IF v_product_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'products_associated',
      'product_count', v_product_count,
      'comparable_group_count', v_comparable_group_count
    );
  END IF;

  IF v_comparable_group_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'comparable_groups_associated',
      'comparable_group_count', v_comparable_group_count
    );
  END IF;

  DELETE FROM public.subcategories
  WHERE id = p_subcategory_id;

  RETURN jsonb_build_object('status', 'deleted');
END;
$function$;

REVOKE ALL ON FUNCTION public.update_catalog_subcategory(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_catalog_subcategory(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_catalog_subcategory(uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_catalog_subcategory(uuid)
  TO service_role;

COMMIT;
