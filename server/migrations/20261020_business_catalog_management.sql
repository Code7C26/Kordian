ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS supermarket_id uuid;

CREATE INDEX IF NOT EXISTS customer_profiles_supermarket_id_idx
  ON public.customer_profiles(supermarket_id)
  WHERE supermarket_id IS NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_profiles_supermarket_id_fkey'
      AND conrelid = 'public.customer_profiles'::regclass
  ) THEN
    ALTER TABLE public.customer_profiles
      ADD CONSTRAINT customer_profiles_supermarket_id_fkey
      FOREIGN KEY (supermarket_id)
      REFERENCES public.supermarkets(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_profiles_business_store_only'
      AND conrelid = 'public.customer_profiles'::regclass
  ) THEN
    ALTER TABLE public.customer_profiles
      ADD CONSTRAINT customer_profiles_business_store_only
      CHECK (supermarket_id IS NULL OR role = 'business');
  END IF;
END;
$migration$;
