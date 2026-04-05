
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  study_hours NUMERIC NOT NULL DEFAULT 0,
  quiz_score NUMERIC NOT NULL DEFAULT 0,
  study_streak INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), COALESCE(NEW.raw_user_meta_data->>'username', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rooms table
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  timer_duration INTEGER NOT NULL DEFAULT 1500,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rooms viewable by authenticated" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create rooms" ON public.rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update rooms" ON public.rooms FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete rooms" ON public.rooms FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Room participants
CREATE TABLE public.room_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants viewable by authenticated" ON public.room_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join rooms" ON public.room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON public.room_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Challenges table
CREATE TABLE public.challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  timer_seconds INTEGER NOT NULL DEFAULT 300,
  question_type TEXT NOT NULL DEFAULT 'mcq',
  question_count INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Challenges viewable by authenticated" ON public.challenges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create challenges" ON public.challenges FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update challenges" ON public.challenges FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete challenges" ON public.challenges FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER update_challenges_updated_at BEFORE UPDATE ON public.challenges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Quiz questions
CREATE TABLE public.quiz_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'mcq',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions viewable by authenticated" ON public.quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Challenge creators can insert questions" ON public.quiz_questions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = quiz_questions.challenge_id AND c.created_by = auth.uid())
);

-- Quiz scores
CREATE TABLE public.quiz_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scores viewable by authenticated" ON public.quiz_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own scores" ON public.quiz_scores FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User stats (daily)
CREATE TABLE public.user_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  study_minutes INTEGER NOT NULL DEFAULT 0,
  quizzes_taken INTEGER NOT NULL DEFAULT 0,
  accuracy NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own stats" ON public.user_stats FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stats" ON public.user_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stats" ON public.user_stats FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON public.user_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
