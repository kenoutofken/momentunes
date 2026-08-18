import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Clock, ContactRound, Heart, Map as MapIcon, MapPin, MoreHorizontal, Pencil, Share2, Trash2, UserPlus, UserRound } from "lucide-react";
import { format } from "date-fns";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import MiniPlayer from "@/components/MiniPlayer";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import PhotoLightbox from "@/components/PhotoLightbox";
import { useAuth } from "@/contexts/AuthContext";
import { useMemories } from "@/hooks/useMemories";
import { useFriendRequestCount } from "@/hooks/useFriendRequestCount";
import type { Memory } from "@/types/memory";
import { supabase } from "@/integrations/supabase/client";
import { shareMemory } from "@/lib/shareMemory";
import { shortLocation } from "@/lib/formatLocation";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type MemoryAccessInfo = {
  ownerId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  friendshipId: string | null;
  friendshipStatus: "accepted" | "pending_outgoing" | "pending_incoming" | "none";
};

// Static (non-WebGL) preview image, since this thumbnail is never interactive.
// A real MapLibre map here would open a second concurrent WebGL context on
// top of the map page underneath, which crashes on mobile GPUs.
// The section renders full-bleed, so request the image at its actual on-screen
// pixel size (capped) instead of a fixed thumbnail resolution, or it upscales and blurs.
const staticMapPreviewUrl = (lng: number, lat: number, apiKey?: string) => {
  if (!apiKey) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.min(Math.round(window.innerWidth * dpr), 1600);
  const height = Math.min(Math.round(420 * dpr), 900);
  return `https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=${width}&height=${height}&center=lonlat:${lng},${lat}&zoom=13&marker=lonlat:${lng},${lat};color:%23f31e78;size:medium&apiKey=${apiKey}`;
};

type MemoryDetailProps = {
  overlay?: boolean;
  memoryOverride?: Memory | null;
  onClose?: () => void;
  // When hosted as an overlay (e.g. on the map), edits/deletes must go through the host's own
  // useMemories() instance so its already-rendered list stays in sync — this component's own
  // hook instance has separate state that the host never sees.
  onDelete?: (id: string) => Promise<boolean>;
  onUpdate?: (id: string, data: Omit<Memory, "id" | "createdAt">) => Promise<boolean>;
};

