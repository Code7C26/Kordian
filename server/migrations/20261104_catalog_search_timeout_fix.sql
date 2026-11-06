-- Search the base offers table so each product lookup can use its product_id index.
BEGIN;

DO $migration$
DECLARE
  function_definition text;
  old_offer_search text := $old$              FROM offer_rows search_offer
              WHERE search_offer.product_id = p.id
                AND search_offer.supermarket ILIKE '%' || search_term.term || '%'$old$;
  new_offer_search text := $new$              FROM public.offers search_offer
              WHERE search_offer.product_id = p.id
                AND search_offer.supermarket ILIKE '%' || search_term.term || '%'$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  IF position(new_offer_search IN function_definition) > 0 THEN
    RAISE NOTICE 'Catalog search offer lookup is already optimized';
    RETURN;
  END IF;

  IF position(old_offer_search IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected token-search offer lookup was not found; no changes applied';
  END IF;

  function_definition := replace(function_definition, old_offer_search, new_offer_search);
  EXECUTE function_definition;
END;
$migration$;

COMMIT;
