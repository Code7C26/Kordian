BEGIN;

-- Merge only unambiguous products from different sources. A group is eligible
-- when it has one product per source and at most one non-empty EAN value.
CREATE TEMP TABLE product_merge_map ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    p.id,
    p.source,
    p.ean,
    regexp_replace(
      translate(upper(trim(p.name)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
      '[^A-Z0-9]+', ' ', 'g'
    ) AS product_key,
    regexp_replace(
      translate(upper(trim(COALESCE(b.name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
      '[^A-Z0-9]+', ' ', 'g'
    ) AS brand_key
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  WHERE p.source IS NOT NULL
    AND trim(p.name) <> ''
), eligible_groups AS (
  SELECT product_key, brand_key
  FROM normalized
  GROUP BY product_key, brand_key
  HAVING count(DISTINCT source) > 1
     AND count(*) = count(DISTINCT source)
     AND count(DISTINCT NULLIF(trim(ean), '')) <= 1
), mapped AS (
  SELECT
    normalized.id AS duplicate_product_id,
    min(normalized.id) OVER (PARTITION BY normalized.product_key, normalized.brand_key) AS canonical_product_id
  FROM normalized
  JOIN eligible_groups
    USING (product_key, brand_key)
)
SELECT duplicate_product_id, canonical_product_id
FROM mapped
WHERE duplicate_product_id <> canonical_product_id;

-- Capture offers that would collide with an existing canonical offer.
CREATE TEMP TABLE offer_merge_map ON COMMIT DROP AS
SELECT
  duplicate_offer.id AS duplicate_offer_id,
  canonical_offer.id AS canonical_offer_id
FROM offers duplicate_offer
JOIN product_merge_map product_map
  ON product_map.duplicate_product_id = duplicate_offer.product_id
JOIN offers canonical_offer
  ON canonical_offer.product_id = product_map.canonical_product_id
 AND lower(trim(canonical_offer.supermarket)) = lower(trim(duplicate_offer.supermarket));

-- Preserve history before deleting colliding offers.
UPDATE price_history history
SET offer_id = offer_map.canonical_offer_id
FROM offer_merge_map offer_map
WHERE history.offer_id = offer_map.duplicate_offer_id;

-- Move non-colliding offers to the canonical product.
UPDATE offers offer
SET product_id = product_map.canonical_product_id
FROM product_merge_map product_map
WHERE offer.product_id = product_map.duplicate_product_id
  AND NOT EXISTS (
    SELECT 1
    FROM offers canonical_offer
    WHERE canonical_offer.product_id = product_map.canonical_product_id
      AND lower(trim(canonical_offer.supermarket)) = lower(trim(offer.supermarket))
  );

-- Remove only offers whose supermarket already exists on the canonical product.
DELETE FROM offers offer
USING offer_merge_map offer_map
WHERE offer.id = offer_map.duplicate_offer_id;

-- Repoint product history and remove the duplicate product rows.
UPDATE price_history history
SET product_id = product_map.canonical_product_id
FROM product_merge_map product_map
WHERE history.product_id = product_map.duplicate_product_id;

DELETE FROM products product
USING product_merge_map product_map
WHERE product.id = product_map.duplicate_product_id;

COMMIT;
