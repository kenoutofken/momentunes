import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMemories } from "@/hooks/useMemories";
import { useAuth } from "@/contexts/AuthContext";
import AddMemoryForm from "@/components/AddMemoryForm";
import { Memory, MOODS, MEMORY_TYPES } from "@/types/memory";
import {
  Calendar,
  SlidersHorizontal,
  X,
  Search,
  Heart,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  UserPlus,
  UserCheck,
  MapPin,
} from "lucide-react";
import AISuggestDrawer from "@/components/AISuggestDrawer";
import FilterDrawer from "@/components/FilterDrawer";
import { useLikes } from "@/hooks/useLikes";
import { usePlaylist } from "@/hooks/usePlaylist";
import MiniPlayer from "@/components/MiniPlayer";
import BottomNav from "@/components/BottomNav";
import BrandMark from "@/components/BrandMark";
import AppBreadcrumbs from "@/components/AppBreadcrumbs";
import UserAvatar from "@/components/UserAvatar";
import AudioToggleButton from "@/components/AudioToggleButton";
import NotificationButton from "@/components/NotificationButton";
import MemoryDetailSheet from "@/components/MemoryDetailSheet";
import { parseISO, startOfMonth, endOfMonth } from "date-fns";
import { motion, type PanInfo } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMemoryTime } from "@/lib/memoryTime";
import { matchesLocationFilter } from "@/lib/locationFilter";
import type { LocationResult } from "@/components/LocationSearch";

const SWIPE_THRESHOLD = 60;
type FeedMode = "community" | "following";

interface ProfileResult {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type EngagementCounts = {
  likes: number;
  playlistAdds: number;
};

const MOOD_GRADIENTS: Record<string, string> = {
  Joyful: "bg-gradient-to-br from-amber-300 to-orange-400",
  Melancholy: "bg-gradient-to-br from-slate-400 to-blue-500",
  Energized: "bg-gradient-to-br from-red-400 to-rose-500",
  Nostalgic: "bg-gradient-to-br from-indigo-400 to-purple-500",
  Peaceful: "bg-gradient-to-br from-pink-300 to-rose-300",
  Heartbreak: "bg-gradient-to-br from-rose-500 to-red-600",
  Inspired: "bg-gradient-to-br from-yellow-300 to-amber-400",
  Bittersweet: "bg-gradient-to-br from-orange-400 to-amber-600",
};

const getMoodGradient = (mood: string) => {
  const first = mood.split(",")[0].trim();
  const label =
    MOODS.find((m) => first.includes(m.label))?.label ?? "Nostalgic";
  return (
    MOOD_GRADIENTS[label] ??
    "bg-gradient-to-br from-muted to-muted-foreground/20"
  );
};

const getMoodParts = (mood: string) =>
  mood
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const getTrendingScore = (
  memory: Memory,
  engagement: EngagementCounts | undefined,
) => {
  const likes = engagement?.likes ?? 0;
  const playlistAdds = engagement?.playlistAdds ?? 0;
  const ageInDays = Math.max(
    0,
    (Date.now() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const freshnessBoost = Math.max(0, 10 - ageInDays) * 0.35;

  return likes * 1 + playlistAdds * 2.5 + freshnessBoost;
};

const topControlButtonClassName =
  "relative inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground/70 bg-card text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const topSearchInputClassName =
  "h-11 rounded-full border-2 border-foreground/70 bg-card pl-10 pr-10 text-foreground shadow-sm placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring";

const Discover = () => {
  const { addMemory } = useMemories();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [locationName, setLocationName] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [showAISuggest, setShowAISuggest] = useState(false);
  const [aiFilterIds, setAiFilterIds] = useState<string[] | null>(null);
  const [aiReason, setAiReason] = useState("");
  const [feedMode, setFeedMode] = useState<FeedMode>("community");
  const [profileFilter, setProfileFilter] = useState<{
    userId: string;
    username: string;
  } | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<ProfileResult[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [followSavingId, setFollowSavingId] = useState<string | null>(null);
  const [engagementByMemoryId, setEngagementByMemoryId] = useState<
    Record<string, EngagementCounts>
  >({});
  const isDraggingCardRef = useRef(false);

  useEffect(() => {
    const restore = (
      location.state as {
        restore?: {
          searchQuery?: string;
          selectedMoods?: string[];
          selectedTags?: string[];
          dateFilter?: string | null;
          locationName?: string;
          locationLat?: number | null;
          locationLng?: number | null;
          locationPlaceId?: string | null;
          currentIndex?: number;
          aiFilterIds?: string[] | null;
          aiReason?: string;
          feedMode?: FeedMode;
          profileFilter?: { userId: string; username: string } | null;
          scrollY?: number;
        };
      } | null
    )?.restore;

    if (!restore) return;

    setSearchQuery(restore.searchQuery ?? "");
    setSelectedMoods(
      Array.isArray(restore.selectedMoods) ? restore.selectedMoods : [],
    );
    setSelectedTags(
      Array.isArray(restore.selectedTags) ? restore.selectedTags : [],
    );
    setDateFilter(
      restore.dateFilter ? new Date(restore.dateFilter) : undefined,
    );
    setLocationName(restore.locationName ?? "");
    setLocationLat(restore.locationLat ?? null);
    setLocationLng(restore.locationLng ?? null);
    setLocationPlaceId(restore.locationPlaceId ?? null);
    setAiFilterIds(
      Array.isArray(restore.aiFilterIds)
        ? restore.aiFilterIds
        : (restore.aiFilterIds ?? null),
    );
    setAiReason(restore.aiReason ?? "");
    setFeedMode(restore.feedMode === "following" ? "following" : "community");
    setProfileFilter(restore.profileFilter ?? null);
    setCurrentIndex(
      typeof restore.currentIndex === "number" ? restore.currentIndex : 0,
    );

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: restore.scrollY ?? 0, behavior: "auto" });
    });
  }, [location.state]);

