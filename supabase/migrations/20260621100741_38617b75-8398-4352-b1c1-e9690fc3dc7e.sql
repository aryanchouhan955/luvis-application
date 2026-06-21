
REVOKE SELECT (password_hash) ON public.challenges FROM authenticated, anon;

DROP POLICY IF EXISTS "Users can insert own scores" ON public.quiz_scores;
REVOKE INSERT ON public.quiz_scores FROM authenticated, anon;
