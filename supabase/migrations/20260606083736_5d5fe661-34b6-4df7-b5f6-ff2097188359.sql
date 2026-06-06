
-- Allow participants to read challenges they have taken (needed to show challenge_id on quiz history chart)
CREATE POLICY "Challenges viewable by participants"
ON public.challenges
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quiz_scores qs
    WHERE qs.challenge_id = challenges.id AND qs.user_id = auth.uid()
  )
);

-- Ranking RPC: users who signed in within the last 30 days, ordered by study_hours then quiz_score
CREATE OR REPLACE FUNCTION public.get_active_user_ranking()
RETURNS TABLE(user_id uuid, study_hours numeric, quiz_score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.study_hours, p.quiz_score
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.last_sign_in_at >= now() - INTERVAL '30 days'
  ORDER BY p.study_hours DESC NULLS LAST, p.quiz_score DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_active_user_ranking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_user_ranking() TO authenticated;
