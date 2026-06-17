
-- 1) Revoke direct read access to password hashes
REVOKE SELECT (password_hash) ON public.challenges FROM authenticated, anon;
REVOKE SELECT (password_hash) ON public.rooms FROM authenticated, anon;

-- 2) Lock down quiz_scores inserts; force going through a SECURITY DEFINER RPC
REVOKE INSERT ON public.quiz_scores FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.record_challenge_score(
  _challenge_id uuid,
  _score integer,
  _total_questions integer,
  _time_taken_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_row_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF _score IS NULL OR _total_questions IS NULL OR _score < 0
     OR _total_questions <= 0 OR _score > _total_questions THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.challenges WHERE id = _challenge_id AND is_active = true)
    INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.quiz_scores (challenge_id, user_id, score, total_questions, time_taken_seconds)
  VALUES (_challenge_id, v_uid, _score, _total_questions, GREATEST(COALESCE(_time_taken_seconds, 0), 0))
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object('success', true, 'id', v_row_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_challenge_score(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_challenge_score(uuid, integer, integer, integer) TO authenticated;
