import { useEffect, useMemo, useState } from "react";
import Map, { Marker, type MapStyle } from "react-map-gl/maplibre";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ContactRound, Heart, Map as MapIcon, MapPin, MoreHorizontal, Pencil, Share2, Trash2, UserRound } from "lucide-react";
import { format } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import MiniPlayer from "@/components/MiniPlayer";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import { useMemories } from "@/hooks/useMemories";
import type { Memory } from "@/types/memory";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const detailMapStyle = (apiKey?: string): MapStyle => ({
  version: 8,
  sources: { base: { type: "raster", tiles: [apiKey ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
  layers: [{ id: "base", type: "raster", source: "base", paint: { "raster-opacity": .66, "raster-saturation": -.5 } }],
});

type MemoryDetailProps = { overlay?: boolean; memoryOverride?: Memory | null; onClose?: () => void };

const MemoryDetail = ({ overlay = false, memoryOverride = null, onClose }: MemoryDetailProps) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { memories, loading, updateMemory, deleteMemory } = useMemories();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const memory = memoryOverride ?? memories.find((item) => item.id === id);
  const mapStyle = useMemo(() => detailMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY), []);
  const hasLocation = typeof memory?.locationLat === "number" && typeof memory?.locationLng === "number";
  const memoryImages = memory ? memory.imageUrls?.length ? memory.imageUrls : [memory.imageUrl || "/landing/landing_02.png"] : [];

  const showImage = (index: number) => {
    setActiveImageIndex(index);
    setImageOpen(true);
  };

  const moveImage = (direction: -1 | 1) => {
    setActiveImageIndex((current) => (current + direction + memoryImages.length) % memoryImages.length);
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

  useEffect(() => {
    if (!imageOpen || memoryImages.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setActiveImageIndex((current) => (current - 1 + memoryImages.length) % memoryImages.length);
      if (event.key === "ArrowRight") setActiveImageIndex((current) => (current + 1) % memoryImages.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageOpen, memoryImages.length]);

  const shareMemory = async () => {
    if (!memory) return;
    try {
      if (navigator.share) await navigator.share({ title: memory.title, text: `${memory.title} — ${memory.songTitle} by ${memory.artist}`, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); toast.success("Memory link copied"); }
    } catch (error) { if ((error as Error).name !== "AbortError") toast.error("Could not share memory"); }
    setMenuOpen(false);
  };

  const closeDetail = () => onClose ? onClose() : navigate(-1);

  if (loading && !memory) return <main className={`memory-detail-page ${overlay ? "memory-detail-overlay" : ""}`}><p className="detail-status">Loading memory…</p></main>;
  if (!memory) return <main className={`memory-detail-page ${overlay ? "memory-detail-overlay" : ""}`}><div className="detail-status"><strong>Memory not found</strong><button onClick={() => overlay ? navigate(-1) : navigate("/journal")}>Back to memories</button></div></main>;

  return <main className={`memory-detail-page ${overlay ? "memory-detail-overlay" : ""}`} role={overlay ? "dialog" : undefined} aria-modal={overlay || undefined}>
    <div className="memory-detail-shell">
      <header className="memory-detail-toolbar">
        <button autoFocus={overlay} onClick={closeDetail} aria-label="Close memory details"><ArrowLeft /></button>
        <div className="detail-menu-wrap">
          <button onClick={() => setMenuOpen((open) => !open)} aria-label="Memory options"><MoreHorizontal /></button>
          {menuOpen && <div className="detail-overflow-menu">
            <button onClick={() => { setEditing(memory); setMenuOpen(false); }}><Pencil />Edit memory</button>
            <button onClick={shareMemory}><Share2 />Share</button>
            <button className="danger" onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}><Trash2 />Delete</button>
          </div>}
        </div>
      </header>

      <section className={`detail-media-grid detail-media-grid-${Math.min(memoryImages.length, 4)}`} aria-label={`${memoryImages.length} memory ${memoryImages.length === 1 ? "photo" : "photos"}`}>
        {memoryImages.slice(0, 4).map((image, index) => <button key={`${image}-${index}`} className="detail-hero" onClick={() => showImage(index)} aria-label={`View photo ${index + 1} of ${memoryImages.length} full size`}><img src={image} alt="" style={{ objectPosition: `${memory.imageFocusPoints?.[index]?.x ?? 50}% ${memory.imageFocusPoints?.[index]?.y ?? 50}%` }} />{index === 3 && memoryImages.length > 4 && <span className="detail-more-photos">+{memoryImages.length - 4}<small>more</small></span>}</button>)}
      </section>

      <section className="detail-title"><h1>{memory.title}</h1></section>

      <button className="detail-location-card" onClick={() => navigate(`/?memory=${memory.id}`)} disabled={!hasLocation}>
        <div className="detail-map-preview">
          {hasLocation ? <Map initialViewState={{ longitude: memory.locationLng!, latitude: memory.locationLat!, zoom: 11 }} mapStyle={mapStyle} interactive={false} attributionControl={false} style={{ width: "100%", height: "100%" }}><Marker longitude={memory.locationLng!} latitude={memory.locationLat!} anchor="bottom"><div className="detail-map-pin"><span aria-hidden="true">“</span></div></Marker></Map> : <MapPin />}
        </div>
        <div className="detail-place-copy"><p><MapPin /><span>{memory.locationName || "No location saved"}</span></p><p><CalendarDays /><span>{format(new Date(`${memory.date}T12:00:00`), "MMMM d, yyyy")}</span></p></div>
        {hasLocation && <span className="see-on-map">See on map <ChevronRight /></span>}
      </button>

      <section className="detail-music-card"><MiniPlayer songTitle={memory.songTitle} artist={memory.artist} variant="map" /></section>
    </div>

    <nav className="library-bottom-nav" aria-label="Primary navigation">
      <button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button>
      <button className="active" onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button>
      <button onClick={() => navigate("/friends")}><ContactRound /><span>Friends</span></button>
      <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
    </nav>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this memory?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{memory.title}.” This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { await deleteMemory(memory.id); if (onClose) onClose(); else navigate("/journal", { replace: true }); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <Dialog open={imageOpen} onOpenChange={setImageOpen}><DialogContent className="detail-image-lightbox"><DialogTitle className="sr-only">{memory.title} photo {activeImageIndex + 1} of {memoryImages.length}</DialogTitle><div className="detail-lightbox-stage" onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)} onTouchEnd={(event) => { if (touchStartX === null) return; const distance = event.changedTouches[0].clientX - touchStartX; if (Math.abs(distance) > 45 && memoryImages.length > 1) moveImage(distance > 0 ? -1 : 1); setTouchStartX(null); }}><img src={memoryImages[activeImageIndex] || memoryImages[0]} alt={`${memory.title}, photo ${activeImageIndex + 1}`} />{memoryImages.length > 1 && <><button className="detail-lightbox-arrow previous" onClick={() => moveImage(-1)} aria-label="Previous photo"><ChevronLeft /></button><button className="detail-lightbox-arrow next" onClick={() => moveImage(1)} aria-label="Next photo"><ChevronRight /></button><span className="detail-lightbox-count" aria-live="polite">{activeImageIndex + 1} of {memoryImages.length}</span></>}</div></DialogContent></Dialog>

    <QuickAddMemorySheet open={Boolean(editing)} editingMemory={editing} onOpenChange={(open) => { if (!open) setEditing(null); }} onAdd={async (data) => { if (!editing) return false; const saved = await updateMemory(editing.id, { ...data, tags: data.tags ?? [] }); if (saved) setEditing(null); return saved; }} />
  </main>;
};

export default MemoryDetail;
