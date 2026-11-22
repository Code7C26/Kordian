BEGIN TRANSACTION READ ONLY;

WITH
source_summary AS (
  SELECT
    source::text AS source,
    count(*) AS total_products,
    count(*) FILTER (WHERE classification_source IS NULL) AS null_source_products
  FROM public.products
  GROUP BY source
),
null_source_detail AS (
  SELECT
    product.source::text AS source,
    product.category_id::text AS category_id,
    category.name AS category_name,
    product.subcategory_id::text AS subcategory_id,
    subcategory.name AS subcategory_name,
    product.category_id IS NOT NULL AS has_category,
    product.subcategory_id IS NOT NULL AS has_subcategory,
    product.classification_confidence::text AS classification_confidence,
    count(*) AS product_count
  FROM public.products AS product
  LEFT JOIN public.categories AS category
    ON category.id = product.category_id
  LEFT JOIN public.subcategories AS subcategory
    ON subcategory.id = product.subcategory_id
  WHERE product.classification_source IS NULL
  GROUP BY
    product.source,
    product.category_id,
    category.name,
    product.subcategory_id,
    subcategory.name,
    product.category_id IS NOT NULL,
    product.subcategory_id IS NOT NULL,
    product.classification_confidence
)
SELECT
  'source_summary'::text AS section,
  coalesce(summary.source, '<NULL>') AS source,
  NULL::text AS category_id,
  NULL::text AS category_name,
  NULL::text AS subcategory_id,
  NULL::text AS subcategory_name,
  NULL::boolean AS has_category,
  NULL::boolean AS has_subcategory,
  NULL::text AS classification_confidence,
  summary.total_products AS product_count,
  summary.total_products,
  summary.null_source_products
FROM source_summary AS summary
UNION ALL
SELECT
  'null_source_detail',
  coalesce(detail.source, '<NULL>'),
  detail.category_id,
  detail.category_name,
  detail.subcategory_id,
  detail.subcategory_name,
  detail.has_category,
  detail.has_subcategory,
  coalesce(detail.classification_confidence, '<NULL>'),
  detail.product_count,
  summary.total_products,
  summary.null_source_products
FROM null_source_detail AS detail
JOIN source_summary AS summary
  ON summary.source IS NOT DISTINCT FROM detail.source
ORDER BY
  section,
  source,
  category_name,
  subcategory_name,
  has_category,
  has_subcategory,
  classification_confidence;

COMMIT;
