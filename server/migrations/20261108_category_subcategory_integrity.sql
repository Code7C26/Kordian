BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE
  v_actual_types text[];
  v_expected_types text[] := ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'text', 'text'
  ];
  v_invalid_subcategories bigint;
  v_mismatched_products bigint;
  v_orphan_products bigint;
  v_orphan_subcategories bigint;
  v_products_category_attnum smallint;
  v_products_subcategory_attnum smallint;
  v_categories_id_attnum smallint;
  v_subcategories_id_attnum smallint;
  v_subcategories_category_attnum smallint;
BEGIN
  IF to_regclass('public.categories') IS NULL
    OR to_regclass('public.subcategories') IS NULL
    OR to_regclass('public.products') IS NULL
  THEN
    RAISE EXCEPTION
      'Required public.categories, public.subcategories, and public.products tables must exist';
  END IF;

  SELECT array_agg(format_type(attribute.atttypid, attribute.atttypmod)
    ORDER BY expected.ordinality)
  INTO v_actual_types
  FROM unnest(ARRAY[
    'categories.id',
    'subcategories.id',
    'subcategories.category_id',
    'products.category_id',
    'products.classification_source',
    'products.classification_confidence'
  ]) WITH ORDINALITY AS expected(column_key, ordinality)
  LEFT JOIN LATERAL (
    SELECT attribute.atttypid, attribute.atttypmod
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = to_regclass(
      'public.' || split_part(expected.column_key, '.', 1)
    )
      AND attribute.attname = split_part(expected.column_key, '.', 2)
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) AS attribute ON true;

  IF v_actual_types IS DISTINCT FROM v_expected_types THEN
    RAISE EXCEPTION
      'Unexpected taxonomy/product column types: expected %, found %',
      v_expected_types,
      v_actual_types;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.products'::regclass
      AND attname = 'subcategory_id'
      AND atttypid = 'uuid'::regtype
      AND attnum > 0
      AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.products'::regclass
      AND attname = 'id'
      AND atttypid = 'integer'::regtype
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION
      'Expected integer products.id and UUID products.subcategory_id';
  END IF;

  IF to_regprocedure('public.update_catalog_product_classification(integer,uuid)') IS NULL
    OR to_regprocedure('public.update_catalog_subcategory(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.delete_catalog_subcategory(uuid)') IS NULL
  THEN
    RAISE EXCEPTION
      'Expected classification/subcategory RPCs from their dedicated migrations; do not install the historical RPC definitions from this migration';
  END IF;

  SELECT attnum INTO v_products_category_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'category_id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_products_subcategory_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'subcategory_id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_categories_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.categories'::regclass
    AND attname = 'id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_subcategories_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.subcategories'::regclass
    AND attname = 'id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_subcategories_category_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.subcategories'::regclass
    AND attname = 'category_id' AND attnum > 0 AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[v_products_category_attnum]::smallint[]
      AND confrelid = 'public.categories'::regclass
      AND confkey = ARRAY[v_categories_id_attnum]::smallint[]
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[v_products_subcategory_attnum]::smallint[]
      AND confrelid = 'public.subcategories'::regclass
      AND confkey = ARRAY[v_subcategories_id_attnum]::smallint[]
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subcategories'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[v_subcategories_category_attnum]::smallint[]
      AND confrelid = 'public.categories'::regclass
      AND confkey = ARRAY[v_categories_id_attnum]::smallint[]
      AND convalidated
  ) THEN
    RAISE EXCEPTION
      'Expected existing simple category/subcategory foreign keys are missing; inspect schema before applying';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.products'::regclass
      AND (
        constraint_row.conname IN (
          'products_subcategory_category_integrity_fkey',
          'products_subcategory_requires_category_check'
        )
        OR (
          constraint_row.contype = 'f'
          AND constraint_row.conkey = ARRAY[
            v_products_subcategory_attnum,
            v_products_category_attnum
          ]::smallint[]
          AND constraint_row.confrelid = 'public.subcategories'::regclass
          AND constraint_row.confkey = ARRAY[
            v_subcategories_id_attnum,
            v_subcategories_category_attnum
          ]::smallint[]
        )
        OR (
          constraint_row.contype = 'c'
          AND regexp_replace(
            pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
            '[[:space:]()"]',
            '',
            'g'
          ) IN (
            'subcategory_idISNULLORcategory_idISNOTNULL',
            'category_idISNOTNULLORsubcategory_idISNULL'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION
      'A candidate category/subcategory integrity constraint already exists; inspect migration state instead of rerunning';
  END IF;

  SELECT count(*) INTO v_invalid_subcategories
  FROM public.products
  WHERE subcategory_id IS NOT NULL AND category_id IS NULL;

  SELECT count(*) INTO v_mismatched_products
  FROM public.products AS product
  JOIN public.subcategories AS subcategory ON subcategory.id = product.subcategory_id
  WHERE product.subcategory_id IS NOT NULL
    AND product.category_id IS DISTINCT FROM subcategory.category_id;

  SELECT count(*) INTO v_orphan_products
  FROM public.products AS product
  LEFT JOIN public.categories AS category ON category.id = product.category_id
  LEFT JOIN public.subcategories AS subcategory ON subcategory.id = product.subcategory_id
  WHERE (product.category_id IS NOT NULL AND category.id IS NULL)
     OR (product.subcategory_id IS NOT NULL AND subcategory.id IS NULL);

  SELECT count(*) INTO v_orphan_subcategories
  FROM public.subcategories AS subcategory
  LEFT JOIN public.categories AS category ON category.id = subcategory.category_id
  WHERE category.id IS NULL;

  IF v_invalid_subcategories + v_mismatched_products
      + v_orphan_products + v_orphan_subcategories > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Category/subcategory integrity preflight failed: missing product category=%s, mismatched product category=%s, orphan product reference=%s, orphan subcategory parent=%s',
        v_invalid_subcategories,
        v_mismatched_products,
        v_orphan_products,
        v_orphan_subcategories
      ),
      HINT = 'No data was changed. Review the read-only audit and resolve each row through an explicitly approved mapping.';
  END IF;
END;
$preflight$;

DO $ensure_indexes$
DECLARE
  v_id_attnum smallint;
  v_parent_attnum smallint;
  v_product_subcategory_attnum smallint;
BEGIN
  SELECT attnum INTO v_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.subcategories'::regclass
    AND attname = 'id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_parent_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.subcategories'::regclass
    AND attname = 'category_id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_product_subcategory_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'subcategory_id' AND attnum > 0 AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_row
    JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_row.indrelid = 'public.subcategories'::regclass
      AND index_row.indisunique
      AND index_row.indimmediate
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indislive
      AND index_row.indnkeyatts = 2
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
      AND access_method.amname = 'btree'
      AND ARRAY(
        SELECT key_column.attnum::smallint
        FROM unnest(index_row.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        WHERE key_column.ordinality <= index_row.indnkeyatts
        ORDER BY key_column.ordinality
      ) = ARRAY[v_id_attnum, v_parent_attnum]::smallint[]
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(index_row.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN unnest(index_row.indclass) WITH ORDINALITY AS class_column(opclass_oid, ordinality)
          USING (ordinality)
        JOIN unnest(index_row.indcollation) WITH ORDINALITY AS collation_column(collation_oid, ordinality)
          USING (ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_row.indrelid
         AND attribute.attnum = key_column.attnum
        JOIN pg_opclass AS operator_class ON operator_class.oid = class_column.opclass_oid
        WHERE key_column.ordinality <= index_row.indnkeyatts
          AND (
            operator_class.opcmethod <> index_class.relam
            OR NOT operator_class.opcdefault
            OR operator_class.opcintype <> attribute.atttypid
            OR collation_column.collation_oid <> attribute.attcollation
          )
      )
  ) THEN
    IF to_regclass('public.subcategories_id_category_id_integrity_uidx') IS NOT NULL THEN
      RAISE EXCEPTION
        'Index name collision: subcategories_id_category_id_integrity_uidx is not the required unique B-tree index';
    END IF;
    CREATE UNIQUE INDEX subcategories_id_category_id_integrity_uidx
      ON public.subcategories (id, category_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_row
    JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_row.indrelid = 'public.products'::regclass
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indislive
      AND index_row.indnkeyatts >= 1
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
      AND access_method.amname = 'btree'
      AND EXISTS (
        SELECT 1
        FROM unnest(index_row.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        WHERE key_column.ordinality = 1
          AND key_column.attnum = v_product_subcategory_attnum
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(index_row.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN unnest(index_row.indclass) WITH ORDINALITY AS class_column(opclass_oid, ordinality)
          USING (ordinality)
        JOIN unnest(index_row.indcollation) WITH ORDINALITY AS collation_column(collation_oid, ordinality)
          USING (ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_row.indrelid
         AND attribute.attnum = key_column.attnum
        JOIN pg_opclass AS operator_class ON operator_class.oid = class_column.opclass_oid
        WHERE key_column.ordinality = 1
          AND (
            operator_class.opcmethod <> index_class.relam
            OR NOT operator_class.opcdefault
            OR operator_class.opcintype <> attribute.atttypid
            OR collation_column.collation_oid <> attribute.attcollation
          )
      )
  ) THEN
    IF to_regclass('public.products_subcategory_id_integrity_idx') IS NOT NULL THEN
      RAISE EXCEPTION
        'Index name collision: products_subcategory_id_integrity_idx is not a usable B-tree prefix index';
    END IF;
    CREATE INDEX products_subcategory_id_integrity_idx
      ON public.products (subcategory_id);
  END IF;
END;
$ensure_indexes$;

DO $ensure_integrity_constraints$
DECLARE
  v_product_category_attnum smallint;
  v_product_subcategory_attnum smallint;
  v_subcategory_id_attnum smallint;
  v_subcategory_parent_attnum smallint;
  v_category_id_attnum smallint;
  v_fk_count integer;
  v_check_count integer;
  v_expected_check_attnums smallint[];
  v_constraint record;
BEGIN
  SELECT attnum INTO v_product_category_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'category_id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_product_subcategory_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'subcategory_id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_subcategory_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.subcategories'::regclass
    AND attname = 'id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_subcategory_parent_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.subcategories'::regclass
    AND attname = 'category_id' AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO v_category_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.categories'::regclass
    AND attname = 'id' AND attnum > 0 AND NOT attisdropped;
  SELECT array_agg(attnum::smallint ORDER BY attnum)
  INTO v_expected_check_attnums
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname IN ('category_id', 'subcategory_id')
    AND attnum > 0
    AND NOT attisdropped;

  FOR v_constraint IN
    SELECT constraint_row.*,
           pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.products'::regclass
      AND constraint_row.contype = 'f'
      AND constraint_row.conkey && ARRAY[
        v_product_category_attnum,
        v_product_subcategory_attnum
      ]::smallint[]
  LOOP
    IF v_constraint.conkey = ARRAY[v_product_category_attnum]::smallint[] THEN
      IF v_constraint.confrelid <> 'public.categories'::regclass
        OR v_constraint.confkey <> ARRAY[v_category_id_attnum]::smallint[]
      THEN
        RAISE EXCEPTION
          'Unexpected existing products.category_id foreign key: %',
          v_constraint.definition;
      END IF;
    ELSIF v_constraint.conkey = ARRAY[v_product_subcategory_attnum]::smallint[] THEN
      IF v_constraint.confrelid <> 'public.subcategories'::regclass
        OR v_constraint.confkey <> ARRAY[v_subcategory_id_attnum]::smallint[]
      THEN
        RAISE EXCEPTION
          'Unexpected existing products.subcategory_id foreign key: %',
          v_constraint.definition;
      END IF;
    ELSIF v_constraint.conkey = ARRAY[
      v_product_subcategory_attnum,
      v_product_category_attnum
    ]::smallint[] THEN
      IF v_constraint.confrelid <> 'public.subcategories'::regclass
        OR v_constraint.confkey <> ARRAY[
          v_subcategory_id_attnum,
          v_subcategory_parent_attnum
        ]::smallint[]
        OR v_constraint.confmatchtype <> 's'
        OR v_constraint.confupdtype <> 'a'
        OR v_constraint.confdeltype <> 'a'
        OR v_constraint.condeferrable
        OR v_constraint.condeferred
        OR NOT v_constraint.conislocal
        OR v_constraint.coninhcount <> 0
      THEN
        RAISE EXCEPTION
          'Unexpected composite category/subcategory foreign key: %',
          v_constraint.definition;
      END IF;
      v_fk_count := COALESCE(v_fk_count, 0) + 1;
    ELSE
      RAISE EXCEPTION
        'Unexpected foreign key involving product category columns: %',
        v_constraint.definition;
    END IF;
  END LOOP;

  IF COALESCE(v_fk_count, 0) > 1 THEN
    RAISE EXCEPTION 'Multiple equivalent composite foreign keys exist';
  ELSIF COALESCE(v_fk_count, 0) = 0 THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.products'::regclass
        AND conname = 'products_subcategory_category_integrity_fkey'
    ) THEN
      RAISE EXCEPTION
        'Constraint name collision: products_subcategory_category_integrity_fkey has an unexpected definition';
    END IF;
    ALTER TABLE public.products
      ADD CONSTRAINT products_subcategory_category_integrity_fkey
      FOREIGN KEY (subcategory_id, category_id)
      REFERENCES public.subcategories (id, category_id)
      MATCH SIMPLE
      ON UPDATE NO ACTION
      ON DELETE NO ACTION
      NOT VALID;
  END IF;

  FOR v_constraint IN
    SELECT constraint_row.*,
           regexp_replace(
             pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
             '[[:space:]()"]',
             '',
             'g'
           ) AS normalized_definition
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.products'::regclass
      AND constraint_row.contype = 'c'
  LOOP
    IF ARRAY(
      SELECT key_column.attnum::smallint
      FROM unnest(COALESCE(v_constraint.conkey, ARRAY[]::smallint[]))
        AS key_column(attnum)
      ORDER BY key_column.attnum
    ) = v_expected_check_attnums THEN
      IF v_constraint.normalized_definition NOT IN (
        'subcategory_idISNULLORcategory_idISNOTNULL',
        'category_idISNOTNULLORsubcategory_idISNULL'
      )
        OR v_constraint.condeferrable
        OR v_constraint.condeferred
        OR NOT v_constraint.conislocal
        OR v_constraint.coninhcount <> 0
        OR v_constraint.connoinherit
      THEN
        RAISE EXCEPTION
          'Unexpected CHECK constraint on products category columns: %',
          pg_get_constraintdef(v_constraint.oid, true);
      END IF;
      v_check_count := COALESCE(v_check_count, 0) + 1;
    END IF;
  END LOOP;

  IF COALESCE(v_check_count, 0) > 1 THEN
    RAISE EXCEPTION 'Multiple equivalent category-required CHECK constraints exist';
  ELSIF COALESCE(v_check_count, 0) = 0 THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.products'::regclass
        AND conname = 'products_subcategory_requires_category_check'
    ) THEN
      RAISE EXCEPTION
        'Constraint name collision: products_subcategory_requires_category_check has an unexpected definition';
    END IF;
    ALTER TABLE public.products
      ADD CONSTRAINT products_subcategory_requires_category_check
      CHECK (subcategory_id IS NULL OR category_id IS NOT NULL)
      NOT VALID;
  END IF;
END;
$ensure_integrity_constraints$;

DO $validate_integrity_constraints$
DECLARE
  v_fk_name name;
  v_check_name name;
  v_fk_count integer;
  v_check_count integer;
BEGIN
  SELECT count(*), (array_agg(conname))[1]
  INTO v_fk_count, v_fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.products'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[
      (SELECT attnum::smallint FROM pg_attribute
       WHERE attrelid = 'public.products'::regclass AND attname = 'subcategory_id'),
      (SELECT attnum::smallint FROM pg_attribute
       WHERE attrelid = 'public.products'::regclass AND attname = 'category_id')
    ]::smallint[]
    AND confrelid = 'public.subcategories'::regclass
    AND confkey = ARRAY[
      (SELECT attnum::smallint FROM pg_attribute
       WHERE attrelid = 'public.subcategories'::regclass AND attname = 'id'),
      (SELECT attnum::smallint FROM pg_attribute
       WHERE attrelid = 'public.subcategories'::regclass AND attname = 'category_id')
    ]::smallint[]
    AND confupdtype = 'a'
    AND confdeltype = 'a'
    AND confmatchtype = 's'
    AND NOT condeferrable
    AND NOT condeferred;

  SELECT count(*), (array_agg(conname))[1]
  INTO v_check_count, v_check_name
  FROM pg_constraint
  WHERE conrelid = 'public.products'::regclass
    AND contype = 'c'
    AND regexp_replace(pg_get_expr(conbin, conrelid), '[[:space:]()"]', '', 'g')
      IN ('subcategory_idISNULLORcategory_idISNOTNULL', 'category_idISNOTNULLORsubcategory_idISNULL');

  IF v_fk_count <> 1 OR v_check_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one composite FK and one category-required CHECK; found FK %, CHECK %',
      v_fk_count, v_check_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = v_fk_name
      AND NOT convalidated
  ) THEN
    EXECUTE format('ALTER TABLE public.products VALIDATE CONSTRAINT %I', v_fk_name);
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = v_check_name
      AND NOT convalidated
  ) THEN
    EXECUTE format('ALTER TABLE public.products VALIDATE CONSTRAINT %I', v_check_name);
  END IF;
END;
$validate_integrity_constraints$;

COMMIT;
