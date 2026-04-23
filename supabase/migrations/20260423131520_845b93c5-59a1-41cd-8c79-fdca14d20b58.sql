
-- 1. Add max_streak and last_study_date to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_study_date date;

-- 2. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_user_stats_user_date ON public.user_stats (user_id, date);
CREATE INDEX IF NOT EXISTS idx_profiles_ranking ON public.profiles (study_hours DESC, quiz_score DESC);

-- 3. RPC: record study minutes for today, update streak + totals atomically
CREATE OR REPLACE FUNCTION public.record_study_minutes(_minutes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := CURRENT_DATE;
  prev_date date;
  cur_streak integer;
  max_s integer;
  new_streak integer;
BEGIN
  IF uid IS NULL OR _minutes IS NULL OR _minutes <= 0 THEN
    RETURN;
  END IF;

  -- Upsert today's stats row
  INSERT INTO public.user_stats (user_id, date, study_minutes)
  VALUES (uid, today, _minutes)
  ON CONFLICT (user_id, date)
  DO UPDATE SET study_minutes = public.user_stats.study_minutes + EXCLUDED.study_minutes,
                updated_at = now();

  -- Read current streak info
  SELECT last_study_date, study_streak, COALESCE(max_streak, 0)
    INTO prev_date, cur_streak, max_s
  FROM public.profiles
  WHERE user_id = uid;

  IF prev_date IS NULL THEN
    new_streak := 1;
  ELSIF prev_date = today THEN
    new_streak := COALESCE(cur_streak, 1);
  ELSIF prev_date = today - INTERVAL '1 day' THEN
    new_streak := COALESCE(cur_streak, 0) + 1;
  ELSE
    new_streak := 1;
  END IF;

  UPDATE public.profiles
  SET study_streak = new_streak,
      max_streak = GREATEST(COALESCE(max_streak, 0), new_streak),
      last_study_date = today,
      study_hours = ROUND(
        (COALESCE(study_hours, 0) * 60 + _minutes) / 60.0
      , 2),
      updated_at = now()
  WHERE user_id = uid;
END;
$$;

-- 4. Add unique constraint for user_stats (user_id, date) so ON CONFLICT works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_stats_user_id_date_key'
  ) THEN
    ALTER TABLE public.user_stats
      ADD CONSTRAINT user_stats_user_id_date_key UNIQUE (user_id, date);
  END IF;
END$$;
