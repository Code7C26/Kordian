BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform = 'android'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_push_tokens_user_id_idx
  ON public.customer_push_tokens(user_id);

ALTER TABLE public.customer_push_tokens ENABLE ROW LEVEL SECURITY;

COMMIT;
