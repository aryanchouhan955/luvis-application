
-- 1. ROOMS: restrict SELECT to creator or participants
DROP POLICY IF EXISTS "Rooms viewable by authenticated users" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone authenticated can view rooms" ON public.rooms;

CREATE POLICY "Rooms viewable by creator or participants"
ON public.rooms
FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.room_participants rp
    WHERE rp.room_id = rooms.id AND rp.user_id = auth.uid()
  )
);

-- 2. CHALLENGES: restrict SELECT to creator only
DROP POLICY IF EXISTS "Challenges viewable by authenticated users" ON public.challenges;
DROP POLICY IF EXISTS "Authenticated users can view challenges" ON public.challenges;
DROP POLICY IF EXISTS "Anyone authenticated can view challenges" ON public.challenges;

CREATE POLICY "Challenges viewable by creator"
ON public.challenges
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

-- 3. QUIZ_QUESTIONS: restrict SELECT to challenge creator
DROP POLICY IF EXISTS "Quiz questions viewable by authenticated users" ON public.quiz_questions;
DROP POLICY IF EXISTS "Authenticated users can view quiz questions" ON public.quiz_questions;

CREATE POLICY "Quiz questions viewable by challenge creator"
ON public.quiz_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.id = quiz_questions.challenge_id AND c.created_by = auth.uid()
  )
);

-- 4. QUIZ_SCORES: restrict SELECT to own + same-challenge participants
CREATE OR REPLACE FUNCTION public.user_participated_in_challenge(_challenge_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quiz_scores
    WHERE challenge_id = _challenge_id AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Quiz scores viewable by authenticated users" ON public.quiz_scores;
DROP POLICY IF EXISTS "Authenticated users can view quiz scores" ON public.quiz_scores;
DROP POLICY IF EXISTS "Anyone authenticated can view quiz scores" ON public.quiz_scores;

CREATE POLICY "Quiz scores viewable by self or co-participants"
ON public.quiz_scores
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.user_participated_in_challenge(challenge_id)
);

-- 5. RPC: get a challenge session (meta + questions WITHOUT correct answers)
CREATE OR REPLACE FUNCTION public.get_challenge_session(_challenge_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chal public.challenges%ROWTYPE;
  v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_chal FROM public.challenges
   WHERE challenge_id = _challenge_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'question_text', q.question_text,
    'question_type', q.question_type,
    'options', q.options
  )), '[]'::jsonb)
  INTO v_questions
  FROM public.quiz_questions q
  WHERE q.challenge_id = v_chal.id;

  RETURN jsonb_build_object(
    'success', true,
    'challenge', jsonb_build_object(
      'id', v_chal.id,
      'challenge_id', v_chal.challenge_id,
      'timer_seconds', v_chal.timer_seconds,
      'question_count', v_chal.question_count
    ),
    'questions', v_questions
  );
END;
$$;

-- 6. RPC: grade a single submitted answer server-side
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(_question_id uuid, _user_answer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.quiz_questions%ROWTYPE;
  v_is_correct boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_q FROM public.quiz_questions WHERE id = _question_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_is_correct := LOWER(TRIM(COALESCE(_user_answer, ''))) = LOWER(TRIM(v_q.correct_answer));

  RETURN jsonb_build_object(
    'success', true,
    'is_correct', v_is_correct,
    'correct_answer', v_q.correct_answer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_challenge_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_session(text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_quiz_answer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.user_participated_in_challenge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_participated_in_challenge(uuid) TO authenticated;
