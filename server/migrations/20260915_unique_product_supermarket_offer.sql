BEGIN;

-- Keep the oldest offer for each product/supermarket pair and point history
-- rows at it before removing duplicate offer rows.
WITH ranked AS (
  SELECT
    id,
    product_id,
    supermarket,
    FIRST_VALUE(id) OVER (
      PARTITION BY product_id, supermarket
      ORDER BY id
    ) AS canonical_id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, supermarket
      ORDER BY id
    ) AS row_number
  FROM offers
  WHERE product_id IS NOT NULL
    AND supermarket IS NOT NULL
)
UPDATE price_history history
SET offer_id = ranked.canonical_id
FROM ranked
WHERE history.offer_id = ranked.id
  AND ranked.row_number > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, supermarket
      ORDER BY id
    ) AS row_number
  FROM offers
  WHERE product_id IS NOT NULL
    AND supermarket IS NOT NULL
)
DELETE FROM offers offer
USING ranked
WHERE offer.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS offers_product_supermarket_idx
  ON offers(product_id, supermarket)
  WHERE product_id IS NOT NULL AND supermarket IS NOT NULL;

COMMIT;
