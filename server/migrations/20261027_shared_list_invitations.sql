BEGIN;

DO $backfill$
DECLARE
  account RECORD;
  base_username text;
  candidate_username text;
  user_id_hex text;
  suffix_number integer;
BEGIN
  FOR account IN
    SELECT auth_user.id, auth_user.email, auth_user.raw_user_meta_data
    FROM auth.users AS auth_user
    LEFT JOIN public.customer_profiles AS profile ON profile.user_id = auth_user.id
    WHERE profile.user_id IS NULL
    ORDER BY auth_user.created_at, auth_user.id
  LOOP
    base_username := lower(regexp_replace(
      coalesce(
        account.raw_user_meta_data ->> 'username',
        split_part(coalesce(account.email, ''), '@', 1),
        'usuario'
      ),
      '[^A-Za-z0-9]',
      '',
      'g'
    ));
    IF base_username = '' THEN
      base_username := 'usuario';
    END IF;
    base_username := left(base_username, 32);
    candidate_username := base_username;

    IF EXISTS (
      SELECT 1
      FROM public.customer_profiles
      WHERE lower(username) = candidate_username
    ) THEN
      user_id_hex := replace(account.id::text, '-', '');
      suffix_number := 1;
      LOOP
        candidate_username :=
          left(base_username, 32 - 8 - length(suffix_number::text))
          || right(user_id_hex, 8)
          || suffix_number::text;
        EXIT WHEN NOT EXISTS (
          SELECT 1
          FROM public.customer_profiles
          WHERE lower(username) = candidate_username
        );
        suffix_number := suffix_number + 1;
      END LOOP;
    END IF;

    INSERT INTO public.customer_profiles (user_id, username, email)
    VALUES (account.id, candidate_username, coalesce(account.email, ''))
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END;
$backfill$;

CREATE TABLE IF NOT EXISTS public.shared_shopping_list_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.shared_shopping_lists(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT shared_shopping_list_invitation_distinct_users
    CHECK (inviter_user_id <> invitee_user_id)
);

ALTER TABLE public.shared_shopping_list_invitations
  DROP CONSTRAINT IF EXISTS shared_shopping_list_invitations_status_check;
ALTER TABLE public.shared_shopping_list_invitations
  ADD CONSTRAINT shared_shopping_list_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined'));

CREATE UNIQUE INDEX IF NOT EXISTS shared_shopping_list_pending_invitation_unique
  ON public.shared_shopping_list_invitations(list_id, invitee_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS shared_shopping_list_invitations_inbox_idx
  ON public.shared_shopping_list_invitations(invitee_user_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.shared_shopping_list_invitations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.accept_shared_shopping_list_invitation(
  invitation_id_input uuid,
  accepting_user_id_input uuid
)
RETURNS TABLE(list_id uuid, list_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  target_list_id uuid;
BEGIN
  SELECT invitation.list_id
  INTO target_list_id
  FROM public.shared_shopping_list_invitations AS invitation
  WHERE invitation.id = invitation_id_input
    AND invitation.invitee_user_id = accepting_user_id_input
    AND invitation.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already handled';
  END IF;

  INSERT INTO public.shared_shopping_list_members (list_id, user_id, role)
  VALUES (target_list_id, accepting_user_id_input, 'member')
  ON CONFLICT (list_id, user_id) DO NOTHING;

  UPDATE public.shared_shopping_list_invitations
  SET status = 'accepted', responded_at = now()
  WHERE id = invitation_id_input;

  RETURN QUERY
  SELECT list.id, list.name
  FROM public.shared_shopping_lists AS list
  WHERE list.id = target_list_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_shared_shopping_list_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_shared_shopping_list_invitation(uuid, uuid) TO service_role;

COMMIT;
