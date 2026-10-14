-- Cache the ordered product IDs for one active search in the backend process.
-- The backend hydrates later pages by ID instead of rerunning catalog ranking.
DO $migration$
DECLARE
  function_definition text;
  definition_changed boolean := false;
  old_index_cte text := $old$counted AS (
  SELECT count(*)::integer AS total FROM ranked
),
page_rows AS ($old$;
  new_index_cte text := $new$counted AS (
  SELECT count(*)::integer AS total FROM ranked
),
ordered_ids AS (
  SELECT coalesce(array_agg(
    ranked.id::bigint
    ORDER BY
      CASE WHEN prm.sort_mode = 'id-asc' THEN ranked.id END ASC NULLS LAST,
      ranked.search_relevance,
      ranked.brand_sort,
      CASE WHEN prm.sort_mode = 'price-asc' THEN ranked.minimum_price END ASC NULLS LAST,
      CASE WHEN prm.sort_mode = 'price-desc' THEN ranked.minimum_price END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'discount-desc' THEN ranked.discount_percentage END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'rating-desc' THEN ranked.rating END DESC NULLS LAST,
      CASE WHEN prm.sort_mode = 'name-asc' THEN lower(ranked.name) END ASC NULLS LAST,
      lower(ranked.name),
      ranked.id
  ), '{}'::bigint[]) AS ids
  FROM ranked
  CROSS JOIN params prm
),
page_rows AS ($new$;
  old_result_fields text := $old$  'total', (SELECT total FROM counted),
  'page', (SELECT page FROM params),$old$;
  new_result_fields text := $new$  'total', (SELECT total FROM counted),
  'orderedIds', (SELECT ids FROM ordered_ids),
  'page', (SELECT page FROM params),$new$;
  old_service_limit text := 'least(greatest(coalesce(p_limit, 20), 1), CASE WHEN auth.role() = ''service_role'' THEN 20000 ELSE 100 END) AS page_limit';
  safe_page_limit text := 'least(greatest(coalesce(p_limit, 20), 1), 100) AS page_limit';
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.catalog_products_page was not found';
  END IF;

  IF position(old_service_limit IN function_definition) > 0 THEN
    function_definition := replace(function_definition, old_service_limit, safe_page_limit);
    definition_changed := true;
  ELSIF position(safe_page_limit IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected p_limit expression in catalog_products_page; no changes applied';
  END IF;

  IF position('ordered_ids AS (' IN function_definition) = 0 THEN
    IF position(old_index_cte IN function_definition) = 0
      OR position(old_result_fields IN function_definition) = 0 THEN
      RAISE EXCEPTION 'Expected catalog_products_page insertion points were not found; no changes applied';
    END IF;

    function_definition := replace(function_definition, old_index_cte, new_index_cte);
    function_definition := replace(function_definition, old_result_fields, new_result_fields);
    definition_changed := true;
  END IF;

  IF definition_changed THEN
    EXECUTE function_definition;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.catalog_products_by_ids(
  p_product_ids bigint[],
  p_rules_version text DEFAULT '2026-10-12-v5'
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
WITH
requested AS (
  SELECT DISTINCT requested.id, requested.ordinality
  FROM unnest(coalesce(p_product_ids, '{}'::bigint[])) WITH ORDINALITY AS requested(id, ordinality)
),
review_pairs AS (
  SELECT DISTINCT
    CASE
      WHEN mp.id IS NOT NULL THEN mp.id
      WHEN dp.id IS NOT NULL THEN dp.id
      ELSE least(d.mami_product_id, d.disco_product_id)
    END AS canonical_id,
    CASE
      WHEN mp.id IS NOT NULL THEN d.disco_product_id
      WHEN dp.id IS NOT NULL THEN d.mami_product_id
      ELSE greatest(d.mami_product_id, d.disco_product_id)
    END AS peer_id
  FROM public.cross_source_review_decisions d
  LEFT JOIN public.products mp ON mp.id = d.mami_product_id AND mp.source = 'mami'
  LEFT JOIN public.products dp ON dp.id = d.disco_product_id AND dp.source = 'mami'
  WHERE d.mami_product_id IS NOT NULL
    AND d.disco_product_id IS NOT NULL
    AND d.mami_product_id <> d.disco_product_id
    AND (
      d.status = 'match'
      OR (
        d.status = 'revisión'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(d.reason_codes, '[]'::jsonb)) reason(code)
          WHERE reason.code ~* '(manual|verified|approved|confirmation|confirmado|override)'
        )
      )
    )
),
offer_rows AS (
    SELECT
      offer.id,
      offer.product_id,
      offer.supermarket,
      to_jsonb(offer) AS offer_data,
      summary.normalized_price,
      CASE
        WHEN offer.supermarket IN ('Disco', 'Mami') THEN summary.price_change_percentage
        ELSE NULL
      END AS price_change_percentage
    FROM public.offers offer
    JOIN public.catalog_offer_price_summary summary ON summary.offer_id = offer.id
),
members AS (
  SELECT requested.id AS canonical_id, requested.id AS product_id
  FROM requested
  JOIN public.products canonical ON canonical.id = requested.id
  UNION
  SELECT requested.id AS canonical_id, review_pairs.peer_id AS product_id
  FROM requested
  JOIN review_pairs ON review_pairs.canonical_id = requested.id
  JOIN public.products peer ON peer.id = review_pairs.peer_id
),
grouped_offers AS (
  SELECT
    members.canonical_id,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', offer.id,
        'product_id', offer.product_id,
        'supermarket', offer.supermarket,
        'cash_price', offer.normalized_price
      ) || coalesce(offer.offer_data, '{}'::jsonb) || jsonb_build_object(
        'cash_price', offer.normalized_price,
        'price_change_percentage', offer.price_change_percentage
      ) ORDER BY offer.id
    ) FILTER (WHERE offer.id IS NOT NULL), '[]'::jsonb) AS offers,
    coalesce(jsonb_agg(jsonb_build_object(
      'offer_id', offer.id::text,
      'cash_price', offer.normalized_price
    ) ORDER BY offer.id::text) FILTER (
      WHERE offer.id IS NOT NULL AND offer.normalized_price > 0
    ), '[]'::jsonb) AS fingerprint_offers
  FROM members
  LEFT JOIN offer_rows offer ON offer.product_id = members.product_id
  GROUP BY members.canonical_id
),
peer_ids AS (
  SELECT
    members.canonical_id,
    coalesce(array_agg(DISTINCT members.product_id)
      FILTER (WHERE members.product_id <> members.canonical_id), '{}'::bigint[]) AS ids
  FROM members
  GROUP BY members.canonical_id
)
SELECT jsonb_build_object(
  'data', coalesce(jsonb_agg(
    to_jsonb(product) || jsonb_build_object(
      'offers', coalesce(grouped_offers.offers, '[]'::jsonb),
      'brands', CASE WHEN brand.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', brand.id, 'name', brand.name) END,
      'categories', CASE WHEN category.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', category.id, 'name', category.name) END,
      'subcategories', CASE WHEN subcategory.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', subcategory.id, 'name', subcategory.name) END,
      'status', CASE
        WHEN status.classification = 'PRECIO_NORMAL' THEN 'EN_PRECIO'
        WHEN status.classification IN ('AUMENTO_ATIPICO', 'SOBREPRECIO') THEN 'INFLADO'
        ELSE coalesce(status.classification, '')
      END,
      'priceStatusPending',
        status.rules_version IS DISTINCT FROM coalesce(nullif(p_rules_version, ''), '2026-10-12-v5')
        OR status.price_fingerprint IS NULL
        OR CASE
          WHEN left(ltrim(status.price_fingerprint), 1) = '{' THEN status.price_fingerprint::jsonb
          ELSE NULL::jsonb
        END IS DISTINCT FROM jsonb_build_object(
          'rules_version', coalesce(nullif(p_rules_version, ''), '2026-10-12-v5'),
          'offers', coalesce(grouped_offers.fingerprint_offers, '[]'::jsonb)
        ),
      'groupedReviewMatch', cardinality(coalesce(peer_ids.ids, '{}'::bigint[])) > 0,
      'reviewMatchedProductIds', ARRAY[product.id] || coalesce(peer_ids.ids, '{}'::bigint[])
    )
    ORDER BY requested.ordinality
  ), '[]'::jsonb)
)
FROM requested
JOIN public.products product ON product.id = requested.id
LEFT JOIN public.brands brand ON brand.id = product.brand_id
LEFT JOIN public.categories category ON category.id = product.category_id
LEFT JOIN public.subcategories subcategory ON subcategory.id = product.subcategory_id
LEFT JOIN public.product_price_status status ON status.product_id = product.id
LEFT JOIN grouped_offers ON grouped_offers.canonical_id = product.id
LEFT JOIN peer_ids ON peer_ids.canonical_id = product.id;
$function$;

REVOKE ALL ON FUNCTION public.catalog_products_by_ids(bigint[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_products_by_ids(bigint[], text) TO service_role;
