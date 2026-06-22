
CREATE TABLE public.room_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.room_files(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('file','folder')),
  language text,
  content text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX room_files_room_idx ON public.room_files(room_id);
CREATE INDEX room_files_parent_idx ON public.room_files(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_files TO authenticated;
GRANT ALL ON public.room_files TO service_role;

ALTER TABLE public.room_files ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_room_participant(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_participants
    WHERE room_id = _room_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Participants view room files"
  ON public.room_files FOR SELECT TO authenticated
  USING (public.is_room_participant(room_id));

CREATE POLICY "Participants create room files"
  ON public.room_files FOR INSERT TO authenticated
  WITH CHECK (public.is_room_participant(room_id));

CREATE POLICY "Participants update room files"
  ON public.room_files FOR UPDATE TO authenticated
  USING (public.is_room_participant(room_id))
  WITH CHECK (public.is_room_participant(room_id));

CREATE POLICY "Participants delete room files"
  ON public.room_files FOR DELETE TO authenticated
  USING (public.is_room_participant(room_id));

CREATE TRIGGER room_files_updated_at
  BEFORE UPDATE ON public.room_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_files;
