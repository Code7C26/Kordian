BEGIN;

-- Persist offer normalization and the latest valid historical price change so
-- catalog pagination does not recalculate every offer's full price history.
CREATE TABLE IF NOT EXISTS catalog_offer_price_summary (
  offer_id bigint PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  normalized_price numeric NOT NULL,
  price_change_percentage numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_offer_price_summary_product_idx
  ON catalog_offer_price_summary(product_id);

ALTER TABLE catalog_offer_price_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_offer_price_summary_public_read ON catalog_offer_price_summary;
CREATE POLICY catalog_offer_price_summary_public_read ON catalog_offer_price_summary
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON catalog_offer_price_summary TO anon, authenticated;

CREATE INDEX IF NOT EXISTS catalog_price_history_offer_date_idx
  ON price_history(offer_id, observed_at, id);

CREATE OR REPLACE FUNCTION catalog_latest_offer_price_change(p_offer_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH history_raw AS MATERIALIZED (
  SELECT
    ph.observed_at,
    ph.id,
    ph.source,
    CASE WHEN lower(btrim(coalesce(p.source, ''))) IN ('disco', 'mami') AND ph.cash_price < 100
      THEN round(ph.cash_price * 100, 2) ELSE ph.cash_price END AS price,
    floor(ln(
      CASE WHEN lower(btrim(coalesce(p.source, ''))) IN ('disco', 'mami') AND ph.cash_price < 100
        THEN round(ph.cash_price * 100, 2) ELSE ph.cash_price END
    ) / ln(100))::integer AS price_bucket
  FROM price_history ph
  JOIN offers o ON o.id = ph.offer_id
  JOIN products p ON p.id = o.product_id
  WHERE ph.offer_id = p_offer_id
    AND ph.cash_price > 0
    AND ph.source <> 'price_token_normalization'
),
history_valid AS (
  SELECT current_point.*
  FROM history_raw current_point
  WHERE NOT EXISTS (
    SELECT 1
    FROM history_raw neighbor
    WHERE neighbor.id <> current_point.id
      AND neighbor.price_bucket BETWEEN current_point.price_bucket - 2 AND current_point.price_bucket + 2
      AND (
        abs(current_point.price / neighbor.price - 100) < 0.01
        OR abs(current_point.price / neighbor.price - 0.01) < 0.000001
      )
  )
),
history_ordered AS (
  SELECT
    history_valid.*,
    lag(price) OVER (ORDER BY observed_at, id) AS previous_price,
    row_number() OVER (ORDER BY observed_at DESC, id DESC) AS latest_rank
  FROM history_valid
)
SELECT CASE
  WHEN source IN ('disco_public_search', 'disco_sync', 'mami_import', 'mami_sync')
    AND previous_price > 0
    AND price <> previous_price
  THEN round(((price - previous_price) / previous_price) * 100, 2)
  ELSE NULL
END
FROM history_ordered
WHERE latest_rank = 1;
$function$;

CREATE OR REPLACE FUNCTION refresh_catalog_offer_price_summary(p_offer_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO catalog_offer_price_summary (
    offer_id, product_id, normalized_price, price_change_percentage, updated_at
  )
  SELECT
    o.id,
    o.product_id,
    CASE WHEN lower(btrim(coalesce(p.source, ''))) IN ('disco', 'mami') AND o.cash_price < 100
      THEN round(o.cash_price * 100, 2) ELSE o.cash_price END,
    catalog_latest_offer_price_change(o.id),
    now()
  FROM offers o
  JOIN products p ON p.id = o.product_id
  WHERE o.id = p_offer_id
  ON CONFLICT (offer_id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    normalized_price = EXCLUDED.normalized_price,
    price_change_percentage = EXCLUDED.price_change_percentage,
    updated_at = EXCLUDED.updated_at;

  IF NOT FOUND THEN
    DELETE FROM catalog_offer_price_summary WHERE offer_id = p_offer_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION refresh_catalog_offer_price_summary_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  affected_offer_id bigint;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    FOR affected_offer_id IN
      SELECT id FROM offers WHERE product_id = NEW.id
    LOOP
      PERFORM refresh_catalog_offer_price_summary(affected_offer_id);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'price_history' THEN
    IF TG_OP = 'DELETE' THEN
      PERFORM refresh_catalog_offer_price_summary(OLD.offer_id);
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.offer_id IS DISTINCT FROM NEW.offer_id THEN
      PERFORM refresh_catalog_offer_price_summary(OLD.offer_id);
    END IF;
    PERFORM refresh_catalog_offer_price_summary(NEW.offer_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_catalog_offer_price_summary(OLD.id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
    PERFORM refresh_catalog_offer_price_summary(OLD.id);
  END IF;
  PERFORM refresh_catalog_offer_price_summary(NEW.id);

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION catalog_latest_offer_price_change(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION refresh_catalog_offer_price_summary(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION refresh_catalog_offer_price_summary_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_latest_offer_price_change(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_catalog_offer_price_summary(bigint) TO service_role;

DO $backfill$
DECLARE
  offer_row record;
BEGIN
  FOR offer_row IN SELECT id FROM offers ORDER BY id LOOP
    PERFORM refresh_catalog_offer_price_summary(offer_row.id);
  END LOOP;
END;
$backfill$;

DROP TRIGGER IF EXISTS catalog_offer_price_summary_offer_insert ON offers;
CREATE TRIGGER catalog_offer_price_summary_offer_insert
AFTER INSERT ON offers
FOR EACH ROW EXECUTE FUNCTION refresh_catalog_offer_price_summary_trigger();

DROP TRIGGER IF EXISTS catalog_offer_price_summary_offer_update ON offers;
CREATE TRIGGER catalog_offer_price_summary_offer_update
AFTER UPDATE OF product_id, cash_price, supermarket ON offers
FOR EACH ROW EXECUTE FUNCTION refresh_catalog_offer_price_summary_trigger();

DROP TRIGGER IF EXISTS catalog_offer_price_summary_offer_delete ON offers;
CREATE TRIGGER catalog_offer_price_summary_offer_delete
AFTER DELETE ON offers
FOR EACH ROW EXECUTE FUNCTION refresh_catalog_offer_price_summary_trigger();

DROP TRIGGER IF EXISTS catalog_offer_price_summary_history_insert ON price_history;
CREATE TRIGGER catalog_offer_price_summary_history_insert
AFTER INSERT ON price_history
FOR EACH ROW EXECUTE FUNCTION refresh_catalog_offer_price_summary_trigger();

DROP TRIGGER IF EXISTS catalog_offer_price_summary_history_update ON price_history;
CREATE TRIGGER catalog_offer_price_summary_history_update
AFTER UPDATE OF offer_id, observed_at, cash_price, source ON price_history
FOR EACH ROW EXECUTE FUNCTION refresh_catalog_offer_price_summary_trigger();

DROP TRIGGER IF EXISTS catalog_offer_price_summary_history_delete ON price_history;
CREATE TRIGGER catalog_offer_price_summary_history_delete
AFTER DELETE ON price_history
FOR EACH ROW EXECUTE FUNCTION refresh_catalog_offer_price_summary_trigger();

DROP TRIGGER IF EXISTS catalog_offer_price_summary_product_source ON products;
CREATE TRIGGER catalog_offer_price_summary_product_source
AFTER UPDATE OF source ON products
FOR EACH ROW
WHEN (OLD.source IS DISTINCT FROM NEW.source)
EXECUTE FUNCTION refresh_catalog_offer_price_summary_trigger();

CREATE OR REPLACE FUNCTION catalog_products_page(
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_search text DEFAULT '',
  p_category text DEFAULT '',
  p_subcategory text DEFAULT '',
  p_supermarket text DEFAULT '',
  p_price_status text DEFAULT 'todos',
  p_sort text DEFAULT 'discount-desc',
  p_max_price numeric DEFAULT 1000000,
  p_favorites_only boolean DEFAULT false,
  p_favorite_ids bigint[] DEFAULT '{}',
  p_rules_version text DEFAULT '2026-10-12-v5',
  p_brand text DEFAULT '',
  p_valid_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
WITH
params AS (
  SELECT
    least(greatest(coalesce(p_page, 1), 1), 20000000) AS page,
    least(greatest(coalesce(p_limit, 20), 1), 100) AS page_limit,
    nullif(btrim(coalesce(p_search, '')), '') AS search_text,
    nullif(btrim(coalesce(p_category, '')), '') AS category_id,
    nullif(btrim(coalesce(p_subcategory, '')), '') AS subcategory_id,
    nullif(btrim(coalesce(p_brand, '')), '') AS brand_id,
    nullif(btrim(coalesce(p_supermarket, '')), '') AS supermarket,
    coalesce(nullif(p_price_status, ''), 'todos') AS price_status,
    coalesce(nullif(p_sort, ''), 'discount-desc') AS sort_mode,
    coalesce(p_max_price, 1000000) AS max_price,
    coalesce(p_favorites_only, false) AS favorites_only,
    coalesce(p_favorite_ids, '{}'::bigint[]) AS favorite_ids,
    coalesce(p_valid_only, false) AS valid_only,
    coalesce(nullif(p_rules_version, ''), '2026-10-12-v5')::text AS rules_version
),
offer_rows AS (
  SELECT
    o.id,
    o.product_id,
    o.supermarket,
    o.cash_price,
    to_jsonb(o) AS offer_data,
    summary.normalized_price,
    CASE
      WHEN o.supermarket IN ('Disco', 'Mami') THEN summary.price_change_percentage
      ELSE NULL
    END AS price_change_percentage
  FROM offers o
  JOIN products p ON p.id = o.product_id
  JOIN catalog_offer_price_summary summary ON summary.offer_id = o.id
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
  FROM cross_source_review_decisions d
  LEFT JOIN products mp ON mp.id = d.mami_product_id AND mp.source = 'mami'
  LEFT JOIN products dp ON dp.id = d.disco_product_id AND dp.source = 'mami'
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
filtered_products AS (
  SELECT p.*
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
  CROSS JOIN params prm
  WHERE (prm.category_id IS NULL OR p.category_id::text = prm.category_id)
    AND (prm.subcategory_id IS NULL OR p.subcategory_id::text = prm.subcategory_id)
    AND (prm.brand_id IS NULL OR p.brand_id::text = prm.brand_id)
    AND (
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
    )
    AND (
      prm.supermarket IS NULL
      OR EXISTS (
        SELECT 1 FROM offer_rows matching_offer
        WHERE matching_offer.product_id = p.id
          AND matching_offer.supermarket = prm.supermarket
      )
    )
    AND (
      NOT prm.valid_only
      OR (
        EXISTS (
          SELECT 1 FROM offer_rows o
          WHERE o.product_id = p.id
            AND o.normalized_price > 0
            AND nullif(btrim(coalesce(o.supermarket, '')), '') IS NOT NULL
        )
        AND nullif(btrim(coalesce(p.name, '')), '') IS NOT NULL
        AND p.name !~* '\m(env[ií]os?|entrega|delivery|shipping|oferta|promoci[oó]n(es)?)\M'
        AND (
          (
            nullif(btrim(p.image), '') IS NOT NULL
            AND lower(btrim(p.image)) NOT IN ('null', 'undefined')
            AND p.image !~* '(no[-_ ]?product[-_ ]?image|placeholder|sin[-_ ]?imagen|default[-_ ]?product|hero\.(png|jpe?g|webp))'
          )
          OR p.name ~* '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|kgs|kilos?|g|gr|gramos?|mg|l|lt|lts|litros?|ml|cc|cl|unidades?|un|uds?|u)\M'
        )
      )
    )
),
reviewed_peers AS MATERIALIZED (
  SELECT DISTINCT rp.peer_id
  FROM review_pairs rp
  JOIN filtered_products canonical ON canonical.id = rp.canonical_id
),
effective_products AS (
  SELECT fp.*
  FROM filtered_products fp
  WHERE NOT EXISTS (
    SELECT 1
    FROM reviewed_peers rp
    WHERE rp.peer_id = fp.id
  )
),
members AS (
  SELECT ep.id AS canonical_id, ep.id AS product_id
  FROM effective_products ep
  UNION
  SELECT ep.id AS canonical_id, rp.peer_id AS product_id
  FROM effective_products ep
  JOIN review_pairs rp ON rp.canonical_id = ep.id
  JOIN products peer ON peer.id = rp.peer_id
),
catalog_rows AS (
  SELECT
    ep.id,
    ep.name,
    ep.brand_id,
    ep.category_id,
    ep.subcategory_id,
    ep.rating,
    ep.image,
    ep.source,
    ep.source_product_id,
    ep.source_sku,
    ep.ean,
    ep.source_url,
    ep.source_category,
    ep.source_subcategory,
    ep.classification_source,
    ep.classification_confidence,
    b.id AS brand_join_id,
    b.name AS brand_name,
    c.id AS category_join_id,
    c.name AS category_name,
    sc.id AS subcategory_join_id,
    sc.name AS subcategory_name,
    coalesce(array_agg(DISTINCT members.product_id) FILTER (WHERE members.product_id <> ep.id), '{}'::bigint[]) AS peer_ids,
    coalesce(jsonb_agg(jsonb_build_object(
      'offer_id', offer.id::text,
      'cash_price', offer.normalized_price
    ) ORDER BY offer.id::text) FILTER (WHERE offer.normalized_price > 0), '[]'::jsonb) AS fingerprint_offers,
    min(offer.normalized_price) FILTER (WHERE offer.normalized_price > 0) AS minimum_price,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY offer.normalized_price)
      FILTER (WHERE offer.normalized_price > 0) AS median_price,
    greatest(
      coalesce(max(-offer.price_change_percentage)
        FILTER (WHERE offer.price_change_percentage < 0), 0),
      coalesce(max(0), 0)
    ) AS store_reduction,
    greatest(
      coalesce(
        CASE WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY offer.normalized_price)
          FILTER (WHERE offer.normalized_price > 0) > 0
          THEN abs(least(0,
            ((min(offer.normalized_price) FILTER (WHERE offer.normalized_price > 0)
              - percentile_cont(0.5) WITHIN GROUP (ORDER BY offer.normalized_price)
                FILTER (WHERE offer.normalized_price > 0))
             / percentile_cont(0.5) WITHIN GROUP (ORDER BY offer.normalized_price)
               FILTER (WHERE offer.normalized_price > 0)) * 100
          ))
          ELSE 0
        END,
        0
      ),
      coalesce(max(-offer.price_change_percentage)
        FILTER (WHERE offer.price_change_percentage < 0), 0)
    ) AS discount_percentage,
    bool_or(offer.id IS NOT NULL) AS has_valid_offer,
    coalesce(status.classification, '') AS stored_classification,
    status.rules_version AS stored_rules_version,
    status.price_fingerprint AS stored_fingerprint,
    prm.rules_version
  FROM effective_products ep
  JOIN members ON members.canonical_id = ep.id
  LEFT JOIN offer_rows offer ON offer.product_id = members.product_id
  LEFT JOIN brands b ON b.id = ep.brand_id
  LEFT JOIN categories c ON c.id = ep.category_id
  LEFT JOIN subcategories sc ON sc.id = ep.subcategory_id
  LEFT JOIN product_price_status status ON status.product_id = ep.id
  CROSS JOIN params prm
  GROUP BY
    ep.id, ep.name, ep.brand_id, ep.category_id, ep.subcategory_id, ep.rating,
    ep.image, ep.source, ep.source_product_id, ep.source_sku, ep.ean, ep.source_url,
    ep.source_category, ep.source_subcategory, ep.classification_source, ep.classification_confidence,
    b.id, c.id, sc.id, status.classification, status.rules_version, status.price_fingerprint, prm.rules_version
),
with_fingerprint AS (
  SELECT
    catalog_rows.*,
    jsonb_build_object(
      'rules_version', rules_version,
      'offers', fingerprint_offers
    ) AS expected_fingerprint
  FROM catalog_rows
),
classified AS (
  SELECT
    with_fingerprint.*,
    CASE
      WHEN stored_rules_version IS DISTINCT FROM rules_version
        OR stored_fingerprint IS NULL
        OR CASE
          WHEN left(ltrim(stored_fingerprint), 1) = '{' THEN stored_fingerprint::jsonb
          ELSE NULL::jsonb
        END IS DISTINCT FROM expected_fingerprint
      THEN true ELSE false
    END AS price_status_pending,
    CASE
      WHEN stored_classification IN ('PRECIO_NORMAL') THEN 'EN_PRECIO'
      WHEN stored_classification IN ('AUMENTO_ATIPICO', 'SOBREPRECIO') THEN 'INFLADO'
      ELSE stored_classification
    END AS visible_status,
    CASE WHEN median_price > 0 THEN ((minimum_price - median_price) / median_price) * 100 ELSE 0 END AS market_difference
  FROM with_fingerprint
),
final_candidates AS (
  SELECT classified.*
  FROM classified
  CROSS JOIN params prm
  WHERE (NOT prm.valid_only OR coalesce(minimum_price <= prm.max_price, false))
    AND (
      NOT prm.favorites_only
      OR id = ANY(prm.favorite_ids)
    )
    AND (
      prm.price_status = 'todos'
      OR (
        NOT price_status_pending
        AND (
          (prm.price_status = 'OFERTA' AND visible_status = 'OFERTA')
          OR (prm.price_status = 'EN_PRECIO' AND visible_status = 'EN_PRECIO')
          OR (prm.price_status = 'INFLADO' AND visible_status = 'INFLADO')
        )
      )
    )
),
ranked AS (
  SELECT
    final_candidates.id,
    final_candidates.name,
    final_candidates.brand_join_id,
    final_candidates.brand_name,
    final_candidates.category_join_id,
    final_candidates.category_name,
    final_candidates.subcategory_join_id,
    final_candidates.subcategory_name,
    final_candidates.peer_ids,
    final_candidates.minimum_price,
    final_candidates.discount_percentage,
    final_candidates.rating,
    final_candidates.visible_status,
    final_candidates.price_status_pending,
    CASE WHEN search_text IS NULL THEN 0 ELSE least(
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
    ) END AS search_relevance,
    lower(coalesce(nullif(final_candidates.brand_name, ''), final_candidates.name, '')) AS brand_sort
  FROM final_candidates
  CROSS JOIN params
),
counted AS (
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
page_rows AS (
  SELECT ranked.*
  FROM ranked
  CROSS JOIN params prm
  ORDER BY
    CASE WHEN prm.sort_mode = 'id-asc' THEN id END ASC NULLS LAST,
    search_relevance,
    brand_sort,
    CASE WHEN prm.sort_mode = 'price-asc' THEN minimum_price END ASC NULLS LAST,
    CASE WHEN prm.sort_mode = 'price-desc' THEN minimum_price END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'discount-desc' THEN discount_percentage END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'rating-desc' THEN rating END DESC NULLS LAST,
    CASE WHEN prm.sort_mode = 'name-asc' THEN lower(name) END ASC NULLS LAST,
    lower(name),
    id
  OFFSET ((SELECT page - 1 FROM params) * (SELECT page_limit FROM params))
  LIMIT (SELECT page_limit FROM params)
),
page_payload AS (
  SELECT
    page_rows.*,
    to_jsonb(ep) AS product_data,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', offer.id,
          'product_id', offer.product_id,
          'supermarket', offer.supermarket,
          'cash_price', offer.normalized_price
        ) || coalesce(offer.offer_data, '{}'::jsonb) || jsonb_build_object(
          'cash_price', offer.normalized_price,
          'price_change_percentage', offer.price_change_percentage
        ) ORDER BY offer.id
      )
      FROM members
      JOIN offer_rows offer ON offer.product_id = members.product_id
      WHERE members.canonical_id = page_rows.id
    ), '[]'::jsonb) AS offers
  FROM page_rows
  JOIN effective_products ep ON ep.id = page_rows.id
)
SELECT jsonb_build_object(
  'data', coalesce((
    SELECT jsonb_agg(
      page_payload.product_data || jsonb_build_object(
        'offers', page_payload.offers,
        'brands', CASE WHEN page_payload.brand_join_id IS NULL THEN NULL
          ELSE jsonb_build_object('id', page_payload.brand_join_id, 'name', page_payload.brand_name) END,
        'categories', CASE WHEN page_payload.category_join_id IS NULL THEN NULL
          ELSE jsonb_build_object('id', page_payload.category_join_id, 'name', page_payload.category_name) END,
        'subcategories', CASE WHEN page_payload.subcategory_join_id IS NULL THEN NULL
          ELSE jsonb_build_object('id', page_payload.subcategory_join_id, 'name', page_payload.subcategory_name) END,
        'status', page_payload.visible_status,
        'priceStatusPending', page_payload.price_status_pending,
        'groupedReviewMatch', cardinality(page_payload.peer_ids) > 0,
        'reviewMatchedProductIds', ARRAY[page_payload.id] || page_payload.peer_ids
      )
      ORDER BY CASE WHEN (SELECT sort_mode FROM params) = 'id-asc' THEN page_payload.id END ASC NULLS LAST,
        page_payload.search_relevance, page_payload.brand_sort,
        CASE WHEN (SELECT sort_mode FROM params) = 'price-asc' THEN page_payload.minimum_price END ASC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'price-desc' THEN page_payload.minimum_price END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'discount-desc' THEN page_payload.discount_percentage END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'rating-desc' THEN page_payload.rating END DESC NULLS LAST,
        CASE WHEN (SELECT sort_mode FROM params) = 'name-asc' THEN lower(page_payload.name) END ASC NULLS LAST,
        lower(page_payload.name), page_payload.id
    )
    FROM page_payload
  ), '[]'::jsonb),
  'total', (SELECT total FROM counted),
  'orderedIds', (SELECT ids FROM ordered_ids),
  'page', (SELECT page FROM params),
  'limit', (SELECT page_limit FROM params)
);
$function$;

CREATE OR REPLACE FUNCTION catalog_products_by_ids(
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
  FROM cross_source_review_decisions d
  LEFT JOIN products mp ON mp.id = d.mami_product_id AND mp.source = 'mami'
  LEFT JOIN products dp ON dp.id = d.disco_product_id AND dp.source = 'mami'
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
    FROM offers offer
    JOIN catalog_offer_price_summary summary ON summary.offer_id = offer.id
),
members AS (
  SELECT requested.id AS canonical_id, requested.id AS product_id
  FROM requested
  JOIN products canonical ON canonical.id = requested.id
  UNION
  SELECT requested.id AS canonical_id, review_pairs.peer_id AS product_id
  FROM requested
  JOIN review_pairs ON review_pairs.canonical_id = requested.id
  JOIN products peer ON peer.id = review_pairs.peer_id
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
JOIN products product ON product.id = requested.id
LEFT JOIN brands brand ON brand.id = product.brand_id
LEFT JOIN categories category ON category.id = product.category_id
LEFT JOIN subcategories subcategory ON subcategory.id = product.subcategory_id
LEFT JOIN product_price_status status ON status.product_id = product.id
LEFT JOIN grouped_offers ON grouped_offers.canonical_id = product.id
LEFT JOIN peer_ids ON peer_ids.canonical_id = product.id;
$function$;

CREATE OR REPLACE FUNCTION catalog_taxonomy_counts()
RETURNS TABLE(category_id uuid, subcategory_id uuid, product_count bigint)
LANGUAGE sql
STABLE
AS $function$
  SELECT p.category_id, p.subcategory_id, count(DISTINCT p.id)
  FROM products p
  WHERE EXISTS (
    SELECT 1 FROM offers o
    WHERE o.product_id = p.id
      AND o.cash_price > 0
      AND nullif(btrim(coalesce(o.supermarket, '')), '') IS NOT NULL
  )
  GROUP BY p.category_id, p.subcategory_id;
$function$;

CREATE INDEX IF NOT EXISTS catalog_offers_product_idx ON offers(product_id);
CREATE INDEX IF NOT EXISTS catalog_offers_store_product_idx ON offers(supermarket, product_id);
CREATE INDEX IF NOT EXISTS catalog_price_history_offer_date_idx ON price_history(offer_id, observed_at, id);
CREATE INDEX IF NOT EXISTS catalog_products_category_subcategory_idx ON products(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS catalog_review_decision_product_ids_idx
  ON cross_source_review_decisions(mami_product_id, disco_product_id);

GRANT EXECUTE ON FUNCTION catalog_products_page(integer, integer, text, text, text, text, text, text, numeric, boolean, bigint[], text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_products_by_ids(bigint[], text) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_taxonomy_counts() TO anon, authenticated;

COMMIT;
