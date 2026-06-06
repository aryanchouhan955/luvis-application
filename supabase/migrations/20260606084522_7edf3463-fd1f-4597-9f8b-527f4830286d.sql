
-- Drop overly permissive SELECT policies
DROP POLICY IF EXISTS "Challenges viewable by authenticated" ON public.challenges;
DROP POLICY IF EXISTS "Questions viewable by authenticated" ON public.quiz_questions;
DROP POLICY IF EXISTS "Scores viewable by authenticated" ON public.quiz_scores;
DROP POLICY IF EXISTS "Rooms viewable by authenticated" ON public.rooms;
DROP POLICY IF EXISTS "Participants viewable by authenticated" ON public.room_participants;

-- Scoped policy for room_participants: creators and the participants themselves
CREATE POLICY "Participants viewable by creator or self"
ON public.room_participants
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_participants.room_id AND r.created_by = auth.uid()
  )
);

-- Lock down SECURITY DEFINER functions: remove anon/public execute; keep authenticated
REVOKE ALL ON FUNCTION public.join_room(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_challenge_password(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_quiz_answer(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_challenge_session(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_study_minutes(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_active_user_ranking() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_participated_in_challenge(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.join_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_challenge_password(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_challenge_session(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_study_minutes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_user_ranking() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_participated_in_challenge(uuid) TO authenticated;
