DO $migration$
DECLARE
  function_oid regprocedure;
  function_definition text;
  old_page_check_pattern text := btrim($pattern$
WHEN[[:space:]]+left\(ltrim\(stored_fingerprint\),[[:space:]]*1\)[[:space:]]*=[[:space:]]*'[{]'[[:space:]]+THEN[[:space:]]+stored_fingerprint::jsonb[[:space:]]+ELSE[[:space:]]+NULL::jsonb[[:space:]]+END[[:space:]]+IS[[:space:]]+DISTINCT[[:space:]]+FROM[[:space:]]+expected_fingerprint
$pattern$, E' \t\n\r');
  new_page_check text := $new$
WHEN left(ltrim(stored_fingerprint), 1) = '{' THEN
        (
          (stored_fingerprint::jsonb -> 'rules_version') IS DISTINCT FROM (expected_fingerprint -> 'rules_version')
          OR (stored_fingerprint::jsonb -> 'offers') IS DISTINCT FROM (expected_fingerprint -> 'offers')
        )
      ELSE true
    END
$new$;
  new_page_check_pattern text := btrim($pattern$
WHEN[[:space:]]+left\(ltrim\(stored_fingerprint\),[[:space:]]*1\)[[:space:]]*=[[:space:]]*'[{]'[[:space:]]+THEN[[:space:]]*\([[:space:]]*\(stored_fingerprint::jsonb[[:space:]]*->[[:space:]]*'rules_version'\)[[:space:]]+IS DISTINCT FROM[[:space:]]*\(expected_fingerprint[[:space:]]*->[[:space:]]*'rules_version'\)[[:space:]]+OR[[:space:]]*\(stored_fingerprint::jsonb[[:space:]]*->[[:space:]]*'offers'\)[[:space:]]+IS DISTINCT FROM[[:space:]]*\(expected_fingerprint[[:space:]]*->[[:space:]]*'offers'\)[[:space:]]*\)[[:space:]]+ELSE[[:space:]]+true[[:space:]]+END
$pattern$, E' \t\n\r');
  old_ids_check_pattern text := btrim($pattern$
WHEN[[:space:]]+left\(ltrim\(status\.price_fingerprint\),[[:space:]]*1\)[[:space:]]*=[[:space:]]*'[{]'[[:space:]]+THEN[[:space:]]+status\.price_fingerprint::jsonb[[:space:]]+ELSE[[:space:]]+NULL::jsonb[[:space:]]+END[[:space:]]+IS[[:space:]]+DISTINCT[[:space:]]+FROM[[:space:]]+jsonb_build_object\([[:space:]]*'rules_version',[[:space:]]*coalesce\(nullif\(p_rules_version,[[:space:]]*''\),[[:space:]]*'2026-10-12-v5'\),[[:space:]]*'offers',[[:space:]]*coalesce\(grouped_offers\.fingerprint_offers,[[:space:]]*'\[\]'::jsonb\)[[:space:]]*\)
$pattern$, E' \t\n\r');
  new_ids_check text := $new$
WHEN left(ltrim(status.price_fingerprint), 1) = '{' THEN
             (
               (status.price_fingerprint::jsonb -> 'rules_version')
                 IS DISTINCT FROM to_jsonb(coalesce(nullif(p_rules_version, ''), '2026-10-12-v5'))
               OR (status.price_fingerprint::jsonb -> 'offers')
                 IS DISTINCT FROM coalesce(grouped_offers.fingerprint_offers, '[]'::jsonb)
             )
           ELSE true
         END
$new$;
  new_ids_check_pattern text := btrim($pattern$
WHEN[[:space:]]+left\(ltrim\(status\.price_fingerprint\),[[:space:]]*1\)[[:space:]]*=[[:space:]]*'[{]'[[:space:]]+THEN[[:space:]]*\([[:space:]]*\(status\.price_fingerprint::jsonb[[:space:]]*->[[:space:]]*'rules_version'\)[[:space:]]+IS DISTINCT FROM[[:space:]]+to_jsonb\(coalesce\(nullif\(p_rules_version,[[:space:]]*''\),[[:space:]]*'2026-10-12-v5'\)\)[[:space:]]+OR[[:space:]]*\(status\.price_fingerprint::jsonb[[:space:]]*->[[:space:]]*'offers'\)[[:space:]]+IS DISTINCT FROM[[:space:]]+coalesce\(grouped_offers\.fingerprint_offers,[[:space:]]*'\[\]'::jsonb\)[[:space:]]*\)[[:space:]]+ELSE[[:space:]]+true[[:space:]]+END
$pattern$, E' \t\n\r');
BEGIN
  function_oid := to_regprocedure(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  SELECT pg_get_functiondef(function_oid) INTO function_definition;
  IF function_definition ~* old_page_check_pattern THEN
    function_definition := regexp_replace(function_definition, old_page_check_pattern, new_page_check, 'i');
    IF function_definition !~* new_page_check_pattern THEN
      RAISE EXCEPTION 'Could not verify updated fingerprint check in public.catalog_products_page; no changes applied';
    END IF;
    EXECUTE function_definition;
  ELSIF function_definition !~* new_page_check_pattern THEN
    RAISE EXCEPTION 'Unexpected fingerprint check in public.catalog_products_page; no changes applied';
  END IF;

  function_oid := to_regprocedure('public.catalog_products_by_ids(bigint[], text)');
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_by_ids was not found';
  END IF;

  SELECT pg_get_functiondef(function_oid) INTO function_definition;
  IF function_definition ~* old_ids_check_pattern THEN
    function_definition := regexp_replace(function_definition, old_ids_check_pattern, new_ids_check, 'i');
    IF function_definition !~* new_ids_check_pattern THEN
      RAISE EXCEPTION 'Could not verify updated fingerprint check in public.catalog_products_by_ids; no changes applied';
    END IF;
    EXECUTE function_definition;
  ELSIF function_definition !~* new_ids_check_pattern THEN
    RAISE EXCEPTION 'Unexpected fingerprint check in public.catalog_products_by_ids; no changes applied';
  END IF;
END;
$migration$;
