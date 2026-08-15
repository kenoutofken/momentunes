import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Heart, Map as MapIcon, MapPin, MoreHorizontal, Music2, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useMemories } from "@/hooks/useMemories";
import type { Memory } from "@/types/memory";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import MiniPlayer from "@/components/MiniPlayer";
import MemoryPhotoGallery from "@/components/MemoryPhotoGallery";
import { useAuth } from "@/contexts/AuthContext";
import { AnimatePresence, motion } from "framer-motion";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Map, { Marker, type MapStyle } from "react-map-gl/maplibre";

const FAVORITES_KEY = "momentunes:favorite-memories";
const inspectorMapStyle = (apiKey?: string): MapStyle => ({
  version: 8,
  sources: { base: { type: "raster", tiles: [apiKey ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
  layers: [{ id: "base", type: "raster", source: "base", paint: { "raster-opacity": .66, "raster-saturation": -.5 } }],
});

const fallbackMemories: Memory[] = [
  { id: "demo-1", title: "Late night walk after grad", description: "", songTitle: "Dreams", artist: "Fleetwood Mac", date: "2025-05-24", locationName: "English Bay, Vancouver", mood: "Nostalgic", people: [], isPublic: false, imageUrl: "/landing/landing_01.png", tags: [], createdAt: "2025-05-24T20:00:00Z" },
  { id: "demo-2", title: "A sunset dinner with my friends", description: "", songTitle: "Sweet Disposition", artist: "The Temper Trap", date: "2025-04-18", locationName: "Lisbon, Portugal", mood: "Joyful", people: [], isPublic: false, imageUrl: "/landing/landing_02.png", tags: [], createdAt: "2025-04-18T20:00:00Z" },
  { id: "demo-3", title: "Windows down all the way home", description: "", songTitle: "Ribs", artist: "Lorde", date: "2025-03-09", locationName: "Sea to Sky Highway", mood: "Energized", people: [], isPublic: false, imageUrl: "/landing/landing_03.png", tags: [], createdAt: "2025-03-09T20:00:00Z" },
];

const MemoriesLibrary = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile: currentProfile } = useCurrentProfile();
  const [searchParams] = useSearchParams();
  const { memories, loading, addMemory, updateMemory, deleteMemory } = useMemories();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [year, setYear] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(() => searchParams.get("favorites") === "true");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); } catch { return new Set(); }
  });
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [inspectorMenuOpen, setInspectorMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const displayName = currentProfile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Your profile";
  const username = currentProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";
  const avatarUrl = currentProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const mapStyle = useMemo(() => inspectorMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY), []);

  const sourceMemories = memories.length ? memories : fallbackMemories;
  const years = useMemo(() => Array.from(new Set(sourceMemories.map((memory) => new Date(`${memory.date}T12:00:00`).getFullYear()))).sort((a, b) => b - a), [sourceMemories]);
  const filtered = useMemo(() => sourceMemories.filter((memory) => {
    const text = `${memory.title} ${memory.locationName ?? ""} ${memory.songTitle} ${memory.artist}`.toLowerCase();
    return text.includes(query.trim().toLowerCase())
      && (year === "all" || String(new Date(`${memory.date}T12:00:00`).getFullYear()) === year)
      && (!favoritesOnly || favorites.has(memory.id));
  }), [favorites, favoritesOnly, query, sourceMemories, year]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const openMemory = (memory: Memory) => {
    if (memory.id.startsWith("demo-")) return;
    if (window.matchMedia("(min-width: 900px)").matches) setSelectedMemory(memory);
    else navigate(`/journal/memories/${memory.id}`);
  };

  useEffect(() => window.scrollTo(0, 0), []);
  useEffect(() => {
    setFavoritesOnly(searchParams.get("favorites") === "true");
  }, [searchParams]);

  return <main className={`memories-library ${selectedMemory ? "has-library-inspector" : ""}`}>
    <aside className="desktop-map-sidebar desktop-library-sidebar">
      <button type="button" className="desktop-add-memory" onClick={() => setShowAddMemory(true)}><Plus /><span>Add memory</span></button>
      <nav className="desktop-map-nav"><button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button><button className="active"><Heart /><span>Memories</span></button><button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button></nav>
      <div className="desktop-account-wrap"><button className="desktop-account" onClick={() => navigate("/account")}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="account-initials">{displayName.slice(0,2).toUpperCase()}</span>}<span className="account-name"><strong>{displayName}</strong>{username && <small>@{username}</small>}</span></button></div>
    </aside>
    <div className="memories-library-shell">
      <header className="memories-header">
        <button type="button" className="memories-add-button" onClick={() => setShowAddMemory(true)}><Plus /><span>Add</span></button>
        <div className="memories-search mobile-memories-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories…" aria-label="Search memories" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</div>
        <button type="button" className={`memories-filter-button ${year !== "all" || favoritesOnly ? "active" : ""}`} onClick={() => setFiltersOpen(true)} aria-label="Filter memories"><SlidersHorizontal /></button>
      </header>

      <div className="memories-search-row">
        <div className="memories-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories…" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</div>
        <button type="button" className={`desktop-memories-filter ${year !== "all" || favoritesOnly ? "active" : ""}`} onClick={() => setFiltersOpen(true)} aria-label="Filter memories"><SlidersHorizontal /></button>
      </div>

      <section className="memory-list" aria-live="polite">
        {loading ? <p className="memories-empty">Loading your memories…</p> : filtered.length ? filtered.map((memory) => {
          const isFavorite = favorites.has(memory.id);
          const isSelected = selectedMemory?.id === memory.id;
          return <article key={memory.id} className={`memory-library-row ${isSelected ? "selected" : ""}`} aria-current={isSelected ? "true" : undefined} onClick={() => openMemory(memory)}>
            <img src={memory.imageUrl || "/landing/landing_02.png"} alt="" />
            <div className="memory-row-copy">
              <h2><span className="memory-row-quote" aria-hidden="true">“</span><span className="memory-row-title">{memory.title}</span></h2>
              <p><MapPin /> <span>{memory.locationName || "Somewhere special"}</span></p>
              <p><CalendarDays /> <span>{format(new Date(`${memory.date}T12:00:00`), "MMMM d, yyyy")}</span></p>
              <p><Music2 /> <span>{memory.songTitle} — {memory.artist}</span></p>
            </div>
            <button type="button" className={`memory-favorite ${isFavorite ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); toggleFavorite(memory.id); }} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}><Star fill={isFavorite ? "currentColor" : "none"} /></button>
          </article>;
        }) : <div className="memories-empty"><Search /><strong>No memories found</strong><span>Try changing your search or filters.</span></div>}
      </section>
    </div>

    <div className="memories-bottom-fade" aria-hidden="true" />

    <nav className="library-bottom-nav" aria-label="Primary navigation">
      <button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button>
      <button className="active"><Heart /><span>Memories</span></button>
      <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
    </nav>

    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
      <SheetContent side="bottom" className="memories-filter-sheet">
        <SheetHeader><SheetTitle>Filter memories</SheetTitle></SheetHeader>
        <div className="memory-filter-section"><label>Year</label><div className="filter-chips"><button className={year === "all" ? "active" : ""} onClick={() => setYear("all")}>All years</button>{years.map((item) => <button key={item} className={year === String(item) ? "active" : ""} onClick={() => setYear(String(item))}>{item}</button>)}</div></div>
        <label className="favorites-filter"><span><Star /> Favorites only</span><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></label>
        <button className="apply-memory-filters" onClick={() => setFiltersOpen(false)}>Show memories</button>
      </SheetContent>
    </Sheet>
    <QuickAddMemorySheet open={showAddMemory} onOpenChange={setShowAddMemory} onAdd={async (data) => Boolean(await addMemory({ ...data, tags: data.tags ?? [] }))} />
    <QuickAddMemorySheet open={Boolean(editingMemory)} editingMemory={editingMemory} onOpenChange={(open) => { if (!open) setEditingMemory(null); }} onAdd={async (data) => { if (!editingMemory) return false; const saved = await updateMemory(editingMemory.id, { ...data, tags: data.tags ?? [] }); if (saved) { setEditingMemory(null); setSelectedMemory((current) => current?.id === editingMemory.id ? { ...current, ...data, tags: data.tags ?? [] } : current); } return saved; }} />
    <AnimatePresence>{selectedMemory && <motion.aside className="library-memory-inspector" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={{ duration: .3, ease: [0.4,0,0.2,1] }}>
      <div className="library-inspector-scroll-area">
        <div className="desktop-inspector-media">
          <MemoryPhotoGallery memory={selectedMemory} />
          <div className="desktop-inspector-actions">
            <div className="desktop-inspector-menu-wrap">
              <button onClick={() => setInspectorMenuOpen((open) => !open)} aria-label="Memory actions"><MoreHorizontal /></button>
              {inspectorMenuOpen && <div className="desktop-inspector-menu"><button onClick={() => { setInspectorMenuOpen(false); setEditingMemory(selectedMemory); }}><Pencil />Edit memory</button><button className="danger" onClick={() => { setInspectorMenuOpen(false); setDeleteOpen(true); }}><Trash2 />Delete memory</button></div>}
            </div>
            <button onClick={() => { setInspectorMenuOpen(false); setSelectedMemory(null); }} aria-label="Close inspector"><X /></button>
          </div>
        </div>
        <div className="library-inspector-story">
          <div className="memory-title-row"><span className="memory-brand-quote" aria-hidden="true">“</span><h2>{selectedMemory.title}</h2></div>
          <button className="library-inspector-location" onClick={() => navigate(`/?memory=${selectedMemory.id}`)} disabled={typeof selectedMemory.locationLat !== "number" || typeof selectedMemory.locationLng !== "number"}>
            <div className="detail-map-preview">{typeof selectedMemory.locationLat === "number" && typeof selectedMemory.locationLng === "number" ? <Map key={`${selectedMemory.id}:${selectedMemory.locationLat}:${selectedMemory.locationLng}`} initialViewState={{ longitude: selectedMemory.locationLng, latitude: selectedMemory.locationLat, zoom: 11 }} mapStyle={mapStyle} interactive={false} attributionControl={false} style={{ width: "100%", height: "100%" }}><Marker longitude={selectedMemory.locationLng} latitude={selectedMemory.locationLat} anchor="bottom"><div className="detail-map-pin"><span aria-hidden="true">“</span></div></Marker></Map> : <MapPin />}</div>
            <div className="library-inspector-meta"><p><MapPin />{selectedMemory.locationName || "Somewhere special"}</p><p><CalendarDays />{format(new Date(`${selectedMemory.date}T12:00:00`), "MMMM d, yyyy")}</p></div>
          </button>
          <div className="inspector-player"><MiniPlayer key={`${selectedMemory.id}:${selectedMemory.songTitle}:${selectedMemory.artist}`} songTitle={selectedMemory.songTitle} artist={selectedMemory.artist} variant="map" /></div>
        </div>
      </div>
    </motion.aside>}</AnimatePresence>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this memory?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{selectedMemory?.title}.” This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!selectedMemory || selectedMemory.id.startsWith("demo-")) return; await deleteMemory(selectedMemory.id); setSelectedMemory(null); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
};

export default MemoriesLibrary;
