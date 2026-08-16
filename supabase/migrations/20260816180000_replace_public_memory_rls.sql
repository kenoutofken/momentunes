BEGIN;

CREATE OR REPLACE FUNCTION public.are_accepted_friends(first_user UUID, second_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = first_user AND recipient_id = second_user)
        OR (requester_id = second_user AND recipient_id = first_user)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.are_accepted_friends(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_accepted_friends(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Anyone can view public memories" ON public.memories;
DROP POLICY IF EXISTS "Accepted friends can view memories" ON public.memories;
CREATE POLICY "Accepted friends can view memories"
  ON public.memories FOR SELECT TO authenticated
  USING (public.are_accepted_friends(auth.uid(), user_id));

-- The column is retained temporarily so older clients and generated types keep
-- working, but it no longer grants access and all legacy values are normalized.
UPDATE public.memories SET is_public = false WHERE is_public = true;
ALTER TABLE public.memories ALTER COLUMN is_public SET DEFAULT false;

DROP POLICY IF EXISTS "Anyone can view likes" ON public.memory_likes;
DROP POLICY IF EXISTS "Users can view accessible memory likes" ON public.memory_likes;
CREATE POLICY "Users can view accessible memory likes"
  ON public.memory_likes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memories
      WHERE memories.id = memory_likes.memory_id
    )
  );

DROP POLICY IF EXISTS "Users can like memories" ON public.memory_likes;
CREATE POLICY "Users can like accessible memories"
  ON public.memory_likes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.memories
      WHERE memories.id = memory_likes.memory_id
    )
  );

COMMIT;
