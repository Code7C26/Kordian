BEGIN;

CREATE TABLE IF NOT EXISTS public.shared_shopping_list_activity_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL,
  list_name text NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  item_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT shared_shopping_list_activity_action_check
    CHECK (action IN ('item_added', 'item_updated', 'item_removed', 'member_removed', 'member_joined', 'member_left'))
);

CREATE INDEX IF NOT EXISTS shared_shopping_list_activity_inbox_idx
  ON public.shared_shopping_list_activity_notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.shared_shopping_list_activity_notifications ENABLE ROW LEVEL SECURITY;

COMMIT;
