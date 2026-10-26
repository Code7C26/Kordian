-- Apply the selected sort before pagination so every page follows one global order.
BEGIN;

DO $migration$
DECLARE
  function_definition text;
  old_ranked_order text := $old$CASE WHEN prm.sort_mode = 'id-asc' THEN ranked.id END ASC NULLS LAST,
      ranked.search_relevance,
      ranked.brand_sort,
      CASE WHEN prm.sort_mode = 'price-asc' THEN ranked.minimum_price END ASC NULLS LAST,
      CASE WHEN prm.sort_mode = 'price-desc' THEN ranked.minimum_price END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'discount-desc' THEN ranked.discount_percentage END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'rating-desc' THEN ranked.rating END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'name-asc' THEN lower(ranked.name) END ASC NULLS LAST,
      lower(ranked.name),
      ranked.id$old$;
  new_ranked_order text := $new$CASE WHEN prm.sort_mode = 'id-asc' THEN ranked.id END ASC NULLS LAST,
      CASE WHEN prm.sort_mode = 'price-asc' THEN ranked.minimum_price END ASC NULLS LAST,
      CASE WHEN prm.sort_mode = 'price-desc' THEN ranked.minimum_price END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'discount-desc' THEN ranked.discount_percentage END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'rating-desc' THEN ranked.rating END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'name-asc' THEN lower(ranked.name) END ASC NULLS LAST,
      ranked.search_relevance,
      ranked.brand_sort,
      lower(ranked.name),
      ranked.id$new$;
  old_page_order text := $old$CASE WHEN prm.sort_mode = 'id-asc' THEN id END ASC NULLS LAST,
    search_relevance,
    brand_sort,
    CASE WHEN prm.sort_mode = 'price-asc' THEN minimum_price END ASC NULLS LAST,
    CASE WHEN prm.sort_mode = 'price-desc' THEN minimum_price END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'discount-desc' THEN discount_percentage END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'rating-desc' THEN rating END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'name-asc' THEN lower(name) END ASC NULLS LAST,
    lower(name),
    id$old$;
  new_page_order text := $new$CASE WHEN prm.sort_mode = 'id-asc' THEN id END ASC NULLS LAST,
    CASE WHEN prm.sort_mode = 'price-asc' THEN minimum_price END ASC NULLS LAST,
    CASE WHEN prm.sort_mode = 'price-desc' THEN minimum_price END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'discount-desc' THEN discount_percentage END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'rating-desc' THEN rating END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'name-asc' THEN lower(name) END ASC NULLS LAST,
    search_relevance,
    brand_sort,
    lower(name),
    id$new$;
  old_payload_order text := $old$CASE WHEN (SELECT sort_mode FROM params) = 'id-asc' THEN page_payload.id END ASC NULLS LAST,
        page_payload.search_relevance, page_payload.brand_sort,
        CASE WHEN (SELECT sort_mode FROM params) = 'price-asc' THEN page_payload.minimum_price END ASC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'price-desc' THEN page_payload.minimum_price END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'discount-desc' THEN page_payload.discount_percentage END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'rating-desc' THEN page_payload.rating END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'name-asc' THEN lower(page_payload.name) END ASC NULLS LAST,
        lower(page_payload.name), page_payload.id$old$;
  new_payload_order text := $new$CASE WHEN (SELECT sort_mode FROM params) = 'id-asc' THEN page_payload.id END ASC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'price-asc' THEN page_payload.minimum_price END ASC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'price-desc' THEN page_payload.minimum_price END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'discount-desc' THEN page_payload.discount_percentage END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'rating-desc' THEN page_payload.rating END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'name-asc' THEN lower(page_payload.name) END ASC NULLS LAST,
        page_payload.search_relevance, page_payload.brand_sort,
        lower(page_payload.name), page_payload.id$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  IF position(new_ranked_order IN function_definition) > 0
    AND position(new_page_order IN function_definition) > 0
    AND position(new_payload_order IN function_definition) > 0 THEN
    RAISE NOTICE 'Catalog sorting already applies globally before pagination';
    RETURN;
  END IF;

  IF position(old_ranked_order IN function_definition) = 0
    OR position(old_page_order IN function_definition) = 0
    OR position(old_payload_order IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected catalog sort clauses were not found; no changes applied';
  END IF;

  function_definition := replace(function_definition, old_ranked_order, new_ranked_order);
  function_definition := replace(function_definition, old_page_order, new_page_order);
  function_definition := replace(function_definition, old_payload_order, new_payload_order);
  EXECUTE function_definition;
END;
$migration$;

COMMIT;
