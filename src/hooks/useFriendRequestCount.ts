import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useFriendRequestCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  // Distinguishes concurrent hook instances (e.g. the map page and a detail
  // overlay mounted on top of it) so their realtime channels don't collide.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2));

  const fetchCount = useCallback(async () => {
    if (!user) { setCount(0); return; }
    const { count: pendingCount, error } = await supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("status", "pending");
    if (error) { console.error("Could not load friend request count", error); return; }
    setCount(pendingCount ?? 0);
  }, [user]);

  useEffect(() => { void fetchCount(); }, [fetchCount]);

  useEffect(() => {
    if (!user) return;
    // Realtime keeps the Friends nav badge in sync as requests arrive, get accepted, or get declined.
    const channel = supabase
      .channel(`friend-requests-${user.id}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `recipient_id=eq.${user.id}` },
        () => void fetchCount(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount, user]);

  return count;
}
