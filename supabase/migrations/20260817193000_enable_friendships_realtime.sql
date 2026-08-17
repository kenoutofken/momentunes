BEGIN;

-- Lets clients subscribe to postgres_changes on friendships (e.g. the Friends
-- nav badge, which listens for incoming requests being sent/accepted/declined).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END $$;

COMMIT;
