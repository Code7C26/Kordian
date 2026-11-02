BEGIN;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS source_product_id text,
  ADD COLUMN IF NOT EXISTS source_sku text,
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE INDEX IF NOT EXISTS offers_carrefour_source_product_idx
  ON public.offers(source_product_id)
  WHERE supermarket = 'Carrefour' AND source_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.carrefour_sync_state (
  sync_key text PRIMARY KEY,
  last_offer_id integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carrefour_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.carrefour_sync_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.carrefour_sync_state TO service_role;

DROP POLICY IF EXISTS carrefour_sync_state_service_role ON public.carrefour_sync_state;
CREATE POLICY carrefour_sync_state_service_role
  ON public.carrefour_sync_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.carrefour_sync_state (sync_key, last_offer_id)
VALUES ('daily', NULL)
ON CONFLICT (sync_key) DO NOTHING;

COMMIT;
