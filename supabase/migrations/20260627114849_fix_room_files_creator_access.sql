-- Allow room creators to also interact with room_files
-- The original function only checked public.room_participants, but creators bypass that table.
CREATE OR REPLACE FUNCTION public.is_room_participant(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms WHERE id = _room_id AND created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.room_participants
    WHERE room_id = _room_id AND user_id = auth.uid()
  );
$$;
