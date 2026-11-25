BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE catalog_soap_taxonomy_correction_batch (
  product_id integer PRIMARY KEY,
  product_name text NOT NULL,
  source text NOT NULL,
  source_product_id text NOT NULL,
  current_category text NOT NULL,
  current_subcategory text NOT NULL,
  current_classification_source text NOT NULL,
  current_classification_confidence text NOT NULL,
  final_category text NOT NULL,
  final_subcategory text NOT NULL
) ON COMMIT DROP;

INSERT INTO catalog_soap_taxonomy_correction_batch (
  product_id, product_name, source, source_product_id,
  current_category, current_subcategory,
  current_classification_source, current_classification_confidence,
  final_category, final_subcategory
) VALUES
  (302, 'Jabon Pan Gigante For.econom 120g', 'disco', '262679',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'automatic', 'high',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (557, 'Jabon En Pan Argentino Blancura Extrema 150g', 'disco', '392986',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'automatic', 'high',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (300, 'Jabón En Pan Argentino 200 Gr', 'disco', '4631',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'automatic', 'high',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (14274, 'Jabón de Lavar en Pan 150 Grs Gran Federal', 'disco', '380691',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'automatic', 'high',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (14277, 'Jabón en Pan 300 Grs x 2 Un Zorro', 'disco', '380705',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'automatic', 'high',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (14279, 'Jabón en Pan Coco 400 Grs x 2 Un Ala', 'disco', '388682',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'automatic', 'high',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (14280, 'Jabón en Pan Blanco 400 Grs x 2 Un Argentino', 'disco', '28428',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'automatic', 'high',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (13570, 'Jabón Líquido Antibacterial Avena y Prebiótico 221 Ml Protex', 'disco', '242393',
    'Almacén y Alimentos', 'Granos, cereales y legumbres', 'automatic', 'high',
    'Limpieza e Higiene', 'Higiene personal'),
  (21449, 'JABON EN PAN SEISEME X 300 GR.', 'mami', 'prod2840299',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'manual', 'manual',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (21450, 'JABON EN PAN COSQUIN BLANCO X 200GR.', 'mami', 'prod2842062',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'manual', 'manual',
    'Limpieza e Higiene', 'Lavado de ropa'),
  (21452, 'JABON EN PAN VANISH SUPERBARRA X 75 GR.', 'mami', 'prod2841400',
    'Alimentos Frescos y Refrigerados', 'Panadería y pastelería', 'manual', 'manual',
    'Limpieza e Higiene', 'Lavado de ropa');

DO $apply_soap_correction$
DECLARE
  v_expected integer;
  v_updated integer;
BEGIN
  SELECT count(*) INTO v_expected FROM catalog_soap_taxonomy_correction_batch;
  IF v_expected <> 11 THEN
    RAISE EXCEPTION 'Unexpected soap-correction batch size: %', v_expected;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category FROM catalog_soap_taxonomy_correction_batch) expected
    LEFT JOIN public.categories c ON c.name = expected.final_category
    GROUP BY expected.final_category
    HAVING count(c.id) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category, final_subcategory
          FROM catalog_soap_taxonomy_correction_batch) expected
    JOIN public.categories c ON c.name = expected.final_category
    LEFT JOIN public.subcategories s
      ON s.category_id = c.id AND s.name = expected.final_subcategory
    GROUP BY expected.final_category, expected.final_subcategory
    HAVING count(s.id) <> 1
  ) THEN
    RAISE EXCEPTION 'Target category/subcategory is missing or ambiguous; no products were changed';
  END IF;

  LOCK TABLE public.categories, public.subcategories IN SHARE MODE;
  PERFORM p.id
  FROM public.products p
  JOIN catalog_soap_taxonomy_correction_batch b ON b.product_id = p.id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM catalog_soap_taxonomy_correction_batch b
    LEFT JOIN public.products p ON p.id = b.product_id
    LEFT JOIN public.categories current_category ON current_category.id = p.category_id
    LEFT JOIN public.subcategories current_subcategory
      ON current_subcategory.id = p.subcategory_id
     AND current_subcategory.category_id = current_category.id
    LEFT JOIN public.categories final_category ON final_category.name = b.final_category
    LEFT JOIN public.subcategories final_subcategory
      ON final_subcategory.category_id = final_category.id
     AND final_subcategory.name = b.final_subcategory
    WHERE p.id IS NULL
       OR p.name IS DISTINCT FROM b.product_name
       OR p.source IS DISTINCT FROM b.source
       OR p.source_product_id IS DISTINCT FROM b.source_product_id
       OR final_category.id IS NULL
       OR final_subcategory.id IS NULL
       OR NOT (
         (
           current_category.name = b.current_category
           AND current_subcategory.name = b.current_subcategory
           AND p.classification_source IS NOT DISTINCT FROM b.current_classification_source
           AND p.classification_confidence IS NOT DISTINCT FROM b.current_classification_confidence
         )
         OR (
           current_category.name = b.final_category
           AND current_subcategory.name = b.final_subcategory
           AND p.classification_source = 'manual'
           AND p.classification_confidence = 'manual'
         )
       )
  ) THEN
    RAISE EXCEPTION 'Catalog snapshot is stale or does not match product identity/taxonomy; no products were changed';
  END IF;

  UPDATE public.products p
  SET category_id = final_category.id,
      subcategory_id = final_subcategory.id,
      classification_source = 'manual',
      classification_confidence = 'manual'
  FROM catalog_soap_taxonomy_correction_batch b
  JOIN public.categories final_category ON final_category.name = b.final_category
  JOIN public.subcategories final_subcategory
    ON final_subcategory.category_id = final_category.id
   AND final_subcategory.name = b.final_subcategory
  WHERE p.id = b.product_id
    AND (
      p.category_id IS DISTINCT FROM final_category.id
      OR p.subcategory_id IS DISTINCT FROM final_subcategory.id
      OR p.classification_source IS DISTINCT FROM 'manual'
      OR p.classification_confidence IS DISTINCT FROM 'manual'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF EXISTS (
    SELECT 1
    FROM catalog_soap_taxonomy_correction_batch b
    LEFT JOIN public.products p ON p.id = b.product_id
    LEFT JOIN public.categories c ON c.id = p.category_id AND c.name = b.final_category
    LEFT JOIN public.subcategories s
      ON s.id = p.subcategory_id
     AND s.category_id = c.id
     AND s.name = b.final_subcategory
    WHERE p.id IS NULL
       OR p.name IS DISTINCT FROM b.product_name
       OR p.source IS DISTINCT FROM b.source
       OR p.source_product_id IS DISTINCT FROM b.source_product_id
       OR c.id IS NULL
       OR s.id IS NULL
       OR p.classification_source IS DISTINCT FROM 'manual'
       OR p.classification_confidence IS DISTINCT FROM 'manual'
  ) THEN
    RAISE EXCEPTION 'Postflight soap-correction verification failed; transaction rolled back';
  END IF;

  RAISE NOTICE 'Soap taxonomy correction: % rows validated; % rows updated', v_expected, v_updated;
END;
$apply_soap_correction$;

COMMIT;
