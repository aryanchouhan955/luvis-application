
CREATE OR REPLACE FUNCTION public.hash_password_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $function$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash := extensions.crypt(NEW.password_hash, extensions.gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_room(_room_id text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  IF v_room.password_hash IS NULL
     OR extensions.crypt(_password, v_room.password_hash) <> v_room.password_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_password');
  END IF;

  INSERT INTO public.room_participants (room_id, user_id)
  SELECT v_room.id, v_uid
   WHERE NOT EXISTS (
     SELECT 1 FROM public.room_participants WHERE room_id = v_room.id AND user_id = v_uid
   );

  RETURN jsonb_build_object('success', true, 'room_id', v_room.room_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_challenge_password(_challenge_id text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_chal public.challenges%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_chal FROM public.challenges WHERE challenge_id = _challenge_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_chal.password_hash IS NULL
     OR extensions.crypt(_password, v_chal.password_hash) <> v_chal.password_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_password');
  END IF;

  RETURN jsonb_build_object('success', true, 'challenge_id', v_chal.challenge_id);
END;
$function$;
