import { useEffect, useMemo, useState } from "react";
import Map, { Marker, type MapStyle } from "react-map-gl/maplibre";
import { ArrowLeft, CalendarDays, ChevronRight, Heart, Map as MapIcon, MapPin, MoreHorizontal, Pencil, Share2, Trash2, UserRound } from "lucide-react";
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

const MemoryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { memories, loading, updateMemory, deleteMemory } = useMemories();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const memory = memories.find((item) => item.id === id);
  const mapStyle = useMemo(() => detailMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY), []);
  const hasLocation = typeof memory?.locationLat === "number" && typeof memory?.locationLng === "number";
  const memoryImages = memory ? memory.imageUrls?.length ? memory.imageUrls : [memory.imageUrl || "/landing/landing_02.png"] : [];

  useEffect(() => window.scrollTo(0, 0), []);

  const shareMemory = async () => {
    if (!memory) return;
    try {
      if (navigator.share) await navigator.share({ title: memory.title, text: `${memory.title} — ${memory.songTitle} by ${memory.artist}`, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); toast.success("Memory link copied"); }
    } catch (error) { if ((error as Error).name !== "AbortError") toast.error("Could not share memory"); }
    setMenuOpen(false);
  };

  if (loading) return <main className="memory-detail-page"><p className="detail-status">Loading memory…</p></main>;
  if (!memory) return <main className="memory-detail-page"><div className="detail-status"><strong>Memory not found</strong><button onClick={() => navigate("/journal")}>Back to memories</button></div></main>;

  return <main className="memory-detail-page">
    <div className="memory-detail-shell">
      <header className="memory-detail-toolbar">
        <button onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft /></button>
        <div className="detail-menu-wrap">
          <button onClick={() => setMenuOpen((open) => !open)} aria-label="Memory options"><MoreHorizontal /></button>
          {menuOpen && <div className="detail-overflow-menu">
            <button onClick={() => { setEditing(memory); setMenuOpen(false); }}><Pencil />Edit memory</button>
            <button onClick={shareMemory}><Share2 />Share</button>
            <button className="danger" onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}><Trash2 />Delete</button>
          </div>}
        </div>
      </header>

      <section className="detail-media-strip" aria-label="Memory media">
        {memoryImages.map((image, index) => <button key={`${image}-${index}`} className="detail-hero" onClick={() => { setActiveImage(image); setImageOpen(true); }} aria-label={`View photo ${index + 1} full size`}><img src={image} alt="" style={{ objectPosition: `${memory.imageFocusPoints?.[index]?.x ?? 50}% ${memory.imageFocusPoints?.[index]?.y ?? 50}%` }} /></button>)}
      </section>

      <section className="detail-title"><span aria-hidden="true">“</span><h1>{memory.title}</h1></section>

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
      <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
    </nav>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this memory?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{memory.title}.” This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { await deleteMemory(memory.id); navigate("/journal", { replace: true }); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <Dialog open={imageOpen} onOpenChange={setImageOpen}><DialogContent className="detail-image-lightbox"><DialogTitle className="sr-only">{memory.title} photo</DialogTitle><img src={activeImage || memoryImages[0]} alt={memory.title} /></DialogContent></Dialog>

    <QuickAddMemorySheet open={Boolean(editing)} editingMemory={editing} onOpenChange={(open) => { if (!open) setEditing(null); }} onAdd={async (data) => { if (!editing) return false; const saved = await updateMemory(editing.id, { ...data, tags: data.tags ?? [] }); if (saved) setEditing(null); return saved; }} />
  </main>;
};

export default MemoryDetail;
