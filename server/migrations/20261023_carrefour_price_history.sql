BEGIN;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS list_price numeric;

DO $migration$
DECLARE
  function_definition text;
  previous_stores text := $old$IN ('Disco', 'Mami')$old$;
  carrefour_stores text := $new$IN ('Disco', 'Mami', 'Carrefour')$new$;
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)',
    'public.catalog_products_by_ids(bigint[], text)'
  ]
  LOOP
    SELECT pg_get_functiondef(function_signature::regprocedure) INTO function_definition;
    IF function_definition IS NULL THEN
      RAISE EXCEPTION 'Function % was not found', function_signature;
    END IF;
    IF position(previous_stores IN function_definition) > 0 THEN
      function_definition := replace(function_definition, previous_stores, carrefour_stores);
      EXECUTE function_definition;
    ELSIF position(carrefour_stores IN function_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected supermarket list in %; migration made no changes', function_signature;
    END IF;
  END LOOP;
END;
$migration$;

COMMIT;
