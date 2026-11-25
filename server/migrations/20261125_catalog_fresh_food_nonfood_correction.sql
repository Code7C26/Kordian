BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE catalog_fresh_food_nonfood_correction_batch (
  product_id integer PRIMARY KEY,
  product_name text NOT NULL,
  source text NOT NULL,
  source_product_id text NOT NULL,
  current_subcategory text NOT NULL,
  current_classification_source text,
  current_classification_confidence text,
  final_category text NOT NULL,
  final_subcategory text NOT NULL
) ON COMMIT DROP;

INSERT INTO catalog_fresh_food_nonfood_correction_batch (
  product_id, product_name, source, source_product_id,
  current_subcategory, current_classification_source, current_classification_confidence,
  final_category, final_subcategory
) VALUES
  (300, 'Jabón En Pan Argentino 200 Gr', 'disco', '4631', 'Panadería y pastelería', 'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (302, 'Jabon Pan Gigante For.econom 120g', 'disco', '262679', 'Panadería y pastelería', 'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (557, 'Jabon En Pan Argentino Blancura Extrema 150g', 'disco', '392986', 'Panadería y pastelería', 'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (1202, 'Antitranspirante En Crema Rexona Odorono 60 Gr', 'disco', '391634', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (5404, 'Detergente Cif Frutas Cítricas 500 Ml', 'disco', '345703', 'Frutas y verduras', 'automatic', 'high', 'Limpieza e Higiene', 'Limpieza de cocina'),
  (5423, 'Detergente Cif Frutas Cítricas 500 Ml', 'disco', '331268', 'Frutas y verduras', 'automatic', 'high', 'Limpieza e Higiene', 'Limpieza de cocina'),
  (5453, 'Detergente Magistral Multiuso Manzana 750 Ml', 'disco', '319530', 'Frutas y verduras', 'automatic', 'high', 'Limpieza e Higiene', 'Limpieza de cocina'),
  (5479, 'Detergente Magistral Multiuso Manzana 500 Ml', 'disco', '315878', 'Frutas y verduras', 'automatic', 'high', 'Limpieza e Higiene', 'Limpieza de cocina'),
  (5725, 'Detergente Magistral Ultra Manzana 750 Ml', 'disco', '32816', 'Frutas y verduras', 'automatic', 'high', 'Limpieza e Higiene', 'Limpieza de cocina'),
  (6393, 'Leche Y Tónico Micelar Nivea 200 Ml', 'disco', '340603', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (6655, 'Crema de Afeitar Cara y Cuerpo Hidratante 150 Ml Gillette', 'disco', '387217', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (6962, 'Corta Queso Plástico Blanco 1 Un Loekemeyer', 'disco', '119301', 'Lácteos', NULL, NULL, 'Hogar y Otros', 'Cocina y bazar'),
  (9232, 'Bowl Jaspeado Crema Cerámica 1300 Cc Plus', 'disco', '3080019', 'Lácteos', NULL, NULL, 'Hogar y Otros', 'Cocina y bazar'),
  (9235, 'Bowl Jaspeado Crema Cerámica 300 Cc Plus', 'disco', '3080020', 'Lácteos', NULL, NULL, 'Hogar y Otros', 'Cocina y bazar'),
  (9241, 'Mug Jaspeado Crema Cerámica 350 Cc Plus', 'disco', '3080015', 'Lácteos', NULL, NULL, 'Hogar y Otros', 'Cocina y bazar'),
  (9399, 'Crema Capilar Elvive', 'disco', '30922', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado capilar'),
  (9403, 'Crema Capilar Elvive', 'disco', '31322', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado capilar'),
  (10872, 'Antitranspirante En Crema Rexona Odorono Con Glicerina 60 G', 'disco', '318229', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (14274, 'Jabón de Lavar en Pan 150 Grs Gran Federal', 'disco', '380691', 'Panadería y pastelería', 'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (14277, 'Jabón en Pan 300 Grs x 2 Un Zorro', 'disco', '380705', 'Panadería y pastelería', 'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (14279, 'Jabón en Pan Coco 400 Grs x 2 Un Ala', 'disco', '388682', 'Panadería y pastelería', 'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (14280, 'Jabón en Pan Blanco 400 Grs x 2 Un Argentino', 'disco', '28428', 'Panadería y pastelería', 'automatic', 'high', 'Limpieza e Higiene', 'Lavado de ropa'),
  (14341, 'Crema Peinar Anti Caida X 300 Ml Pantene', 'disco', '3066021', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado capilar'),
  (14402, 'Crema Noche L''oréal Paris Revitalift Acido Hialulronico X 50ml', 'disco', '296079', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (14407, 'Crema Día L''oréal Paris Revitalift Acido Hialulronico X 50ml', 'disco', '296073', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (14450, 'Crema Tratamiento Dream Liso X 300 Gr Elvive', 'disco', '3071022', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado capilar'),
  (15359, 'Crema De Peinar Fructis Hair Food Cocoa 3 En 1', 'disco', '424313', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado capilar'),
  (15371, 'Crema Hidratante Anti-Edad 150 Ml Nivea', 'disco', '2614', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (15422, 'Crema Protectora Solar Fps 15 200 Ml Zono', 'disco', '408348', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (15515, 'Repelente de Insectos Crema 200 Grs Family Care', 'disco', '1370586', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (15528, 'Repelente para Mosquitos Crema 196 Grs Off', 'disco', '353368', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (15630, 'Crema de Peinar Nutrición Óleo de Coco 300 Ml Plusbelle', 'disco', '424301', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado capilar'),
  (15643, 'Crema Gel Facial Ultra Hidratante 50 Grs Dermaglós', 'disco', '387010', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (15665, 'Crema de Manos Anti-Edad Q10 3 en 1 100 Ml Nivea', 'disco', '383863', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (15696, 'Crema Hidratante Soft para Cuerpo y Manos 100 Ml Nivea', 'disco', '8058', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (15715, 'Crema Adhesiva para Prótesis Dentales Sabor Menta 70 Grs Corega', 'disco', '25767', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado bucal'),
  (15742, 'Tintura Crema Oleos Sin Amoniaco Rubio 7.0 1 Un Nutrisse', 'disco', '3087942', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado capilar'),
  (15769, 'Crema Adhesiva para Prótesis Dental Sabor Menta 40 Grs Corega', 'disco', '13163', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado bucal'),
  (15776, 'Crema Adhesiva para Prótesis Dentales Ultra Sin Sabor 70 Grs Corega', 'disco', '28674', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado bucal'),
  (15778, 'Crema Adhesiva para Prótesis Dentales Sin Sabor 40 Grs Corega', 'disco', '22634', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado bucal'),
  (15783, 'Crema Adhesiva para Prótesis Dentales con Aloe Vera 70 Grs Corega', 'disco', '3089656', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Cuidado bucal'),
  (15787, 'Repelente de Insectos Crema Extra Duración 200 Grs Family Care', 'disco', '1370585', 'Lácteos', NULL, NULL, 'Limpieza e Higiene', 'Higiene personal'),
  (21066, 'CREMA DENTAL CLOSE UP ANTI CARIES X 70GR.', 'mami', 'prod2851392', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21067, 'CREMA DENTAL COLGATE SENSITIVE PRO ALIVIO INMEDIATO ORIGINAL X60G', 'mami', 'prod2851417', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21069, 'CREMA DENTAL ODOL DOBLE EFECTO X180GR.', 'mami', 'prod2851342', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21073, 'CREMA DENTAL COLGATE HERBAL NATURAL PROTECCION X140G', 'mami', 'prod2851401', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21087, 'CREMA DENTAL COLGATE LUMINOUS WHITE COLOR CORRECT X 70 GR', 'mami', 'prod2851422', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21088, 'CREMA DENTAL COLGATE  MINIONS X100GR.', 'mami', 'prod2850889', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21089, 'CREMA DENTAL CLOSE UP DIENTES MAS BLANCOS X 90GR.', 'mami', 'prod2851397', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21090, 'CREMA DENTAL KOLYNOS SUP.BLAN.CAL. X90GR', 'mami', 'prod2851275', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21091, 'CREMA DENTAL SENSODYNE ORIGINAL X 50 GR.', 'mami', 'prod2850571', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21092, 'CREMA DENTAL COLGATE TOTAL MENTA ORIGINAL 140 GR', 'mami', 'prod2851415', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21093, 'CREMA DENTAL ORAL-B EXTRA BLANCO X 70 GR.', 'mami', 'prod2851193', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado bucal'),
  (21113, 'CREMA SEDAL PARA PEINAR RIZOS DEFINIDOS X300ML', 'mami', 'prod2916943', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21115, 'CREMA TRATAMIENTO ELVIVE REPARACION TOTAL 5+ X 300 GR.', 'mami', 'prod2916483', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21118, 'CREMA CAPILAR FRUCTIS HYDRA LISS X250ML', 'mami', 'prod2916813', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Cuidado capilar'),
  (21143, 'CREMA CORPORAL NEUTROGENA HYDRO BOOST WATER GEL X 400ML.', 'mami', 'prod2922115', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21144, 'CREMA CORPORAL ST. IVES HUMECTACION DIARIA X 350 ML.', 'mami', 'prod2921711', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21145, 'CREMA CORPORAL ST. IVES HUMECTACION DIARIA X 532 ML.', 'mami', 'prod2921713', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21146, 'CREMA CORPORAL NEUTROGENA HYDRO BOOST WATER GEL X 200ML.', 'mami', 'prod2922112', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21147, 'CREMA CORPORAL NEUTROGENA BODY CARE INTENSIVE HIDRATA & REPARA X 200ML.', 'mami', 'prod2922113', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21148, 'CREMA CORPORAL NEUTROGENA BODY CARE HIDRATA Y REPARA X 400 M.L', 'mami', 'prod2922151', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21149, 'CREMA HINDS HIDRATACIÓN EXTREMA 250ML', 'mami', 'prod2922011', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21150, 'CREMA EVO ORDEÑE UREA 5% X 400 ML.', 'mami', 'prod2922167', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21151, 'CREMA HUMECTANTE JERGENS ULTRA HUMECTANTE X400ML', 'mami', 'prod2922047', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21152, 'CREMA EVO ORDEÑE HIPOALERGENICA C/DOSIFICADOR X 400 ML.', 'mami', 'prod2922168', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21153, 'CREMA CORPORAL VERITAS SUAVIDAD DELICADA X 400 ML.', 'mami', 'prod2921599', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21154, 'CREMA HIDRATANTE NIVEA SOFT X 100 ML.', 'mami', 'prod2920283', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21162, 'AGUA MICELAR NTG CLEANSER X 200 ML.', 'mami', 'prod2921796', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21165, 'CREMA DERMAGLÓS PROTECTOR SOLAR F65 BEBÉS CR 120 GR', 'mami', 'prod2921983', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21166, 'CREMA DEPILATORIA DEPIMIEL PARA ROSTRO X 40 GR.', 'mami', 'prod2921846', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21167, 'CREMA DEPILATORIA DEPIMIEL PARA EL ROSTRO (A+B) SENSITIVE X 45 GR.', 'mami', 'prod2921844', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21285, 'CREMA PARA CUEROS Y ZAPATOS AROLA MARRON X 60 CC.', 'mami', 'prod2880103', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (21286, 'CREMA PARA CUEROS Y ZAPATOS AROLA INCOLORO X 60 CC.', 'mami', 'prod2880102', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (21336, 'REPELENTE OFF FAMILY CREMA ALOE VERA  60GR', 'mami', 'prod2700426', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene personal'),
  (21383, 'DETERGENTE HEROE ULTRA MANZANA X 500ML.', 'mami', 'prod2790807', 'Frutas y verduras', 'manual', 'manual', 'Limpieza e Higiene', 'Limpieza de cocina'),
  (21438, 'LUSTRAMUEBLES SUIZA CLASICO CREMA X 200 CC.', 'mami', 'prod2660049', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Limpieza del hogar'),
  (21449, 'JABON EN PAN SEISEME X 300 GR.', 'mami', 'prod2840299', 'Panadería y pastelería', 'manual', 'manual', 'Limpieza e Higiene', 'Lavado de ropa'),
  (21450, 'JABON EN PAN COSQUIN BLANCO X 200GR.', 'mami', 'prod2842062', 'Panadería y pastelería', 'manual', 'manual', 'Limpieza e Higiene', 'Lavado de ropa'),
  (21452, 'JABON EN PAN VANISH SUPERBARRA X 75 GR.', 'mami', 'prod2841400', 'Panadería y pastelería', 'manual', 'manual', 'Limpieza e Higiene', 'Lavado de ropa'),
  (21635, 'SARTEN PANELUX CLASSIC TEFLON P/HUEVO FRITO 12 CM. - ART. 1190112', 'mami', 'prod3604524', 'Huevos', 'manual', 'manual', 'Hogar y Otros', 'Cocina y bazar'),
  (21767, 'CREMA CORPORAL JOHNSON BABY LIQUIDA ROSA X 200 ML.', 'mami', 'prod2680080', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene infantil'),
  (21769, 'CREMA CORPORAL JOHNSON BABY HIDRATANTE RECIEN NACIDO X 200 ML.', 'mami', 'prod2680912', 'Lácteos', 'manual', 'manual', 'Limpieza e Higiene', 'Higiene infantil');

DO $apply_fresh_food_correction$
DECLARE
  v_expected integer;
  v_updated integer;
BEGIN
  SELECT count(*) INTO v_expected FROM catalog_fresh_food_nonfood_correction_batch;
  IF v_expected <> 83 THEN
    RAISE EXCEPTION 'Unexpected fresh-food correction batch size: %', v_expected;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category FROM catalog_fresh_food_nonfood_correction_batch) expected
    LEFT JOIN public.categories c ON c.name = expected.final_category
    GROUP BY expected.final_category
    HAVING count(c.id) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT final_category, final_subcategory
          FROM catalog_fresh_food_nonfood_correction_batch) expected
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
  JOIN catalog_fresh_food_nonfood_correction_batch b ON b.product_id = p.id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM catalog_fresh_food_nonfood_correction_batch b
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
           current_category.name = 'Alimentos Frescos y Refrigerados'
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
  FROM catalog_fresh_food_nonfood_correction_batch b
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
    FROM catalog_fresh_food_nonfood_correction_batch b
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

  RAISE NOTICE 'Fresh-food nonfood correction: % rows validated; % rows updated', v_expected, v_updated;
END;
$apply_fresh_food_correction$;

COMMIT;
