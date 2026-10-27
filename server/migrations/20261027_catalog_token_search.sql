-- Match every search word independently so product names can contain words in any order.
DO $migration$
DECLARE
  function_definition text;
  old_search_params text := $old$    nullif(btrim(coalesce(p_search, '')), '') AS search_text,
    nullif(btrim(coalesce(p_category, '')), '') AS category_id,$old$;
  new_search_params text := $new$    nullif(btrim(coalesce(p_search, '')), '') AS search_text,
    coalesce(regexp_split_to_array(nullif(btrim(coalesce(p_search, '')), ''), '\s+'), '{}'::text[]) AS search_terms,
    nullif(btrim(coalesce(p_category, '')), '') AS category_id,$new$;
  old_search_filter text := $old$    AND (
      prm.search_text IS NULL
      OR p.name ILIKE '%' || prm.search_text || '%'
      OR b.name ILIKE '%' || prm.search_text || '%'
      OR c.name ILIKE '%' || prm.search_text || '%'
      OR sc.name ILIKE '%' || prm.search_text || '%'
      OR EXISTS (
        SELECT 1 FROM offer_rows search_offer
        WHERE search_offer.product_id = p.id
          AND search_offer.supermarket ILIKE '%' || prm.search_text || '%'
      )
    )$old$;
  new_search_filter text := $new$    AND (
      prm.search_text IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(prm.search_terms) AS search_term(term)
        WHERE search_term.term <> ''
          AND NOT (
            coalesce(p.name, '') ILIKE '%' || search_term.term || '%'
            OR coalesce(b.name, '') ILIKE '%' || search_term.term || '%'
            OR coalesce(c.name, '') ILIKE '%' || search_term.term || '%'
            OR coalesce(sc.name, '') ILIKE '%' || search_term.term || '%'
            OR EXISTS (
              SELECT 1
              FROM offer_rows search_offer
              WHERE search_offer.product_id = p.id
                AND search_offer.supermarket ILIKE '%' || search_term.term || '%'
            )
          )
      )
    )$new$;
  old_search_rank text := $old$    CASE WHEN search_text IS NULL THEN 0 ELSE least(
      CASE
        WHEN final_candidates.name ILIKE search_text THEN 0
        WHEN final_candidates.name ILIKE search_text || '%' THEN 1
        WHEN final_candidates.name ILIKE '% ' || search_text || '%' THEN 2
        WHEN final_candidates.name ILIKE '%' || search_text || '%' THEN 3
        ELSE 100
      END,
      CASE
        WHEN final_candidates.brand_name ILIKE search_text THEN 20
        WHEN final_candidates.brand_name ILIKE search_text || '%' THEN 21
        WHEN final_candidates.brand_name ILIKE '% ' || search_text || '%' THEN 22
        WHEN final_candidates.brand_name ILIKE '%' || search_text || '%' THEN 23
        ELSE 100
      END,
      CASE
        WHEN final_candidates.subcategory_name ILIKE search_text THEN 30
        WHEN final_candidates.subcategory_name ILIKE search_text || '%' THEN 31
        WHEN final_candidates.subcategory_name ILIKE '% ' || search_text || '%' THEN 32
        WHEN final_candidates.subcategory_name ILIKE '%' || search_text || '%' THEN 33
        ELSE 100
      END
    ) END AS search_relevance,$old$;
  new_search_rank text := $new$    CASE WHEN search_text IS NULL THEN 0 ELSE
      CASE
        WHEN final_candidates.name ILIKE search_text THEN 0
        WHEN final_candidates.name ILIKE search_text || '%' THEN 1
        WHEN NOT EXISTS (
          SELECT 1
          FROM unnest(search_terms) AS search_term(term)
          WHERE search_term.term <> ''
            AND coalesce(final_candidates.name, '') NOT ILIKE '%' || search_term.term || '%'
        ) THEN 2
        WHEN NOT EXISTS (
          SELECT 1
          FROM unnest(search_terms) AS search_term(term)
          WHERE search_term.term <> ''
            AND coalesce(final_candidates.name, '') NOT ILIKE '%' || search_term.term || '%'
            AND coalesce(final_candidates.brand_name, '') NOT ILIKE '%' || search_term.term || '%'
            AND coalesce(final_candidates.subcategory_name, '') NOT ILIKE '%' || search_term.term || '%'
        ) THEN 3
        ELSE 4
      END
    END AS search_relevance,$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  IF position(new_search_params IN function_definition) > 0
    AND position(new_search_filter IN function_definition) > 0
    AND position(new_search_rank IN function_definition) > 0 THEN
    RAISE NOTICE 'Catalog token search is already enabled';
    RETURN;
  END IF;

  IF position(old_search_params IN function_definition) = 0
    OR position(old_search_filter IN function_definition) = 0
    OR position(old_search_rank IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected catalog search clauses were not found; no changes applied';
  END IF;

  function_definition := replace(function_definition, old_search_params, new_search_params);
  function_definition := replace(function_definition, old_search_filter, new_search_filter);
  function_definition := replace(function_definition, old_search_rank, new_search_rank);
  EXECUTE function_definition;
END;
$migration$;
