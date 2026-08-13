import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type CurrentProfile = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at?: string | null;
};

export const currentProfileKey = (userId?: string) => ["current-profile", userId] as const;

export function useCurrentProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: currentProfileKey(user?.id),
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("display_name, username, avatar_url, created_at").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as CurrentProfile | null;
    },
  });

  return {
    ...query,
    profile: query.data ?? null,
    setProfile: (profile: CurrentProfile | null) => queryClient.setQueryData(currentProfileKey(user?.id), profile),
  };
}
