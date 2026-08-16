BEGIN;

-- Keep this migration self-contained for hosted projects that did not receive
-- the earlier user_blocks migration.
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_unique_pair UNIQUE (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their blocks" ON public.user_blocks;
CREATE POLICY "Users can view their blocks"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block people" ON public.user_blocks;
CREATE POLICY "Users can block people"
  ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock people" ON public.user_blocks;
CREATE POLICY "Users can unblock people"
  ON public.user_blocks FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT friendships_no_self_request CHECK (requester_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair_idx
  ON public.friendships (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships (requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_recipient_idx ON public.friendships (recipient_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.users_are_blocked(first_user UUID, second_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = first_user AND blocked_id = second_user)
       OR (blocker_id = second_user AND blocked_id = first_user)
  );
$$;

REVOKE ALL ON FUNCTION public.users_are_blocked(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_blocked(UUID, UUID) TO authenticated;

CREATE POLICY "Participants can view friendships"
  ON public.friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND status = 'pending'
    AND NOT public.users_are_blocked(requester_id, recipient_id)
  );

CREATE POLICY "Participants can end friendships or decline requests"
  ON public.friendships FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE accepted public.friendships;
BEGIN
  UPDATE public.friendships
  SET status = 'accepted', responded_at = now()
  WHERE id = request_id
    AND recipient_id = auth.uid()
    AND status = 'pending'
    AND NOT public.users_are_blocked(requester_id, recipient_id)
  RETURNING * INTO accepted;

  IF accepted.id IS NULL THEN
    RAISE EXCEPTION 'Friend request not found or cannot be accepted';
  END IF;
  RETURN accepted;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_friend_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_friendships_after_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.friendships
  WHERE (requester_id = NEW.blocker_id AND recipient_id = NEW.blocked_id)
     OR (requester_id = NEW.blocked_id AND recipient_id = NEW.blocker_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remove_friendships_after_block_trigger ON public.user_blocks;
CREATE TRIGGER remove_friendships_after_block_trigger
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION public.remove_friendships_after_block();

-- Existing follows were MVP test data. Reset them instead of silently converting
-- one-way follows into mutual friendships.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.notifications WHERE source_table = ''follows'' OR type = ''follow''';
  END IF;
END;
$$;
DELETE FROM public.follows;

-- Prevent legacy clients from creating new one-way relationships.
DROP POLICY IF EXISTS "Users can follow people" ON public.follows;

COMMIT;
