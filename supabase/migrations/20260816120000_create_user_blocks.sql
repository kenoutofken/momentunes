CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_unique_pair UNIQUE (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their blocks" ON public.user_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users can block people" ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can unblock people" ON public.user_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);
