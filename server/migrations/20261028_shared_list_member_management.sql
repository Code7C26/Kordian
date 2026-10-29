BEGIN;

CREATE OR REPLACE FUNCTION public.leave_shared_shopping_list(
  list_id_input uuid,
  leaving_user_id_input uuid
)
RETURNS TABLE(list_deleted boolean, transferred_to_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  leaving_role text;
  next_owner_user_id uuid;
BEGIN
  PERFORM 1
  FROM public.shared_shopping_lists
  WHERE id = list_id_input
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared list not found';
  END IF;

  SELECT role
  INTO leaving_role
  FROM public.shared_shopping_list_members
  WHERE list_id = list_id_input
    AND user_id = leaving_user_id_input
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of the shared list';
  END IF;

  IF leaving_role = 'owner' THEN
    SELECT user_id
    INTO next_owner_user_id
    FROM public.shared_shopping_list_members
    WHERE list_id = list_id_input
      AND user_id <> leaving_user_id_input
    ORDER BY joined_at ASC, user_id ASC
    LIMIT 1
    FOR UPDATE;

    IF next_owner_user_id IS NULL THEN
      DELETE FROM public.shared_shopping_lists
      WHERE id = list_id_input;

      RETURN QUERY SELECT true, NULL::uuid;
      RETURN;
    END IF;

    UPDATE public.shared_shopping_lists
    SET owner_user_id = next_owner_user_id
    WHERE id = list_id_input;

    UPDATE public.shared_shopping_list_members
    SET role = CASE
      WHEN user_id = next_owner_user_id THEN 'owner'
      ELSE 'member'
    END
    WHERE list_id = list_id_input
      AND (user_id = next_owner_user_id OR role = 'owner');
  END IF;

  DELETE FROM public.shared_shopping_list_members
  WHERE list_id = list_id_input
    AND user_id = leaving_user_id_input;

  RETURN QUERY SELECT false, next_owner_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.leave_shared_shopping_list(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_shared_shopping_list(uuid, uuid) TO service_role;

COMMIT;
