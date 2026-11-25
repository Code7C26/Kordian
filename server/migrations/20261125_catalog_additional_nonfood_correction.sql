BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE catalog_additional_nonfood_correction_batch (
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

INSERT INTO catalog_additional_nonfood_correction_batch (
  product_id, product_name, source, source_product_id,
  current_category, current_subcategory,
  current_classification_source, current_classification_confidence,
  final_category, final_subcategory
) VALUES
  (531, 'Aceite Aromatizante Harmony Repuesto 21ml Glade',
    'disco', '3078460', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos',
    'automatic', 'high', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (533, 'Aceite Aromatizante Limón Repuesto 21ml Glade',
    'disco', '3078461', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos',
    'automatic', 'high', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (643, 'Aromatizante Aceite Natural Tropical Floral 21 Ml Glade',
    'disco', '3078466', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos',
    'automatic', 'high', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (646, 'Aromatizante Aceite Natural Vainilla Pack X2 Un 21 Ml Glade',
    'disco', '3078464', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos',
    'automatic', 'high', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (994, 'Soda Cáustica Mavax',
    'disco', '43228', 'Almacén y Alimentos', 'Bebidas',
    'automatic', 'high', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (996, 'Cristal De Soda Mavax',
    'disco', '13239', 'Almacén y Alimentos', 'Bebidas',
    'automatic', 'high', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (1001, 'Vasito De Vidrio P/soda',
    'disco', '104724', 'Almacén y Alimentos', 'Bebidas',
    'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (8314, 'Azucarera C/tapa  Vde Manzana',
    'disco', '112297', 'Alimentos Frescos y Refrigerados', 'Frutas y verduras',
    'automatic', 'high', 'Hogar y Otros', 'Cocina y bazar'),
  (14464, 'Kit De Coloracion Nutrisse Tono 67p - Chocolate Intenso',
    'disco', '414675', 'Almacén y Alimentos', 'Golosinas y snacks',
    'automatic', 'high', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21111, 'MASCARILLA DOVE BOND INTENSE REPARADORA X 250GR.',
    'mami', 'prod2916892', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21112, 'TRATAMIENTO CAPILATIS CAPILAR NUTRITIVO X200G.',
    'mami', 'prod2916818', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21114, 'MASCARA CAPILATIS MAXIMA PROTECCION X 200G',
    'mami', 'prod2916826', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21116, 'TRATAMIENTO TRESEMME HYDRA MICRO-MO X 300 GR.',
    'mami', 'prod2917083', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21119, 'MASCARA TRATAMIENTO SEDAL CERAMIDAS X 300 GR.',
    'mami', 'prod2916899', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21120, 'MASCARA TRATAMIENTO SEDAL RIZOS DEFINIDOS X 300 GR.',
    'mami', 'prod2916900', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21121, 'TRATAMIENTO CAPILAR NATURAL OIL POTE X 300 GR',
    'mami', 'prod2917009', 'Alimentos Frescos y Refrigerados', 'Lácteos',
    'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21347, 'ABLANDADOR DE AGUA MAVAX CRISTAL DE SODA X 400 GR.',
    'mami', 'prod2830124', 'Almacén y Alimentos', 'Bebidas',
    'manual', 'manual', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (21619, 'PACK X 3 COPAS VINO RIOJA CHIANTI 318 CC. - ART. 5414CL3',
    'mami', 'prod3604812', 'Almacén y Alimentos', 'Bebidas',
    'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (21620, 'SET X 6 VASO CERVEZA 592 ML.METEORA VIDRIO',
    'mami', 'prod3605156', 'Almacén y Alimentos', 'Bebidas',
    'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (21623, 'AZUCARERA CRYSTAL ROCK C/DOSIFICADOR 7.5X13 CM. - ART. 57913887',
    'mami', 'prod3604925', 'Almacén y Alimentos', 'Azúcares y dulces',
    'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (21629, 'MOLINILLO DE PIMIENTA CRYSTAL ROCK VIDRIO 6.5X13.5 CM. - ART. 57913268',
    'mami', 'prod3604789', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos',
    'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (21630, 'AZUCARERA MINASSIAN DE VIDRIO C/PICO 17.5 CM. - ART. SW8906',
    'mami', 'prod3604536', 'Almacén y Alimentos', 'Azúcares y dulces',
    'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (21726, 'SUPER HAMBURGUESA 18X15X13 CM. ART.50679',
    'mami', 'prod3881399', 'Alimentos Frescos y Refrigerados', 'Carnes y pescados',
    'manual', 'manual', 'Hogar y Otros', 'Juguetes');

DO $apply_additional_nonfood_correction$
DECLARE
  v_expected integer;
  v_updated integer;
BEGIN
  SELECT count(*) INTO v_expected FROM catalog_additional_nonfood_correction_batch;
  IF v_expected <> 23 THEN
    RAISE EXCEPTION 'Unexpected additional-nonfood correction batch size: %', v_expected;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category FROM catalog_additional_nonfood_correction_batch) expected
    LEFT JOIN public.categories c ON c.name = expected.final_category
    GROUP BY expected.final_category
    HAVING count(c.id) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category, final_subcategory
          FROM catalog_additional_nonfood_correction_batch) expected
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
  JOIN catalog_additional_nonfood_correction_batch b ON b.product_id = p.id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM catalog_additional_nonfood_correction_batch b
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
  FROM catalog_additional_nonfood_correction_batch b
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
    FROM catalog_additional_nonfood_correction_batch b
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

  RAISE NOTICE 'Additional non-food correction: % rows validated; % rows updated', v_expected, v_updated;
END;
$apply_additional_nonfood_correction$;

COMMIT;
