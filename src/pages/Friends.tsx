import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Ban, CalendarDays, Check, ContactRound, Heart, Loader2, Map as MapIcon, MapPin, MoreHorizontal, Plus, Search, UserCheck, UserMinus, UserPlus, UserRound, UsersRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useMemories } from "@/hooks/useMemories";
import { supabase } from "@/integrations/supabase/client";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Map, { Marker, NavigationControl, type MapRef, type MapStyle } from "react-map-gl/maplibre";
import type { Memory } from "@/types/memory";
import { format } from "date-fns";
import { useRef } from "react";
import MiniPlayer from "@/components/MiniPlayer";
import MemoryPhotoGallery from "@/components/MemoryPhotoGallery";

type FriendProfile = { userId: string; username: string; displayName: string | null; avatarUrl: string | null; followedAt?: string; friendshipId?: string };
type FriendRequest = FriendProfile & { requestId: string };
type SortMode = "name" | "recent";
const FRIEND_COLOR = "#3978d4";
const friendMapStyle = (apiKey?: string): MapStyle => ({
  version: 8,
  sources: { base: { type: "raster", tiles: [apiKey ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
  layers: [{ id: "base", type: "raster", source: "base", paint: { "raster-opacity": .7, "raster-saturation": -.45 } }],
});

const Friends = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile: currentProfile } = useCurrentProfile();
  const { addMemory } = useMemories();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequestIds, setOutgoingRequestIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<FriendProfile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<{ friend: FriendProfile; type: "remove" | "block" } | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);
  const [friendMemories, setFriendMemories] = useState<Memory[]>([]);
  const [friendMemoriesLoading, setFriendMemoriesLoading] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const friendMapRef = useRef<MapRef | null>(null);
  const mapStyle = useMemo(() => friendMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY), []);
  const displayName = currentProfile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Your profile";
  const username = currentProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";
  const avatarUrl = currentProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  const loadFriends = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: relationships, error } = await supabase.from("friendships").select("id, requester_id, recipient_id, status, created_at").or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);
      if (error) throw error;
      const rows = relationships ?? [];
      const ids = [...new Set(rows.map((relationship) => relationship.requester_id === user.id ? relationship.recipient_id : relationship.requester_id))];
      setOutgoingRequestIds(new Set(rows.filter((relationship) => relationship.status === "pending" && relationship.requester_id === user.id).map((relationship) => relationship.recipient_id)));
      if (!ids.length) { setFriends([]); setIncomingRequests([]); return; }
      const { data: profiles, error: profileError } = await supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", ids);
      if (profileError) throw profileError;
      const profileById = new globalThis.Map((profiles ?? []).filter((profile) => profile.username).map((profile) => [profile.user_id, profile]));
      setFriends(rows.filter((relationship) => relationship.status === "accepted").flatMap((relationship) => {
        const friendId = relationship.requester_id === user.id ? relationship.recipient_id : relationship.requester_id;
        const profile = profileById.get(friendId);
        return profile ? [{ userId: profile.user_id, username: profile.username!, displayName: profile.display_name, avatarUrl: profile.avatar_url, followedAt: relationship.created_at, friendshipId: relationship.id }] : [];
      }));
      setIncomingRequests(rows.filter((relationship) => relationship.status === "pending" && relationship.recipient_id === user.id).flatMap((relationship) => {
        const profile = profileById.get(relationship.requester_id);
        return profile ? [{ userId: profile.user_id, username: profile.username!, displayName: profile.display_name, avatarUrl: profile.avatar_url, requestId: relationship.id }] : [];
      }));
    } catch (error) {
      console.error("Could not load friends", error);
      setFriends([]);
      setIncomingRequests([]);
      toast.error("Could not load friends");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadFriends(); }, [loadFriends]);

  useEffect(() => {
    if (!user) return;
    void supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id).then(({ data }) => {
      setBlockedIds(new Set((data ?? []).map((block) => block.blocked_id)));
    });
  }, [user]);

  useEffect(() => {
    if (!addOpen || !user) return;
    const term = peopleQuery.trim();
    if (term.length < 2) { setPeople([]); return; }
    const timer = window.setTimeout(async () => {
      setPeopleLoading(true);
      const pattern = `%${term.replace(/[%_]/g, "")}%`;
      const { data, error } = await supabase.from("profiles").select("user_id, username, display_name, avatar_url").or(`username.ilike.${pattern},display_name.ilike.${pattern}`).limit(12);
      if (error) toast.error("Could not search people");
      setPeople((data ?? []).filter((profile) => profile.user_id !== user.id && profile.username && !blockedIds.has(profile.user_id)).map((profile) => ({ userId: profile.user_id, username: profile.username!, displayName: profile.display_name, avatarUrl: profile.avatar_url })));
      setPeopleLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [addOpen, blockedIds, peopleQuery, user]);

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.userId)), [friends]);
  const incomingRequestIds = useMemo(() => new Set(incomingRequests.map((request) => request.userId)), [incomingRequests]);
  const visibleFriends = useMemo(() => {
    const term = query.trim().toLowerCase();
    return friends.filter((friend) => `${friend.username} ${friend.displayName ?? ""}`.toLowerCase().includes(term)).sort((a, b) => sortMode === "recent" ? (b.followedAt ?? "").localeCompare(a.followedAt ?? "") : (a.displayName || a.username).localeCompare(b.displayName || b.username));
  }, [friends, query, sortMode]);

  useEffect(() => {
    if (loading || selectedFriend || !visibleFriends.length) return;
    setSelectedFriend(visibleFriends[0]);
  }, [loading, selectedFriend, visibleFriends]);

  useEffect(() => {
    if (!selectedFriend) { setFriendMemories([]); setSelectedMemory(null); return; }
    let cancelled = false;
    setFriendMemoriesLoading(true);
    setSelectedMemory(null);
    const loadFriendMemories = async () => {
      try {
        const { data, error } = await supabase.from("memories").select("*").eq("user_id", selectedFriend.userId).order("date", { ascending: false });
        if (error) throw error;
        if (cancelled) return;
        setFriendMemories((data ?? []).map((row): Memory => ({
          id: row.id, userId: row.user_id, username: selectedFriend.username, displayName: selectedFriend.displayName, avatarUrl: selectedFriend.avatarUrl,
          title: row.title, description: row.description ?? "", songTitle: row.song_title, artist: row.artist, date: row.date,
          memoryYear: row.memory_year, memorySeason: row.memory_season, locationName: row.location_name, locationLat: row.location_lat, locationLng: row.location_lng, locationPlaceId: row.location_place_id,
          mood: row.mood, people: row.people ?? [], isPublic: row.is_public, imageUrl: row.image_url, imageUrls: row.image_urls?.length ? row.image_urls : row.image_url ? [row.image_url] : [], tags: row.tags ?? [], createdAt: row.created_at,
        })));
      } catch (error) {
        if (cancelled) return;
        console.error(`Could not load @${selectedFriend.username}'s memories`, error);
        setFriendMemories([]);
        toast.error(`Could not load @${selectedFriend.username}'s memories`);
      } finally {
        if (!cancelled) setFriendMemoriesLoading(false);
      }
    };
    void loadFriendMemories();
    return () => { cancelled = true; };
  }, [selectedFriend]);

  useEffect(() => {
    const located = friendMemories.filter((memory) => typeof memory.locationLat === "number" && typeof memory.locationLng === "number");
    if (!located.length || !friendMapRef.current) return;
    const longitudes = located.map((memory) => memory.locationLng!);
    const latitudes = located.map((memory) => memory.locationLat!);
    window.setTimeout(() => friendMapRef.current?.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: 90, maxZoom: 11.5, duration: 700 }), 50);
  }, [friendMemories]);

  const addFriend = async (profile: FriendProfile) => {
    if (!user || friendIds.has(profile.userId) || outgoingRequestIds.has(profile.userId) || incomingRequestIds.has(profile.userId)) return;
    setSavingId(profile.userId);
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, recipient_id: profile.userId, status: "pending" });
    setSavingId(null);
    if (error) toast.error(error.message);
    else { toast.success(`Friend request sent to @${profile.username}`); await loadFriends(); }
  };

  const respondToRequest = async (request: FriendRequest, accept: boolean) => {
    setSavingId(request.userId);
    const { error } = accept
      ? await supabase.rpc("accept_friend_request", { request_id: request.requestId })
      : await supabase.from("friendships").delete().eq("id", request.requestId);
    setSavingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success(accept ? `You and @${request.username} are now friends` : `Declined @${request.username}'s request`);
      await loadFriends();
    }
  };

  const confirmFriendAction = async () => {
    if (!user || !pendingAction) return;
    const { friend, type } = pendingAction;
    setSavingId(friend.userId);
    const result = type === "block"
      ? await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: friend.userId })
      : await supabase.from("friendships").delete().eq("id", friend.friendshipId!);
    if (!result.error && type === "block") {
      setBlockedIds((current) => new Set(current).add(friend.userId));
    }
    setSavingId(null);
    setPendingAction(null);
    if (result.error) toast.error(result.error.message);
    else {
      setFriends((current) => current.filter((item) => item.userId !== friend.userId));
      if (selectedFriend?.userId === friend.userId) setSelectedFriend(null);
      toast.success(type === "block" ? `Blocked @${friend.username}` : `Removed @${friend.username}`);
    }
  };

  const openFriend = (friend: FriendProfile) => {
    if (window.matchMedia("(min-width: 900px)").matches) setSelectedFriend(friend);
    else navigate(`/?friend=${encodeURIComponent(friend.userId)}&username=${encodeURIComponent(friend.username)}`);
  };

  const friendRow = (friend: FriendProfile) => <article className={`friend-row ${selectedFriend?.userId === friend.userId ? "selected" : ""}`} aria-current={selectedFriend?.userId === friend.userId ? "true" : undefined} key={friend.userId} onClick={() => openFriend(friend)}>
    <button className="friend-identity" onClick={(event) => { event.stopPropagation(); openFriend(friend); }}>
      {friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.username.slice(0, 2).toUpperCase()}</span>}
      <div><strong>@{friend.username}</strong>{friend.displayName && <small>{friend.displayName}</small>}</div>
    </button>
    <button className="friend-map-button" onClick={(event) => { event.stopPropagation(); navigate(`/?friend=${encodeURIComponent(friend.userId)}&username=${encodeURIComponent(friend.username)}`); }}><MapIcon />View map</button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button className="friend-more-button" onClick={(event) => event.stopPropagation()} aria-label={`More actions for @${friend.username}`}><MoreHorizontal /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="friend-actions-menu">
        <DropdownMenuItem onSelect={() => setPendingAction({ friend, type: "remove" })}><UserMinus />Remove friend</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="friend-block-action" onSelect={() => setPendingAction({ friend, type: "block" })}><Ban />Block user</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </article>;

  const requestRow = (request: FriendRequest) => <article className="friend-request-row" key={request.requestId}>
    <div className="friend-request-identity">
      {request.avatarUrl ? <img src={request.avatarUrl} alt="" /> : <span>{request.username.slice(0, 2).toUpperCase()}</span>}
      <div><strong>@{request.username}</strong>{request.displayName && <small>{request.displayName}</small>}<em>Wants to be your friend</em></div>
    </div>
    <div className="friend-request-actions">
      <button className="accept" disabled={savingId === request.userId} onClick={() => void respondToRequest(request, true)} aria-label={`Accept @${request.username}'s friend request`} title="Accept request">{savingId === request.userId ? <Loader2 className="animate-spin" /> : <Check />}</button>
      <button className="decline" disabled={savingId === request.userId} onClick={() => void respondToRequest(request, false)} aria-label={`Decline @${request.username}'s friend request`} title="Decline request"><X /></button>
    </div>
  </article>;

  return <main className="friends-page">
    <aside className="desktop-map-sidebar desktop-library-sidebar">
      <button type="button" className="desktop-add-memory" onClick={() => setShowAddMemory(true)}><Plus /><span>Add memory</span></button>
      <nav className="desktop-map-nav"><button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button><button onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button><button className="active"><ContactRound /><span>Friends</span></button><button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button></nav>
      <div className="desktop-account-wrap"><button className="desktop-account" onClick={() => navigate("/account")}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="account-initials">{displayName.slice(0,2).toUpperCase()}</span>}<span className="account-name"><strong>{displayName}</strong>{username && <small>@{username}</small>}</span></button></div>
    </aside>

    <div className="friends-shell">
      <header className="friends-header">
        <button className="friends-add-button" aria-label="Add friend" title="Add friend" onClick={() => setAddOpen(true)}><UserPlus /></button>
        <div className="friends-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search friends…" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</div>
        <div className="friends-sort-wrap"><button className="friends-sort-button" onClick={() => setSortOpen((open) => !open)} aria-label="Sort friends"><ArrowUpDown /></button>{sortOpen && <div className="friends-sort-menu"><button onClick={() => { setSortMode("name"); setSortOpen(false); }}>{sortMode === "name" && <Check />}Name A–Z</button><button onClick={() => { setSortMode("recent"); setSortOpen(false); }}>{sortMode === "recent" && <Check />}Recently added</button></div>}</div>
      </header>
      <section className="friends-list" aria-live="polite">{loading ? <div className="friends-empty"><Loader2 className="animate-spin" />Loading friends…</div> : <>
        {!query && incomingRequests.length > 0 && <section className="friend-requests"><div className="friend-requests-heading"><strong>Friend requests</strong><span>{incomingRequests.length}</span></div>{incomingRequests.map(requestRow)}</section>}
        {visibleFriends.length ? visibleFriends.map(friendRow) : <div className="friends-empty"><UsersRound /><strong>{query ? "No friends found" : "Your people will appear here"}</strong><span>{query ? "Try a different search." : "Add friends and family to start sharing journeys."}</span>{!query && <button onClick={() => setAddOpen(true)}>Add your first friend</button>}</div>}
      </>}</section>
    </div>

    <aside className="friends-map-pane" aria-label={selectedFriend ? `${selectedFriend.username}'s memory map` : "Friend memory map"}>
      {selectedFriend ? <>
        <Map ref={friendMapRef} initialViewState={{ longitude: -123.08, latitude: 49.25, zoom: 8 }} mapStyle={mapStyle} attributionControl={false} style={{ width: "100%", height: "100%" }} onLoad={() => {
          const located = friendMemories.filter((memory) => typeof memory.locationLat === "number" && typeof memory.locationLng === "number");
          if (!located.length) return;
          const lng = located.map((memory) => memory.locationLng!); const lat = located.map((memory) => memory.locationLat!);
          friendMapRef.current?.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 90, maxZoom: 11.5 });
        }}>
          <NavigationControl position="bottom-right" showCompass={false} />
          {friendMemories.filter((memory) => typeof memory.locationLat === "number" && typeof memory.locationLng === "number").map((memory) => <Marker key={memory.id} longitude={memory.locationLng!} latitude={memory.locationLat!} anchor="bottom"><button type="button" className={`friends-map-pin ${selectedMemory?.id === memory.id ? "selected" : ""}`} style={{ backgroundColor: FRIEND_COLOR }} onClick={() => setSelectedMemory(memory)} aria-label={`View ${memory.title}`}><span>“</span></button></Marker>)}
        </Map>
        <div className="friends-map-owner">{selectedFriend.avatarUrl ? <img src={selectedFriend.avatarUrl} alt="" /> : <span>{selectedFriend.username.slice(0, 2).toUpperCase()}</span>}<div><strong>@{selectedFriend.username}</strong><small>{friendMemories.length} shared {friendMemories.length === 1 ? "memory" : "memories"}</small></div></div>
        {friendMemoriesLoading && <div className="friends-map-status"><Loader2 className="animate-spin" />Loading memories…</div>}
        {!friendMemoriesLoading && !friendMemories.some((memory) => typeof memory.locationLat === "number" && typeof memory.locationLng === "number") && <div className="friends-map-status"><MapPin /><strong>No shared locations yet</strong><span>@{selectedFriend.username}'s memories with locations will appear here.</span></div>}
        {selectedMemory && <article className="now-playing-memory friends-map-memory-preview">
          <div className="inspector-scroll-area">
            <div className="desktop-inspector-media">
              <MemoryPhotoGallery memory={selectedMemory} />
              <div className="desktop-inspector-actions"><span /><button type="button" onClick={() => setSelectedMemory(null)} aria-label="Close memory preview"><X /></button></div>
            </div>
            <div className="memory-story">
              <p className="memory-owner">{selectedFriend.avatarUrl ? <img src={selectedFriend.avatarUrl} alt="" /> : <span style={{ backgroundColor: FRIEND_COLOR }}>{selectedFriend.username.slice(0, 2).toUpperCase()}</span>}<strong>@{selectedFriend.username}</strong></p>
              <div className="memory-title-row"><h1>{selectedMemory.title}</h1></div>
              <div className="desktop-inspector-meta"><p><MapPin />{selectedMemory.locationName || "Shared location"}</p><p><CalendarDays />{format(new Date(`${selectedMemory.date}T12:00:00`), "MMMM d, yyyy")}</p></div>
              <div className="inspector-player"><MiniPlayer key={`${selectedMemory.id}:${selectedMemory.songTitle}:${selectedMemory.artist}`} songTitle={selectedMemory.songTitle} artist={selectedMemory.artist} variant="map" /></div>
            </div>
          </div>
        </article>}
      </> : <div className="friends-map-status"><UsersRound /><strong>Select a friend</strong><span>Their shared journey will appear here.</span></div>}
    </aside>

    <nav className="library-bottom-nav" aria-label="Primary navigation"><button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button><button onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button><button className="active"><ContactRound /><span>Friends</span></button><button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button></nav>

    <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setPeopleQuery(""); setPeople([]); } }}><DialogContent className="friends-add-dialog"><DialogHeader><DialogTitle>Add friend</DialogTitle><DialogDescription>Search by username or name to send a friend request.</DialogDescription></DialogHeader><div className="friends-people-search"><Search /><input autoFocus value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Search by username or name…" /></div><div className="friends-people-results">{peopleLoading ? <Loader2 className="animate-spin" /> : people.map((person) => { const isFriend = friendIds.has(person.userId); const isRequested = outgoingRequestIds.has(person.userId); const isIncoming = incomingRequestIds.has(person.userId); return <div key={person.userId}><span className="friend-search-avatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : person.username.slice(0,2).toUpperCase()}</span><span><strong>@{person.username}</strong>{person.displayName && <small>{person.displayName}</small>}</span><button disabled={isFriend || isRequested || isIncoming || savingId === person.userId} onClick={() => void addFriend(person)}>{savingId === person.userId ? <Loader2 className="animate-spin" /> : isFriend ? <><UserCheck />Friends</> : isRequested ? <><Check />Requested</> : isIncoming ? <><UserCheck />Respond above</> : <><UserPlus />Request</>}</button></div>; })}</div></DialogContent></Dialog>

    <QuickAddMemorySheet open={showAddMemory} onOpenChange={setShowAddMemory} onAdd={async (data) => Boolean(await addMemory({ ...data, tags: data.tags ?? [] }))} />

    <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open) setPendingAction(null); }}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>{pendingAction?.type === "block" ? `Block @${pendingAction.friend.username}?` : `Remove @${pendingAction?.friend.username}?`}</AlertDialogTitle><AlertDialogDescription>{pendingAction?.type === "block" ? "They will be removed from your friends, their memories will disappear from your map, and they will be hidden from people search." : "Their memories will no longer appear on your map. You can add them again later."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={Boolean(savingId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmFriendAction()}>{savingId ? <Loader2 className="animate-spin" /> : pendingAction?.type === "block" ? "Block user" : "Remove friend"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
};

export default Friends;
