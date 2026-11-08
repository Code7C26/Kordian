-- Remove the full matching-product ID array from the catalog page RPC.
-- Keep the existing function body and its filters, ranking, pagination and
-- product payload unchanged.
BEGIN;

DO $migration$
DECLARE
  function_definition text;
  ordered_cte_start integer;
  page_rows_start integer;
  page_rows_offset integer;
  ordered_ids_field text := $field$  'orderedIds', (SELECT ids FROM ordered_ids),
$field$;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  ordered_cte_start := strpos(function_definition, 'ordered_ids AS (');
  IF ordered_cte_start = 0 THEN
    IF strpos(function_definition, '''orderedIds''') = 0 THEN
      RAISE NOTICE 'catalog_products_page already returns only the requested page';
      RETURN;
    END IF;
    RAISE EXCEPTION 'orderedIds response field exists but its CTE was not found';
  END IF;

  page_rows_offset := strpos(
    substring(function_definition FROM ordered_cte_start),
    'page_rows AS ('
  );
  IF page_rows_offset = 0 THEN
    RAISE EXCEPTION 'page_rows CTE was not found after ordered_ids';
  END IF;
  page_rows_start := ordered_cte_start + page_rows_offset - 1;

  IF strpos(function_definition, ordered_ids_field) = 0 THEN
    RAISE EXCEPTION 'Expected orderedIds response field was not found';
  END IF;

  function_definition :=
    substring(function_definition FROM 1 FOR ordered_cte_start - 1)
    || substring(function_definition FROM page_rows_start);
  function_definition := replace(function_definition, ordered_ids_field, '');

  IF strpos(function_definition, 'ordered_ids') > 0
    OR strpos(function_definition, '''orderedIds''') > 0 THEN
    RAISE EXCEPTION 'Unexpected orderedIds reference remains in catalog_products_page';
  END IF;
  IF strpos(function_definition, 'page_rows AS (') = 0
    OR strpos(function_definition, '''total'', (SELECT total FROM counted)') = 0
    OR strpos(function_definition, '''page'', (SELECT page FROM params)') = 0
    OR strpos(function_definition, '''limit'', (SELECT page_limit FROM params)') = 0 THEN
    RAISE EXCEPTION 'Catalog page response fields are incomplete';
  END IF;

  EXECUTE function_definition;
END;
$migration$;

COMMIT;
