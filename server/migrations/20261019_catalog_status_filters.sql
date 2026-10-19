-- Keep the fast status filters usable while a stored classification is pending refresh.
DO $migration$
DECLARE
  function_definition text;
  old_filter text := $old$NOT price_status_pending AND ($old$;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  IF position(old_filter IN function_definition) > 0 THEN
    function_definition := replace(function_definition, old_filter, '');
    EXECUTE function_definition;
  ELSIF position('price_status_pending AND (' IN function_definition) > 0 THEN
    RAISE EXCEPTION 'Unexpected price-status filter in catalog_products_page; no changes applied';
  END IF;
END;
$migration$;
