BEGIN;

-- Backs the "share a memory" flow: a shared link's recipient may not be an
-- accepted friend of the memory owner yet, so the normal RLS-gated SELECT on
-- memories returns nothing and the frontend can't tell "doesn't exist" apart
-- from "you don't have access" or show who to friend. This function bypasses
-- RLS to answer only that narrow question, without exposing the memory's
-- actual content (title, photos, song, location, etc.) to non-friends.
CREATE OR REPLACE FUNCTION public.get_memory_access_info(target_memory_id UUID)
RETURNS TABLE (
  owner_id UUID,
  owner_username TEXT,
  owner_display_name TEXT,
  owner_avatar_url TEXT,
  friendship_id UUID,
  friendship_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    f.id,
    CASE
      WHEN f.status = 'accepted' THEN 'accepted'
      WHEN f.status = 'pending' AND f.requester_id = auth.uid() THEN 'pending_outgoing'
      WHEN f.status = 'pending' AND f.recipient_id = auth.uid() THEN 'pending_incoming'
      ELSE 'none'
    END
  FROM public.memories m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  LEFT JOIN public.friendships f ON (
    (f.requester_id = auth.uid() AND f.recipient_id = m.user_id)
    OR (f.requester_id = m.user_id AND f.recipient_id = auth.uid())
  )
  WHERE m.id = target_memory_id;
$$;

REVOKE ALL ON FUNCTION public.get_memory_access_info(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_memory_access_info(UUID) TO authenticated;

COMMIT;
