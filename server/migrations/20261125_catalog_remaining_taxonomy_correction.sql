BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE catalog_remaining_taxonomy_correction_batch (
  product_id integer PRIMARY KEY,
  product_name text NOT NULL,
  source text NOT NULL,
  source_product_id text NOT NULL,
  current_category text NOT NULL,
  current_subcategory text NOT NULL,
  current_classification_source text,
  current_classification_confidence text,
  final_category text NOT NULL,
  final_subcategory text NOT NULL
) ON COMMIT DROP;

INSERT INTO catalog_remaining_taxonomy_correction_batch (
  product_id, product_name, source, source_product_id,
  current_category, current_subcategory,
  current_classification_source, current_classification_confidence,
  final_category, final_subcategory
) VALUES
  (13570, 'Jabón Líquido Antibacterial Avena y Prebiótico 221 Ml Protex',
    'disco', '242393', 'Almacén y Alimentos', 'Granos, cereales y legumbres',
    'automatic', 'high', 'Limpieza e Higiene', 'Higiene personal'),
  (532, 'Lustramuebles Aceite de Argán 360 Ml Blem',
    'disco', '415199', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos',
    'automatic', 'high', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (21287, 'CREMA PARA CUEROS Y ZAPATOS AROLA CHOCOLATE X 60 CC.',
    'mami', 'prod2880101', 'Almacén y Alimentos', 'Golosinas y snacks',
    'manual', 'manual', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (1140, 'Mug Mate Lila Hydrum',
    'disco', '3073591', 'Almacén y Alimentos', 'Infusiones',
    'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (9229, 'Bowl Mate Verde Cerámica 14,7 Cm Krea',
    'disco', '1364881', 'Almacén y Alimentos', 'Infusiones',
    NULL, NULL, 'Hogar y Otros', 'Cocina y bazar'),
  (9250, 'Plato De Fondo Línea Verde Mate Cerámica 27 Cm Krea',
    'disco', '1364878', 'Almacén y Alimentos', 'Infusiones',
    NULL, NULL, 'Hogar y Otros', 'Cocina y bazar'),
  (20442, 'SAZONADOR + PAPELITO AL SARTEN MAGGI AJO Y CEBOLLA X 23.4 GR.',
    'mami', 'prod2460414', 'Alimentos Frescos y Refrigerados', 'Frutas y verduras',
    'manual', 'manual', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'),
  (269, 'Bon O Bon Leche 150 Grs',
    'disco', '3083397', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'automatic', 'high', 'Almacén y Alimentos', 'Golosinas y snacks'),
  (22352, 'Bombon Aguila Frambuesa Choco C Leche X 12 Arcor',
    'disco', '3080035', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    NULL, NULL, 'Almacén y Alimentos', 'Golosinas y snacks'),
  (5088, 'Detergente Líquido Para Ropa Zorro Plus Original 800 Ml',
    'disco', '300713', 'Limpieza e Higiene', 'Limpieza de cocina',
    'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (5098, 'Detergente Líquido Para Ropa Zorro 3 L',
    'disco', '39645', 'Limpieza e Higiene', 'Limpieza de cocina',
    'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (5101, 'Detergente Líquido Para Ropa Zorro Clásico 3 L',
    'disco', '39637', 'Limpieza e Higiene', 'Limpieza de cocina',
    'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (5117, 'Detergente Líquido Para Ropa Zorro Plus Blue Power 800 Ml',
    'disco', '300712', 'Limpieza e Higiene', 'Limpieza de cocina',
    'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (5717, 'Detergente Liquido Para Ropa Skip Diluible 500 Ml + Botella De 3 L',
    'disco', '320416', 'Limpieza e Higiene', 'Limpieza de cocina',
    'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa');

DO $apply_remaining_taxonomy_correction$
DECLARE
  v_expected integer;
  v_updated integer;
BEGIN
  SELECT count(*) INTO v_expected FROM catalog_remaining_taxonomy_correction_batch;
  IF v_expected <> 14 THEN
    RAISE EXCEPTION 'Unexpected remaining-taxonomy correction batch size: %', v_expected;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category FROM catalog_remaining_taxonomy_correction_batch) expected
    LEFT JOIN public.categories c ON c.name = expected.final_category
    GROUP BY expected.final_category
    HAVING count(c.id) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category, final_subcategory
          FROM catalog_remaining_taxonomy_correction_batch) expected
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
  JOIN catalog_remaining_taxonomy_correction_batch b ON b.product_id = p.id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM catalog_remaining_taxonomy_correction_batch b
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
  FROM catalog_remaining_taxonomy_correction_batch b
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
    FROM catalog_remaining_taxonomy_correction_batch b
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
    RAISE EXCEPTION 'Postflight verification failed; transaction rolled back';
  END IF;

  RAISE NOTICE 'Remaining-taxonomy correction: % rows validated; % rows updated', v_expected, v_updated;
END;
$apply_remaining_taxonomy_correction$;

COMMIT;
