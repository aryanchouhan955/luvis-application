
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash any existing plaintext passwords (bcrypt hashes start with $2)
UPDATE public.rooms
   SET password_hash = crypt(password_hash, gen_salt('bf'))
 WHERE password_hash IS NOT NULL AND password_hash NOT LIKE '$2%';

UPDATE public.challenges
   SET password_hash = crypt(password_hash, gen_salt('bf'))
 WHERE password_hash IS NOT NULL AND password_hash NOT LIKE '$2%';

-- Trigger function: hash password on insert/update if not already bcrypt
CREATE OR REPLACE FUNCTION public.hash_password_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hash_rooms_password ON public.rooms;
CREATE TRIGGER hash_rooms_password
  BEFORE INSERT OR UPDATE OF password_hash ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.hash_password_trigger();

DROP TRIGGER IF EXISTS hash_challenges_password ON public.challenges;
CREATE TRIGGER hash_challenges_password
  BEFORE INSERT OR UPDATE OF password_hash ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.hash_password_trigger();

-- Hide password_hash from the API by removing column-level SELECT
REVOKE SELECT (password_hash) ON public.rooms FROM authenticated, anon;
REVOKE SELECT (password_hash) ON public.challenges FROM authenticated, anon;

-- Remove the unrestricted room_participants insert policy.
-- Joining now goes exclusively through the join_room RPC (SECURITY DEFINER).
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_participants;

-- RPC: verify password and add caller as participant
CREATE OR REPLACE FUNCTION public.join_room(_room_id text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_uid  uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_room
    FROM public.rooms
   WHERE room_id = _room_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_room.password_hash IS NULL
     OR crypt(_password, v_room.password_hash) <> v_room.password_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_password');
  END IF;

  INSERT INTO public.room_participants (room_id, user_id)
  SELECT v_room.id, v_uid
   WHERE NOT EXISTS (
     SELECT 1 FROM public.room_participants
      WHERE room_id = v_room.id AND user_id = v_uid
   );

  RETURN jsonb_build_object('success', true, 'room_id', v_room.room_id);
END;
$$;

-- RPC: verify a challenge password (no participants table for challenges)
CREATE OR REPLACE FUNCTION public.verify_challenge_password(_challenge_id text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chal public.challenges%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_chal
    FROM public.challenges
   WHERE challenge_id = _challenge_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_chal.password_hash IS NULL
     OR crypt(_password, v_chal.password_hash) <> v_chal.password_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_password');
  END IF;

  RETURN jsonb_build_object('success', true, 'challenge_id', v_chal.challenge_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_challenge_password(text, text) TO authenticated;
