
-- 1. quiz_scores: enforce RPC-only writes
REVOKE INSERT, UPDATE, DELETE ON public.quiz_scores FROM authenticated, anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_challenge_score(uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_challenge_score(uuid, integer, integer, integer) TO authenticated;

-- 2. Realtime channel scoping helper
CREATE OR REPLACE FUNCTION public.can_access_realtime_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match text[];
  v_uuid uuid;
  v_tail text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Allow Supabase-internal/system topics (postgres_changes etc.) - those are
  -- already filtered by table-level RLS.
  IF _topic IS NULL OR _topic = '' OR _topic LIKE 'realtime:%' THEN
    RETURN true;
  END IF;

  -- Match any UUID in the topic and check room participation by rooms.id
  v_match := regexp_match(_topic, '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})');
  IF v_match IS NOT NULL THEN
    BEGIN
      v_uuid := v_match[1]::uuid;
      IF EXISTS (
        SELECT 1 FROM public.room_participants
        WHERE room_id = v_uuid AND user_id = v_uid
      ) THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  -- Try last segment as a room code (rooms.room_id text)
  v_tail := regexp_replace(_topic, '^.*-', '');
  IF v_tail <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.rooms r
      JOIN public.room_participants rp ON rp.room_id = r.id
      WHERE r.room_id = v_tail AND rp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Try second segment as room code (e.g. cursors-<code>-<panel>, challenge-timer-<code>)
  v_match := regexp_match(_topic, '^[a-zA-Z]+-(?:[a-zA-Z]+-)?([^-]+)');
  IF v_match IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.rooms r
      JOIN public.room_participants rp ON rp.room_id = r.id
      WHERE r.room_id = v_match[1] AND rp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_realtime_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_realtime_topic(text) TO authenticated;

-- 3. RLS on realtime.messages restricting subscriptions/broadcasts
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Realtime participants can read" ON realtime.messages;
CREATE POLICY "Realtime participants can read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.can_access_realtime_topic((realtime.topic())::text));

DROP POLICY IF EXISTS "Realtime participants can broadcast" ON realtime.messages;
CREATE POLICY "Realtime participants can broadcast"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_realtime_topic((realtime.topic())::text));
