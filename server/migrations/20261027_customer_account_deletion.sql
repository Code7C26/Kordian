BEGIN;

ALTER TABLE public.price_reports
  DROP CONSTRAINT IF EXISTS price_reports_reporter_user_id_fkey;

ALTER TABLE public.price_reports
  ADD CONSTRAINT price_reports_reporter_user_id_fkey
  FOREIGN KEY (reporter_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

COMMIT;
