BEGIN;

CREATE TABLE IF NOT EXISTS public.shared_shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_shopping_list_members (
  list_id uuid NOT NULL REFERENCES public.shared_shopping_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.shared_shopping_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.shared_shopping_lists(id) ON DELETE CASCADE,
  product_id bigint REFERENCES public.products(id) ON DELETE SET NULL,
  item_name text NOT NULL CHECK (char_length(btrim(item_name)) BETWEEN 1 AND 160),
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 999),
  is_checked boolean NOT NULL DEFAULT false,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_shopping_list_members_user_idx
  ON public.shared_shopping_list_members(user_id, list_id);
CREATE INDEX IF NOT EXISTS shared_shopping_list_items_list_idx
  ON public.shared_shopping_list_items(list_id, created_at, id);

ALTER TABLE public.shared_shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_shopping_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_shared_shopping_list()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  affected_list_id uuid;
BEGIN
  affected_list_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.list_id ELSE NEW.list_id END;
  UPDATE public.shared_shopping_lists
  SET updated_at = now()
  WHERE id = affected_list_id;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS shared_shopping_list_items_touch_list
  ON public.shared_shopping_list_items;
CREATE TRIGGER shared_shopping_list_items_touch_list
AFTER INSERT OR UPDATE OR DELETE ON public.shared_shopping_list_items
FOR EACH ROW EXECUTE FUNCTION public.touch_shared_shopping_list();

COMMIT;
