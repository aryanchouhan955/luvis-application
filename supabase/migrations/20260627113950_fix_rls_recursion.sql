-- Fix infinite recursion between rooms and room_participants policies

-- 1. Create a security definer function to check if the user is a room creator
-- This bypasses RLS on rooms, preventing the recursive policy loop.
CREATE OR REPLACE FUNCTION public.is_room_creator(check_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE id = check_room_id AND created_by = auth.uid()
  );
$$;

-- 2. Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_room_creator(uuid) TO authenticated;

-- 3. Replace the room_participants policy to use the new function
DROP POLICY IF EXISTS "Participants viewable by creator or self" ON public.room_participants;

CREATE POLICY "Participants viewable by creator or self"
ON public.room_participants
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_room_creator(room_id)
);