const MemoryDetail = ({ overlay = false, memoryOverride = null, onClose, onDelete, onUpdate }: MemoryDetailProps) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const friendRequestCount = useFriendRequestCount();
  const { memories, loading, updateMemory: updateMemoryLocal, deleteMemory: deleteMemoryLocal } = useMemories();
  const updateMemory = onUpdate ?? updateMemoryLocal;
  const deleteMemory = onDelete ?? deleteMemoryLocal;
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [remoteMemory, setRemoteMemory] = useState<Memory | null>(null);
  const [accessInfo, setAccessInfo] = useState<MemoryAccessInfo | null>(null);
  const [resolvingAccess, setResolvingAccess] = useState(false);
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);
  const ownMemory = memoryOverride ?? memories.find((item) => item.id === id);
  const memory = ownMemory ?? remoteMemory;
  const isOwner = !memory?.userId || memory.userId === user?.id;
  const hasLocation = typeof memory?.locationLat === "number" && typeof memory?.locationLng === "number";
  const mapPreviewUrl = hasLocation ? staticMapPreviewUrl(memory!.locationLng!, memory!.locationLat!, import.meta.env.VITE_GEOAPIFY_API_KEY) : null;
  const memoryImages = memory ? memory.imageUrls?.length ? memory.imageUrls : [memory.imageUrl || "/landing/landing_02.png"] : [];

  const showImage = (index: number) => {
    setActiveImageIndex(index);
    setImageOpen(true);
  };

  useEffect(() => { if (!overlay) window.scrollTo(0, 0); }, [overlay]);

  useEffect(() => {
    if (!overlay || !onClose) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [onClose, overlay]);

  // A shared link can point at a memory the viewer doesn't own. Once their own
  // memories have finished loading and it's not among them, fall back to a
  // direct fetch (gated by the accepted-friends RLS policy), and if that comes
  // back empty, ask a RLS-bypassing RPC just enough to tell "doesn't exist"
  // from "you're not friends with the owner yet" without leaking the content.
  useEffect(() => {
    if (memoryOverride || ownMemory || !id || loading) { setRemoteMemory(null); setAccessInfo(null); return; }
    let cancelled = false;
    setResolvingAccess(true);
    (async () => {
      const { data: row } = await supabase.from("memories").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (row) {
        const { data: profile } = await supabase.from("profiles").select("username, display_name, avatar_url").eq("user_id", row.user_id).maybeSingle();
        if (cancelled) return;
        setRemoteMemory({
          id: row.id, userId: row.user_id, username: profile?.username, displayName: profile?.display_name, avatarUrl: profile?.avatar_url,
          title: row.title, description: row.description ?? "", songTitle: row.song_title, artist: row.artist, date: row.date,
          memoryYear: row.memory_year, memorySeason: row.memory_season, locationName: row.location_name, locationLat: row.location_lat, locationLng: row.location_lng, locationPlaceId: row.location_place_id,
          mood: row.mood, people: row.people ?? [], isPublic: row.is_public, imageUrl: row.image_url,
          imageUrls: row.image_urls?.length ? row.image_urls : row.image_url ? [row.image_url] : [],
          imageFocusPoints: row.image_focus_points?.length ? row.image_focus_points : undefined,
          tags: row.tags ?? [], createdAt: row.created_at,
        });
        setAccessInfo(null);
        setResolvingAccess(false);
        return;
      }
      const { data: info, error } = await supabase.rpc("get_memory_access_info", { target_memory_id: id }).maybeSingle();
      if (cancelled) return;
      if (error) console.error(error);
      setRemoteMemory(null);
      setAccessInfo(info ? {
        ownerId: info.owner_id, username: info.owner_username, displayName: info.owner_display_name, avatarUrl: info.owner_avatar_url,
        friendshipId: info.friendship_id, friendshipStatus: (info.friendship_status ?? "none") as MemoryAccessInfo["friendshipStatus"],
      } : null);
      setResolvingAccess(false);
    })();
    return () => { cancelled = true; };
  }, [id, loading, memoryOverride, ownMemory]);

  const sendFriendRequest = async () => {
    if (!user || !accessInfo) return;
    setSendingFriendRequest(true);
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, recipient_id: accessInfo.ownerId, status: "pending" });
    setSendingFriendRequest(false);
    if (error) { toast.error("Could not send friend request"); return; }
    toast.success("Friend request sent");
    setAccessInfo({ ...accessInfo, friendshipStatus: "pending_outgoing" });
  };

  const acceptFriendRequest = async () => {
    if (!accessInfo?.friendshipId) return;
    setSendingFriendRequest(true);
    const { error } = await supabase.rpc("accept_friend_request", { request_id: accessInfo.friendshipId });
    setSendingFriendRequest(false);
    if (error) { toast.error("Could not accept friend request"); return; }
    toast.success("You’re now friends!");
    setAccessInfo(null);
  };

  const handleShare = async () => {
    if (!memory) return;
    await shareMemory(memory);
    setMenuOpen(false);
  };

  const closeDetail = () => onClose ? onClose() : navigate(-1);

  if ((loading || resolvingAccess) && !memory) return <main className={`memory-detail-page ${overlay ? "memory-detail-overlay" : ""}`}><p className="detail-status">Loading memory…</p></main>;

  if (!memory && accessInfo) {
    const ownerName = accessInfo.displayName || (accessInfo.username ? `@${accessInfo.username}` : "This person");
    return <main className={`memory-detail-page ${overlay ? "memory-detail-overlay" : ""}`}>
      <div className="detail-status detail-access-gate">
        {accessInfo.avatarUrl ? <img src={accessInfo.avatarUrl} alt="" className="detail-access-avatar" /> : <span className="detail-access-avatar detail-access-initials">{(accessInfo.displayName || accessInfo.username || "?").slice(0, 2).toUpperCase()}</span>}
        <strong>You’re not friends with {ownerName} yet</strong>
        <span>Add {accessInfo.username ? `@${accessInfo.username}` : "them"} as a friend to see this memory.</span>
        {accessInfo.friendshipStatus === "pending_outgoing" && <button disabled><Clock size={16} />Friend request sent</button>}
        {accessInfo.friendshipStatus === "pending_incoming" && <button onClick={acceptFriendRequest} disabled={sendingFriendRequest}><UserPlus size={16} />{sendingFriendRequest ? "Accepting…" : "Accept their friend request"}</button>}
        {accessInfo.friendshipStatus === "none" && <button onClick={sendFriendRequest} disabled={sendingFriendRequest}><UserPlus size={16} />{sendingFriendRequest ? "Sending…" : "Send friend request"}</button>}
        <button className="detail-access-back" onClick={() => overlay ? navigate(-1) : navigate("/journal")}>Back to memories</button>
      </div>
    </main>;
  }

  if (!memory) return <main className={`memory-detail-page ${overlay ? "memory-detail-overlay" : ""}`}><div className="detail-status"><strong>Memory not found</strong><button onClick={() => overlay ? navigate(-1) : navigate("/journal")}>Back to memories</button></div></main>;

  return <main className={`memory-detail-page ${overlay ? "memory-detail-overlay" : ""}`} role={overlay ? "dialog" : undefined} aria-modal={overlay || undefined}>
    <div className="memory-detail-shell">
      <header className="memory-detail-toolbar">
        <button autoFocus={overlay} onClick={closeDetail} aria-label="Close memory details"><ArrowLeft /></button>
        <div className="detail-menu-wrap">
          <button onClick={() => setMenuOpen((open) => !open)} aria-label="Memory options"><MoreHorizontal /></button>
          {menuOpen && <div className="detail-overflow-menu">
            {isOwner && <button onClick={() => { setEditing(memory); setMenuOpen(false); }}><Pencil />Edit memory</button>}
            <button onClick={handleShare}><Share2 />Share</button>
            {isOwner && <button className="danger" onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}><Trash2 />Delete</button>}
          </div>}
        </div>
      </header>

      <div className="detail-layout">
        <section className={`detail-media-grid detail-media-grid-${Math.min(memoryImages.length, 4)}`} aria-label={`${memoryImages.length} memory ${memoryImages.length === 1 ? "photo" : "photos"}`}>
          {memoryImages.slice(0, 4).map((image, index) => <button key={`${image}-${index}`} className="detail-hero" onClick={() => showImage(index)} aria-label={`View photo ${index + 1} of ${memoryImages.length} full size`}><img src={image} alt="" style={{ objectPosition: `${memory.imageFocusPoints?.[index]?.x ?? 50}% ${memory.imageFocusPoints?.[index]?.y ?? 50}%` }} />{index === 3 && memoryImages.length > 4 && <span className="detail-more-photos">+{memoryImages.length - 4}<small>more</small></span>}</button>)}
        </section>

        <div className="detail-info-panel">
          <section className="detail-header">
            <h1>{memory.title}</h1>
            <div className="detail-subheader">
              <p><MapPin /><span>{memory.locationName ? shortLocation(memory.locationName) : "No location saved"}</span></p>
              <p><CalendarDays /><span>{format(new Date(`${memory.date}T12:00:00`), "MMMM d, yyyy")}</span></p>
            </div>
          </section>

          <button className="detail-location-section" onClick={() => (overlay && location.pathname === "/") ? onClose?.() : navigate(`/?memory=${memory.id}`)} disabled={!hasLocation} aria-label={hasLocation ? "View this memory on the map" : "No location saved"}>
            {mapPreviewUrl ? <img src={mapPreviewUrl} alt="" /> : <div className="detail-map-empty"><MapPin /><span>No location saved</span></div>}
          </button>

          <section className="detail-music-card"><MiniPlayer songTitle={memory.songTitle} artist={memory.artist} variant="map" /></section>
        </div>
      </div>
    </div>

    <nav className="library-bottom-nav" aria-label="Primary navigation">
      <button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button>
      <button className="active" onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button>
      <button onClick={() => navigate("/friends")}><span className="nav-icon-wrap"><ContactRound />{friendRequestCount > 0 && <span className="nav-request-badge">{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>}</span><span>Friends</span></button>
      <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
    </nav>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this memory?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{memory.title}.” This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { await deleteMemory(memory.id); if (onClose) onClose(); else navigate("/journal", { replace: true }); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <PhotoLightbox images={memoryImages} index={activeImageIndex} title={memory.title} open={imageOpen} onOpenChange={setImageOpen} onIndexChange={setActiveImageIndex} />

    <QuickAddMemorySheet open={Boolean(editing)} editingMemory={editing} onOpenChange={(open) => { if (!open) setEditing(null); }} onAdd={async (data) => { if (!editing) return false; const saved = await updateMemory(editing.id, { ...data, tags: data.tags ?? [] }); if (saved) setEditing(null); return saved; }} />
  </main>;
};

export default MemoryDetail;
