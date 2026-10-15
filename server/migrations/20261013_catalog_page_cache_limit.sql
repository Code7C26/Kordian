-- Allow the backend to fetch the complete filtered catalog in one RPC call
-- for its in-memory pagination cache, capped at 20,000 products.
DO $migration$
DECLARE
  function_definition text;
  old_page_limit text := 'least(greatest(coalesce(p_limit, 20), 1), 100) AS page_limit';
  new_page_limit text := 'least(greatest(coalesce(p_limit, 20), 1), CASE WHEN auth.role() = ''service_role'' THEN 20000 ELSE 100 END) AS page_limit';
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  IF position(new_page_limit IN function_definition) > 0 THEN
    RAISE NOTICE 'catalog_products_page already allows limits up to 20,000';
    RETURN;
  END IF;

  IF position(old_page_limit IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected page limit expression was not found in catalog_products_page; no changes applied';
  END IF;

  function_definition := replace(function_definition, old_page_limit, new_page_limit);
  EXECUTE function_definition;
END;
$migration$;
