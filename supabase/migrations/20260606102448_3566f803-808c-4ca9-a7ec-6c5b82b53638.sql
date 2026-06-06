ALTER TABLE public.rooms ALTER COLUMN password_hash DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.join_room(_room_id text, _password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_uid  uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE room_id = _room_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_room.password_hash IS NOT NULL THEN
    IF _password IS NULL OR _password = ''
       OR extensions.crypt(_password, v_room.password_hash) <> v_room.password_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_password');
    END IF;
  END IF;

  INSERT INTO public.room_participants (room_id, user_id)
  SELECT v_room.id, v_uid
   WHERE NOT EXISTS (
     SELECT 1 FROM public.room_participants WHERE room_id = v_room.id AND user_id = v_uid
   );

  RETURN jsonb_build_object('success', true, 'room_id', v_room.room_id, 'has_password', v_room.password_hash IS NOT NULL);
END;
$function$;