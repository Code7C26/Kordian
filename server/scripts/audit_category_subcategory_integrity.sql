-- Read-only preflight for the NOT VALID constraints from
-- migrations/20261108_category_subcategory_integrity.sql.
-- Every query must return zero rows before running
-- validate_category_subcategory_integrity.sql.

-- A subcategory requires a non-NULL product category.
SELECT p.id AS product_id, p.name, p.category_id, p.subcategory_id
FROM public.products AS p
WHERE p.subcategory_id IS NOT NULL
  AND p.category_id IS NULL
ORDER BY p.id;

-- The product's category must match its subcategory's parent category.
SELECT p.id AS product_id, p.name,
       p.category_id AS product_category_id,
       p.subcategory_id,
       s.category_id AS subcategory_category_id
FROM public.products AS p
JOIN public.subcategories AS s ON s.id = p.subcategory_id
WHERE p.subcategory_id IS NOT NULL
  AND p.category_id IS NOT NULL
  AND p.category_id IS DISTINCT FROM s.category_id
ORDER BY p.id;

-- Include orphaned references in the audit in case the existing single-column
-- foreign keys were previously unvalidated or disabled.
SELECT p.id AS product_id, p.name, p.category_id, p.subcategory_id
FROM public.products AS p
LEFT JOIN public.subcategories AS s ON s.id = p.subcategory_id
WHERE p.subcategory_id IS NOT NULL
  AND s.id IS NULL
ORDER BY p.id;

SELECT p.id AS product_id, p.name, p.category_id, p.subcategory_id
FROM public.products AS p
LEFT JOIN public.categories AS c ON c.id = p.category_id
WHERE p.category_id IS NOT NULL
  AND c.id IS NULL
ORDER BY p.id;