  // Tapping a creator filters the feed to that person's public memories and stores it in the URL.
  const showProfilePosts = (memory: Memory) => {
    if (!memory.userId || !memory.username) return;
    setProfileFilter({ userId: memory.userId, username: memory.username });
    setCurrentIndex(0);
    setSearchParams({ profile: memory.userId, username: memory.username });
  };

  const openMemoryDetail = (memory: Memory) => {
    setSelectedMemory(memory);
  };

  const clearProfileFilter = () => {
    setProfileFilter(null);
    setSearchParams({});
  };

  const showProfilePostsFromSheet = (memory: Memory) => {
    setSelectedMemory(null);
    showProfilePosts(memory);
  };

  const changeFeedMode = (nextMode: FeedMode) => {
    setFeedMode(nextMode);
    setProfileFilter(null);
    setCurrentIndex(0);
    setSearchParams({});
  };

  const fetchFollowing = useCallback(async () => {
    // Following IDs are cached as a Set because the feed checks membership often while filtering.
    if (!user) {
      setFollowingIds(new Set());
      return;
    }

    const { data, error } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);

    if (error) {
      console.error(error);
      return;
    }

    setFollowingIds(new Set((data ?? []).map((follow) => follow.following_id)));
  }, [user]);

  const toggleFollow = async (profile: {
    userId: string;
    username: string;
  }) => {
    // Follow/unfollow is optimistic in local state, then refreshed from Supabase for consistency.
    if (!user) {
      toast.error("Sign in before following people");
      return;
    }
    if (profile.userId === user.id) return;
    if (followSavingId === profile.userId) return;

    setFollowSavingId(profile.userId);
    const isFollowing = followingIds.has(profile.userId);
    const { error } = isFollowing
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", profile.userId)
      : await supabase
          .from("follows")
          .insert({ follower_id: user.id, following_id: profile.userId });

    if (error) {
      toast.error(error.message);
    } else {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.delete(profile.userId);
        else next.add(profile.userId);
        return next;
      });
      toast.success(
        isFollowing
          ? `Unfollowed @${profile.username}`
          : `Following @${profile.username}`,
      );
    }
    await fetchFollowing();
    setFollowSavingId(null);
  };

  const fetchPublic = useCallback(async () => {
    // Public memories and profile rows are fetched separately, then joined client-side for display cards.
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load discoveries");
      console.error(error);
    } else {
      const rows = data ?? [];
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter(Boolean)),
      );
      const { data: profiles, error: profilesError } =
        userIds.length > 0
          ? await supabase
              .from("profiles")
              .select("user_id, username, display_name, avatar_url")
              .in("user_id", userIds)
          : { data: [], error: null };

      if (profilesError) {
        console.error(profilesError);
      }

      const profilesByUserId = new Map(
        (profiles ?? []).map((profile) => [profile.user_id, profile]),
      );

      setMemories(
        rows.map((r) => {
          const profile = profilesByUserId.get(r.user_id);

          return {
            id: r.id,
            title: r.title,
            description: r.description ?? "",
            songTitle: r.song_title,
            artist: r.artist,
            date: r.date,
            memoryYear: r.memory_year ?? null,
            memorySeason: r.memory_season ?? null,
            locationName: r.location_name ?? null,
            locationLat: r.location_lat ?? null,
            locationLng: r.location_lng ?? null,
            locationPlaceId: r.location_place_id ?? null,
            mood: r.mood,
            people: r.people ?? [],
            isPublic: true,
            imageUrl: r.image_url ?? null,
            tags: r.tags ?? [],
            createdAt: r.created_at,
            userId: r.user_id,
            username: profile?.username ?? null,
            displayName: profile?.display_name ?? null,
            avatarUrl: profile?.avatar_url ?? null,
          };
        }),
      );
    }
    setLoading(false);
  }, []);

  const fetchEngagementCounts = useCallback(async (memoryIds: string[]) => {
    if (memoryIds.length === 0) {
      setEngagementByMemoryId({});
      return;
    }

    const [likesResult, playlistResult] = await Promise.all([
      supabase
        .from("memory_likes")
        .select("memory_id")
        .in("memory_id", memoryIds),
      supabase
        .from("playlist_songs")
        .select("memory_id")
        .in("memory_id", memoryIds),
    ]);

    if (likesResult.error || playlistResult.error) {
      console.error(likesResult.error ?? playlistResult.error);
      return;
    }

    const nextCounts: Record<string, EngagementCounts> = {};

    memoryIds.forEach((memoryId) => {
      nextCounts[memoryId] = { likes: 0, playlistAdds: 0 };
    });

    (likesResult.data ?? []).forEach((like) => {
      if (!like.memory_id) return;
      nextCounts[like.memory_id] ??= { likes: 0, playlistAdds: 0 };
      nextCounts[like.memory_id].likes += 1;
    });

    (playlistResult.data ?? []).forEach((entry) => {
      if (!entry.memory_id) return;
      nextCounts[entry.memory_id] ??= { likes: 0, playlistAdds: 0 };
      nextCounts[entry.memory_id].playlistAdds += 1;
    });

    setEngagementByMemoryId(nextCounts);
  }, []);

  useEffect(() => {
    fetchPublic();
  }, [fetchPublic]);

  useEffect(() => {
    fetchEngagementCounts(memories.map((memory) => memory.id));
  }, [fetchEngagementCounts, memories]);

  useEffect(() => {
    const profileUserId = searchParams.get("profile");
    const profileUsername = searchParams.get("username");

    if (profileUserId && profileUsername) {
      setProfileFilter({ userId: profileUserId, username: profileUsername });
      setCurrentIndex(0);
    }
  }, [searchParams]);

  useEffect(() => {
    const channel = supabase
      .channel("discover-public-feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "memories",
        },
        () => {
          fetchPublic();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        () => {
          fetchPublic();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "memory_likes",
        },
        () => {
          fetchEngagementCounts(memories.map((memory) => memory.id));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playlist_songs",
        },
        () => {
          fetchEngagementCounts(memories.map((memory) => memory.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEngagementCounts, fetchPublic, memories]);

  useEffect(() => {
    fetchFollowing();
  }, [fetchFollowing]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`discover-follows-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${user.id}`,
        },
        () => {
          fetchFollowing();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchFollowing]);

  useEffect(() => {
    if (!showUserSearch) return;
    const query = userSearch.trim().toLowerCase();

    if (query.length < 2) {
      setUserResults([]);
      return;
    }

    let cancelled = false;
    // Debounce profile search so typing does not fire a Supabase request for every keystroke.
    const timeout = window.setTimeout(async () => {
      setUserSearchLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .ilike("username", `%${query}%`)
        .limit(10);

      if (!cancelled) {
        if (error) {
          console.error(error);
          toast.error("Failed to search users");
        } else {
          setUserResults(
            (data ?? [])
              .filter(
                (profile) => profile.username && profile.user_id !== user?.id,
              )
              .map((profile) => ({
                userId: profile.user_id,
                username: profile.username!,
                displayName: profile.display_name,
                avatarUrl: profile.avatar_url,
              })),
          );
        }
        setUserSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [showUserSearch, userSearch, user]);

  const toggleMood = (mood: string) => {
    setSelectedMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood],
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedMoods([]);
    setSelectedTags([]);
    setDateFilter(undefined);
    setLocationName("");
    setLocationLat(null);
    setLocationLng(null);
    setLocationPlaceId(null);
    setAiFilterIds(null);
    setAiReason("");
    setProfileFilter(null);
  };

  const updateLocationFilter = (
    name: string,
    location?: LocationResult | null,
  ) => {
    setLocationName(name);

    if (location === null) {
      setLocationLat(null);
      setLocationLng(null);
      setLocationPlaceId(null);
      return;
    }

    if (location) {
      setLocationLat(location.lat);
      setLocationLng(location.lng);
      setLocationPlaceId(location.placeId);
    }
  };

  const trimmedSearchQuery = searchQuery.trim();
  const hasSearchQuery = trimmedSearchQuery.length > 0;
  const hasActiveFilters =
    hasSearchQuery ||
    selectedMoods.length > 0 ||
    selectedTags.length > 0 ||
    dateFilter ||
    locationName ||
    aiFilterIds !== null ||
    profileFilter !== null;

  const filtered = useMemo(() => {
    // Feed mode, AI suggestions, search, and manual filters all narrow the same public-memory list.
    let result = memories;
    if (profileFilter) {
      result = result.filter((m) => m.userId === profileFilter.userId);
    } else if (feedMode === "following") {
      result = result.filter((m) =>
        Boolean(m.userId && followingIds.has(m.userId)),
      );
    }
    // AI filter takes priority because its result order comes from the matching edge function.
    if (aiFilterIds !== null) {
      result = aiFilterIds
        .map((id) => result.find((m) => m.id === id))
        .filter(Boolean) as Memory[];
    }
    if (hasSearchQuery) {
      const q = trimmedSearchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.songTitle.toLowerCase().includes(q) ||
          m.artist.toLowerCase().includes(q) ||
          m.mood.toLowerCase().includes(q) ||
          (m.locationName?.toLowerCase().includes(q) ?? false) ||
          m.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          m.people.some((p) => p.toLowerCase().includes(q)),
      );
    }
    if (selectedMoods.length > 0) {
      result = result.filter((m) => {
        const memoryMoods = m.mood.split(",").map((s) => s.trim());
        return selectedMoods.some((sm) => memoryMoods.includes(sm));
      });
    }
    if (selectedTags.length > 0) {
      result = result.filter((m) =>
        selectedTags.some((tag) => m.tags.includes(tag)),
      );
    }
    if (dateFilter) {
      const start = startOfMonth(dateFilter);
      const end = endOfMonth(dateFilter);
      result = result.filter((m) => {
        const d = parseISO(m.date);
        return d >= start && d <= end;
      });
    }
    if (locationName) {
      result = result.filter((m) =>
        matchesLocationFilter(m, {
          name: locationName,
          lat: locationLat,
          lng: locationLng,
          placeId: locationPlaceId,
        }),
      );
    }

    if (!profileFilter && feedMode === "community" && aiFilterIds === null) {
      result = [...result].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    return result;
  }, [
    memories,
    profileFilter,
    feedMode,
    followingIds,
    hasSearchQuery,
    trimmedSearchQuery,
    selectedMoods,
    selectedTags,
    dateFilter,
    locationName,
    locationLat,
    locationLng,
    locationPlaceId,
    aiFilterIds,
    engagementByMemoryId,
  ]);

  // Reset the swipe deck to the first card when the active feed changes.
  useEffect(() => {
    setCurrentIndex(0);
  }, [
    searchQuery,
    selectedMoods,
    selectedTags,
    dateFilter,
    locationName,
    profileFilter,
    feedMode,
  ]);

  const memoryIds = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const { likeCounts, userLikes, toggleLike } = useLikes(memoryIds);
  const { songs, addSong, removeSong, isSongInPlaylist } = usePlaylist();

  const goNext = useCallback(() => {
    if (currentIndex < filtered.length - 1) {
      setDirection(1);
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, filtered.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    // Horizontal drag offsets act like next/previous buttons for the card deck.
    if (info.offset.x < -SWIPE_THRESHOLD) goNext();
    else if (info.offset.x > SWIPE_THRESHOLD) goPrev();
    window.setTimeout(() => {
      isDraggingCardRef.current = false;
    }, 0);
  };

  const currentMemory = filtered[currentIndex];
  const emptyTitle = hasActiveFilters
    ? "No matches"
    : feedMode === "following"
      ? "No followed memories yet"
      : "Nothing here yet";
  const emptyMessage = hasActiveFilters
    ? "Try adjusting your filters"
    : feedMode === "following"
      ? "Follow people to see their public memories here."
      : "Be the first to share a memory publicly!";

  const _ = direction; // used by swipe handlers

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark />
          </button>
          <div className="flex items-center gap-2">
            <NotificationButton />
            <AudioToggleButton />
            <UserAvatar />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-lg mx-auto w-full px-4 py-4 pb-24 flex flex-col">
        <div className="mb-4 flex items-center justify-between gap-3">
          <AppBreadcrumbs
            items={[{ label: "Discover" }]}
            className="mb-0 min-w-0"
          />
          {!profileFilter && (
            <div className="grid shrink-0 grid-cols-2 rounded-full border border-border bg-card p-1 shadow-sm">
              <button
                type="button"
                onClick={() => changeFeedMode("community")}
                title="Showing stories for everyone"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  feedMode === "community"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                Everyone
              </button>
              <button
                type="button"
                onClick={() => changeFeedMode("following")}
                title="Showing stories from people I've followed"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  feedMode === "following"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                Following
              </button>
            </div>
          )}
        </div>
        {/* Search and Filter Button */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Quick search memories…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={topSearchInputClassName}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <motion.button
            type="button"
            onClick={() => setShowAISuggest(true)}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={cn(
              topControlButtonClassName,
              "shrink-0",
              (showAISuggest || aiFilterIds !== null) &&
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            aria-label="AI suggest posts"
            title="AI Suggest posts"
          >
            <Sparkles size={16} />
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setShowUserSearch(true)}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={cn(
              topControlButtonClassName,
              "shrink-0",
              showUserSearch &&
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            aria-label="Find followers and users"
            title="Find users"
          >
            <UserPlus size={16} />
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setShowFilters(true)}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={cn(
              topControlButtonClassName,
              "shrink-0",
              showFilters &&
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            aria-label="Open filters"
          >
            <SlidersHorizontal size={16} />
            {selectedMoods.length +
              selectedTags.length +
              (dateFilter ? 1 : 0) +
              (locationName ? 1 : 0) >
              0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                {selectedMoods.length +
                  selectedTags.length +
                  (dateFilter ? 1 : 0) +
                  (locationName ? 1 : 0)}
              </span>
            )}
          </motion.button>
        </div>

        {/* AI filter banner */}
        {aiFilterIds !== null && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Sparkles size={14} className="text-primary shrink-0" />
            <p className="text-xs text-foreground flex-1">
              {aiReason || "Showing AI-curated results"}
            </p>
            <button
              onClick={() => {
                setAiFilterIds(null);
                setAiReason("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {profileFilter && (
          <div className="card-strong mb-3 flex items-center gap-2 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Viewing profile</p>
              <p className="text-sm font-medium text-foreground truncate">
                @{profileFilter.username}
              </p>
            </div>
            {user?.id !== profileFilter.userId && (
              <button
                onClick={() => toggleFollow(profileFilter)}
                disabled={followSavingId === profileFilter.userId}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  followingIds.has(profileFilter.userId)
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {followingIds.has(profileFilter.userId) ? "Unfollow" : "Follow"}
              </button>
            )}
            <button
              onClick={clearProfileFilter}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Card area */}
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-20">
            Loading discoveries...
          </p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">{hasActiveFilters ? "🔍" : "🌍"}</p>
            <h2 className="font-display text-lg font-semibold text-foreground mb-2">
              {emptyTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : profileFilter || hasSearchQuery ? (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pb-2">
            {filtered.map((mem) => {
              const moodParts = getMoodParts(mem.mood);
              const firstEmoji = moodParts[0]?.split(" ")[0] ?? "";

              return (
                <div
                  key={mem.id}
                  className="card-strong rounded-lg px-3 py-2.5 transition-all hover:shadow-sm cursor-pointer"
                  onClick={() => openMemoryDetail(mem)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg shrink-0">{firstEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {mem.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {mem.songTitle} — {mem.artist}
                      </p>
                      {moodParts.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {moodParts.slice(0, 2).map((mood) => (
                            <Badge
                              key={mood}
                              variant="secondary"
                              className="px-2 py-0 text-[10px] font-medium"
                            >
                              {mood}
                            </Badge>
                          ))}
                          {moodParts.length > 2 && (
                            <Badge
                              variant="outline"
                              className="px-2 py-0 text-[10px] font-medium text-muted-foreground"
                            >
                              +{moodParts.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                      {mem.locationName && (
                        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={10} className="shrink-0" />
                          <span className="min-w-0 truncate">
                            {mem.locationName}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="hidden xs:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Calendar size={11} />
                      <span>{formatMemoryTime(mem)}</span>
                    </div>
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          const wasLiked = userLikes.has(mem.id);
                          toggleLike(mem.id);
                          toast.success(
                            wasLiked ? "Removed like" : "Liked this memory!",
                          );
                        }}
                        className={cn(
                          "rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          userLikes.has(mem.id) && "text-foreground",
                        )}
                        aria-label={
                          userLikes.has(mem.id)
                            ? "Unlike memory"
                            : "Like memory"
                        }
                      >
                        <Heart
                          size={16}
                          className={
                            userLikes.has(mem.id) ? "fill-foreground" : ""
                          }
                        />
                      </button>
                      <button
                        onClick={() => {
                          const inList = isSongInPlaylist(
                            mem.songTitle,
                            mem.artist,
                          );
                          if (inList) {
                            const song = songs.find(
                              (s) =>
                                s.songTitle.toLowerCase() ===
                                  mem.songTitle.toLowerCase() &&
                                s.artist.toLowerCase() ===
                                  mem.artist.toLowerCase(),
                            );
                            if (song) {
                              removeSong(song.id);
                              toast.success("Removed from your playlist");
                            }
                          } else {
                            addSong(mem.songTitle, mem.artist, mem.id);
                            toast.success("Added to your playlist!");
                          }
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors",
                          isSongInPlaylist(mem.songTitle, mem.artist)
                            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        aria-label={
                          isSongInPlaylist(mem.songTitle, mem.artist)
                            ? "Remove from playlist"
                            : "Add to playlist"
                        }
                      >
                        {isSongInPlaylist(mem.songTitle, mem.artist) ? (
                          <Minus size={13} />
                        ) : (
                          <Plus size={13} />
                        )}
                        <span>Playlist</span>
                      </button>
                      <MiniPlayer
                        songTitle={mem.songTitle}
                        artist={mem.artist}
                        variant="compact"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden">
            {/* Carousel */}
            <div className="relative h-[clamp(320px,calc(100dvh-300px),620px)] overflow-hidden rounded-lg">
              <div
                className="flex h-full transition-transform duration-300 ease-out"
                style={{
                  transform: `translateX(-${currentIndex * 100}%)`,
                }}
              >
                {filtered.map((mem, i) => {
                  const moodParts = getMoodParts(mem.mood);

                  return (
                    <motion.div
                      key={mem.id}
                      className={cn(
                        "relative min-w-0 shrink-0 cursor-grab active:cursor-grabbing transition-opacity duration-300 h-full w-full overflow-hidden rounded-lg",
                        i === currentIndex ? "opacity-100" : "opacity-40",
                      )}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.4}
                      onClick={() => {
                        if (isDraggingCardRef.current) return;
                        openMemoryDetail(mem);
                      }}
                      onDragStart={() => {
                        isDraggingCardRef.current = true;
                      }}
                      onDragEnd={handleDragEnd}
                    >
                      <div
                        className={cn(
                          "absolute inset-0",
                          !mem.imageUrl && getMoodGradient(mem.mood),
                        )}
                      >
                        {mem.imageUrl && (
                          <img
                            src={mem.imageUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/50" />
                        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/88 via-black/45 to-transparent" />
                      </div>

                      {mem.locationName && (
                        <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-4.5rem)] min-w-0 overflow-hidden items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                          <MapPin size={12} className="shrink-0" />
                          <span className="block min-w-0 truncate">
                            {mem.locationName}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 z-20 min-w-0 space-y-4 p-4 text-white">
                        <div className="min-w-0">
                          {mem.username && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                showProfilePosts(mem);
                              }}
                              className="mb-2 w-fit rounded-full px-2 py-1 text-xs font-medium text-white/75 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                            >
                              @{mem.username}
                            </button>
                          )}
                          {moodParts.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {moodParts.slice(0, 3).map((mood) => (
                                <Badge
                                  key={mood}
                                  variant="secondary"
                                  className="border-white/15 bg-white/18 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm hover:bg-white/18"
                                >
                                  {mood}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <h3 className="min-w-0 max-w-full break-words font-display text-2xl font-semibold leading-tight">
                            {mem.title}
                          </h3>
                          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-white/72">
                            <Calendar size={12} />
                            <span>{formatMemoryTime(mem)}</span>
                          </div>
                        </div>

                        <MiniPlayer
                          songTitle={mem.songTitle}
                          artist={mem.artist}
                          autoPlay={i === currentIndex}
                          variant="overlay"
                        />

                        <div className="flex items-center justify-between gap-3">
                          <div className="flex shrink-0 items-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const wasLiked = userLikes.has(mem.id);
                                toggleLike(mem.id);
                                toast.success(
                                  wasLiked
                                    ? "Removed like"
                                    : "Liked this memory!",
                                );
                              }}
                              className={cn(
                                "flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full bg-black/55 px-3 text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                                userLikes.has(mem.id) && "text-white",
                              )}
                            >
                              <Heart
                                size={18}
                                className={
                                  userLikes.has(mem.id) ? "fill-white" : ""
                                }
                              />
                              {(likeCounts[mem.id] || 0) > 0 && (
                                <span className="text-xs">
                                  {likeCounts[mem.id]}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const inList = isSongInPlaylist(
                                  mem.songTitle,
                                  mem.artist,
                                );
                                if (inList) {
                                  const song = songs.find(
                                    (s) =>
                                      s.songTitle.toLowerCase() ===
                                        mem.songTitle.toLowerCase() &&
                                      s.artist.toLowerCase() ===
                                        mem.artist.toLowerCase(),
                                  );
                                  if (song) {
                                    removeSong(song.id);
                                    toast.success("Removed from your playlist");
                                  }
                                } else {
                                  addSong(mem.songTitle, mem.artist, mem.id);
                                  toast.success("Added to your playlist!");
                                }
                              }}
                              className={cn(
                                "flex h-10 items-center justify-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-medium text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                                isSongInPlaylist(mem.songTitle, mem.artist) &&
                                  "text-white",
                              )}
                              aria-label={
                                isSongInPlaylist(mem.songTitle, mem.artist)
                                  ? "Remove from playlist"
                                  : "Add to playlist"
                              }
                            >
                              {isSongInPlaylist(mem.songTitle, mem.artist) ? (
                                <Minus size={16} />
                              ) : (
                                <Plus size={16} />
                              )}
                              <span>Playlist</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                goPrev();
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              disabled={currentIndex === 0}
                              className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-medium text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-35 disabled:hover:scale-100 disabled:hover:bg-black/55"
                            >
                              <ChevronLeft size={16} />
                              Prev
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                goNext();
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              disabled={currentIndex >= filtered.length - 1}
                              className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-medium text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-35 disabled:hover:scale-100 disabled:hover:bg-black/55"
                            >
                              Next
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav onNewMemory={() => setShowForm(true)} />

      {showForm && (
        <AddMemoryForm
          onAdd={async (data) => {
            const createdMemory = await addMemory(data);
            if (!createdMemory) return false;
            navigate(`/journal/memories/${createdMemory.id}`);
            return true;
          }}
          onClose={() => setShowForm(false)}
          editingMemory={null}
        />
      )}

      <Sheet open={showUserSearch} onOpenChange={setShowUserSearch}>
        <SheetContent
          side="bottom"
          className="mx-auto flex h-[85vh] w-full max-w-lg flex-col rounded-t-2xl p-0 sm:h-[70vh]"
        >
          <SheetHeader className="shrink-0 border-b border-border px-5 pb-3 pt-5 text-left">
            <SheetTitle className="font-display">Find Users</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search @username"
                className="pl-9"
              />
            </div>

            <div className="space-y-2">
              {userSearch.trim().length < 2 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Type at least 2 characters.
                </p>
              ) : userSearchLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Searching...
                </p>
              ) : userResults.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No users found.
                </p>
              ) : (
                userResults.map((profile) => (
                  <div
                    key={profile.userId}
                    className="card-strong flex items-center gap-3 rounded-lg px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setProfileFilter({
                          userId: profile.userId,
                          username: profile.username,
                        });
                        setShowUserSearch(false);
                        setCurrentIndex(0);
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        @{profile.username}
                      </p>
                      {profile.displayName && (
                        <p className="text-xs text-muted-foreground truncate">
                          {profile.displayName}
                        </p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFollow(profile)}
                      disabled={followSavingId === profile.userId}
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        followingIds.has(profile.userId)
                          ? "bg-muted text-foreground hover:bg-muted/80"
                          : "bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                    >
                      {followingIds.has(profile.userId) ? (
                        <span className="inline-flex items-center gap-1">
                          <UserCheck size={13} />
                          Following
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <UserPlus size={13} />
                          Follow
                        </span>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <AISuggestDrawer
        open={showAISuggest}
        onOpenChange={setShowAISuggest}
        onResults={(ids, reason) => {
          setAiFilterIds(ids);
          setAiReason(reason);
          setCurrentIndex(0);
        }}
      />
      <FilterDrawer
        open={showFilters}
        onOpenChange={setShowFilters}
        selectedMoods={selectedMoods}
        selectedTags={selectedTags}
        dateFilter={dateFilter}
        searchQuery={searchQuery}
        locationName={locationName}
        onToggleMood={toggleMood}
        onToggleTag={toggleTag}
        onDateFilterChange={setDateFilter}
        onLocationChange={updateLocationFilter}
        onClearFilters={clearFilters}
        onSearchChange={setSearchQuery}
      />
      <MemoryDetailSheet
        memory={selectedMemory}
        open={Boolean(selectedMemory)}
        onOpenChange={(open) => {
          if (!open) setSelectedMemory(null);
        }}
        source="discover"
        onShowProfile={showProfilePostsFromSheet}
      />
    </div>
  );
};

export default Discover;
