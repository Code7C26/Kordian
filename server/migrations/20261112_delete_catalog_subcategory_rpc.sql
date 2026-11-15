BEGIN;
SET LOCAL lock_timeout = '3s';

DO $preflight$
DECLARE
  v_group_subcategory_attnum smallint;
  v_subcategory_id_attnum smallint;
  v_product_subcategory_attnum smallint;
  v_matching_fk_count integer;
  v_fk record;
  v_orphan_group_count bigint;
BEGIN
  IF to_regclass('public.comparable_groups') IS NULL
    OR to_regclass('public.subcategories') IS NULL
    OR to_regclass('public.products') IS NULL
  THEN
    RAISE EXCEPTION
      'Required tables public.comparable_groups, public.subcategories, and public.products must exist';
  END IF;

  SELECT attnum INTO v_group_subcategory_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.comparable_groups'::regclass
    AND attname = 'subcategory_id'
    AND attnum > 0
    AND NOT attisdropped;

  SELECT attnum INTO v_subcategory_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.subcategories'::regclass
    AND attname = 'id'
    AND attnum > 0
    AND NOT attisdropped;

  SELECT attnum INTO v_product_subcategory_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.products'::regclass
    AND attname = 'subcategory_id'
    AND attnum > 0
    AND NOT attisdropped;

  IF v_group_subcategory_attnum IS NULL
    OR v_subcategory_id_attnum IS NULL
    OR v_product_subcategory_attnum IS NULL
    OR (SELECT atttypid FROM pg_attribute
        WHERE attrelid = 'public.subcategories'::regclass
          AND attnum = v_subcategory_id_attnum) <> 'uuid'::regtype::oid
    OR (SELECT atttypid FROM pg_attribute
        WHERE attrelid = 'public.comparable_groups'::regclass
          AND attnum = v_group_subcategory_attnum) <> 'uuid'::regtype::oid
    OR (SELECT atttypid FROM pg_attribute
        WHERE attrelid = 'public.products'::regclass
          AND attnum = v_product_subcategory_attnum) <> 'uuid'::regtype::oid
  THEN
    RAISE EXCEPTION
      'Required UUID columns public.comparable_groups.subcategory_id, public.subcategories.id, and public.products.subcategory_id must exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.comparable_groups AS group_row
    LEFT JOIN public.subcategories AS subcategory
      ON subcategory.id = group_row.subcategory_id
    WHERE subcategory.id IS NULL
  ) THEN
    SELECT count(*)
    INTO v_orphan_group_count
    FROM public.comparable_groups AS group_row
    LEFT JOIN public.subcategories AS subcategory
      ON subcategory.id = group_row.subcategory_id
    WHERE subcategory.id IS NULL;

    RAISE EXCEPTION
      'Cannot enforce the comparable_groups subcategory foreign key: % orphan group rows exist',
      v_orphan_group_count;
  END IF;

  SELECT count(*)
  INTO v_matching_fk_count
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.comparable_groups'::regclass
    AND constraint_row.contype = 'f'
    AND constraint_row.conkey = ARRAY[v_group_subcategory_attnum]::smallint[]
    AND constraint_row.confrelid = 'public.subcategories'::regclass
    AND constraint_row.confkey = ARRAY[v_subcategory_id_attnum]::smallint[];

  IF v_matching_fk_count > 1 THEN
    RAISE EXCEPTION
      'Multiple comparable_groups(subcategory_id) foreign keys exist; refusing to choose one';
  ELSIF v_matching_fk_count = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.comparable_groups'::regclass
        AND conname = 'comparable_groups_subcategory_id_fkey'
    ) THEN
      RAISE EXCEPTION
        'Constraint name comparable_groups_subcategory_id_fkey is already used by a different constraint';
    END IF;

    ALTER TABLE public.comparable_groups
      ADD CONSTRAINT comparable_groups_subcategory_id_fkey
      FOREIGN KEY (subcategory_id)
      REFERENCES public.subcategories (id)
      ON DELETE RESTRICT
      NOT VALID;
    ALTER TABLE public.comparable_groups
      VALIDATE CONSTRAINT comparable_groups_subcategory_id_fkey;
  ELSE
    SELECT
      constraint_row.conname,
      constraint_row.confupdtype,
      constraint_row.confdeltype,
      constraint_row.confmatchtype,
      constraint_row.condeferrable,
      constraint_row.condeferred,
      constraint_row.convalidated
    INTO v_fk
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.comparable_groups'::regclass
      AND constraint_row.contype = 'f'
      AND constraint_row.conkey = ARRAY[v_group_subcategory_attnum]::smallint[]
      AND constraint_row.confrelid = 'public.subcategories'::regclass
      AND constraint_row.confkey = ARRAY[v_subcategory_id_attnum]::smallint[];

    IF v_fk.confupdtype <> 'a'
      OR v_fk.confmatchtype <> 's'
      OR v_fk.condeferrable
      OR v_fk.condeferred
    THEN
      RAISE EXCEPTION
        'Existing comparable_groups foreign key has non-default update, match, or deferrability behavior; review before changing it';
    END IF;

    IF v_fk.confdeltype = 'c' THEN
      EXECUTE format(
        'ALTER TABLE public.comparable_groups DROP CONSTRAINT %I',
        v_fk.conname
      );
      EXECUTE format(
        'ALTER TABLE public.comparable_groups ADD CONSTRAINT %I FOREIGN KEY (subcategory_id) REFERENCES public.subcategories (id) ON DELETE RESTRICT NOT VALID',
        v_fk.conname
      );
      EXECUTE format(
        'ALTER TABLE public.comparable_groups VALIDATE CONSTRAINT %I',
        v_fk.conname
      );
    ELSIF v_fk.confdeltype IN ('r', 'a') THEN
      IF NOT v_fk.convalidated THEN
        EXECUTE format(
          'ALTER TABLE public.comparable_groups VALIDATE CONSTRAINT %I',
          v_fk.conname
        );
      END IF;
    ELSE
      RAISE EXCEPTION
        'Existing comparable_groups foreign key has unsupported ON DELETE action; expected CASCADE, RESTRICT, or NO ACTION';
    END IF;
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.delete_catalog_subcategory(
  p_subcategory_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_product_count bigint;
  v_comparable_group_count bigint;
BEGIN
  PERFORM 1
  FROM public.subcategories
  WHERE id = p_subcategory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT count(*)
  INTO v_product_count
  FROM public.products
  WHERE subcategory_id = p_subcategory_id;

  SELECT count(*)
  INTO v_comparable_group_count
  FROM public.comparable_groups
  WHERE subcategory_id = p_subcategory_id;

  IF v_product_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'products_associated',
      'product_count', v_product_count,
      'comparable_group_count', v_comparable_group_count
    );
  END IF;

  IF v_comparable_group_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'comparable_groups_associated',
      'comparable_group_count', v_comparable_group_count
    );
  END IF;

  DELETE FROM public.subcategories
  WHERE id = p_subcategory_id;

  RETURN jsonb_build_object('status', 'deleted');
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_catalog_subcategory(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_catalog_subcategory(uuid)
  TO service_role;

COMMIT;
