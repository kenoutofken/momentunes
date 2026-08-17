import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ContactRound, Heart, Map as MapIcon, MapPin, MoreHorizontal, Music2, Pencil, Plus, Search, Share2, SlidersHorizontal, Star, Trash2, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useMemories } from "@/hooks/useMemories";
import type { Memory } from "@/types/memory";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import MiniPlayer from "@/components/MiniPlayer";
import { useAuth } from "@/contexts/AuthContext";
import { AnimatePresence, motion } from "framer-motion";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useFriendRequestCount } from "@/hooks/useFriendRequestCount";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Map, { Marker, type MapStyle } from "react-map-gl/maplibre";
import MemoryDetail from "@/pages/MemoryDetail";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import MemoryPhotoGallery from "@/components/MemoryPhotoGallery";
import { shareMemory } from "@/lib/shareMemory";

const FAVORITES_KEY = "momentunes:favorite-memories";
const inspectorMapStyle = (apiKey?: string): MapStyle => ({
  version: 8,
  sources: { base: { type: "raster", tiles: [apiKey ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
  layers: [{ id: "base", type: "raster", source: "base", paint: { "raster-opacity": .66, "raster-saturation": -.5 } }],
});

const MemoriesLibrary = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile: currentProfile } = useCurrentProfile();
  const friendRequestCount = useFriendRequestCount();
  const [searchParams] = useSearchParams();
  const { memories, loading, addMemory, updateMemory, deleteMemory } = useMemories();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(() => searchParams.get("favorites") === "true");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); } catch { return new Set(); }
  });
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [detailMemory, setDetailMemory] = useState<Memory | null>(null);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [inspectorMenuOpen, setInspectorMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingMemory, setDeletingMemory] = useState<Memory | null>(null);
  const displayName = currentProfile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Your profile";
  const username = currentProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";
  const avatarUrl = currentProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const mapStyle = useMemo(() => inspectorMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY), []);

  const filtered = useMemo(() => memories.filter((memory) => {
    const text = `${memory.title} ${memory.locationName ?? ""} ${memory.songTitle} ${memory.artist}`.toLowerCase();
    const memoryYear = new Date(`${memory.date}T12:00:00`).getFullYear();
    return text.includes(query.trim().toLowerCase())
      && (!yearFrom || memoryYear >= Number(yearFrom))
      && (!yearTo || memoryYear <= Number(yearTo))
      && (!favoritesOnly || favorites.has(memory.id));
  }), [favorites, favoritesOnly, memories, query, yearFrom, yearTo]);

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
    if (window.matchMedia("(min-width: 900px)").matches) setSelectedMemory(memory);
    else setDetailMemory(memory);
  };

  useEffect(() => window.scrollTo(0, 0), []);
  useEffect(() => {
    setFavoritesOnly(searchParams.get("favorites") === "true");
  }, [searchParams]);

  useEffect(() => {
    if (loading || !window.matchMedia("(min-width: 900px)").matches) return;
    if (selectedMemory && filtered.some((memory) => memory.id === selectedMemory.id)) return;
    const latest = [...filtered].sort((a, b) => {
      const dateDifference = new Date(`${b.date}T12:00:00`).getTime() - new Date(`${a.date}T12:00:00`).getTime();
      return dateDifference || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })[0] ?? null;
    setSelectedMemory(latest);
  }, [filtered, loading, selectedMemory]);

  return <main className={`memories-library ${selectedMemory ? "has-library-inspector" : ""}`}>
    <aside className="desktop-map-sidebar desktop-library-sidebar">
      <button type="button" className="desktop-add-memory" onClick={() => setShowAddMemory(true)}><Plus /><span>Add memory</span></button>
      <nav className="desktop-map-nav"><button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button><button className="active"><Heart /><span>Memories</span></button><button onClick={() => navigate("/friends")}><span className="nav-icon-wrap"><ContactRound />{friendRequestCount > 0 && <span className="nav-request-badge">{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>}</span><span>Friends</span></button><button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button></nav>
      <div className="desktop-account-wrap"><button className="desktop-account" onClick={() => navigate("/account")}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="account-initials">{displayName.slice(0,2).toUpperCase()}</span>}<span className="account-name"><strong>{displayName}</strong>{username && <small>@{username}</small>}</span></button></div>
    </aside>
    <div className="memories-library-shell">
      <header className="memories-header">
        <button type="button" className="memories-add-button" onClick={() => setShowAddMemory(true)}><Plus /><span>Add</span></button>
        <div className="memories-search mobile-memories-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories…" aria-label="Search memories" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</div>
        <button type="button" className={`memories-filter-button ${yearFrom || yearTo || favoritesOnly ? "active" : ""}`} onClick={() => setFiltersOpen(true)} aria-label="Filter memories"><SlidersHorizontal /></button>
      </header>

      <div className="memories-search-row">
        <div className="memories-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories…" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</div>
        <button type="button" className={`desktop-memories-filter ${yearFrom || yearTo || favoritesOnly ? "active" : ""}`} onClick={() => setFiltersOpen(true)} aria-label="Filter memories"><SlidersHorizontal /></button>
      </div>

      <section className="memory-list" aria-live="polite">
        {loading ? <p className="memories-empty">Loading your memories…</p> : filtered.length ? filtered.map((memory) => {
          const isFavorite = favorites.has(memory.id);
          const isSelected = selectedMemory?.id === memory.id;
          return <article key={memory.id} className={`memory-library-row ${isSelected ? "selected" : ""}`} aria-current={isSelected ? "true" : undefined} onClick={() => openMemory(memory)}>
            <img src={memory.imageUrl || "/landing/landing_02.png"} alt="" />
            <div className="memory-row-copy">
              <h2><span className="memory-row-title">{memory.title}</span></h2>
              <p><MapPin /> <span>{memory.locationName || "Somewhere special"}</span></p>
              <p><CalendarDays /> <span>{format(new Date(`${memory.date}T12:00:00`), "MMMM d, yyyy")}</span></p>
              <p><Music2 /> <span>{memory.songTitle} — {memory.artist}</span></p>
            </div>
            <div className="memory-row-actions">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button type="button" className="memory-row-more" onClick={(event) => event.stopPropagation()} aria-label={`More actions for ${memory.title}`}><MoreHorizontal /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="memory-row-actions-menu">
                  <DropdownMenuItem onSelect={() => setEditingMemory(memory)}><Pencil />Edit memory</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void shareMemory(memory)}><Share2 />Share</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="memory-row-delete-action" onSelect={() => { setDeletingMemory(memory); setDeleteOpen(true); }}><Trash2 />Delete memory</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button type="button" className={`memory-favorite ${isFavorite ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); toggleFavorite(memory.id); }} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}><Star fill={isFavorite ? "currentColor" : "none"} /></button>
            </div>
          </article>;
        }) : <div className="memories-empty">{memories.length ? <Search /> : <Heart />}<strong>{memories.length ? "No memories found" : "No memories yet"}</strong><span>{memories.length ? "Try changing your search or filters." : "Add your first memory to start mapping your story."}</span>{!memories.length && <button type="button" onClick={() => setShowAddMemory(true)}><Plus />Add your first memory</button>}</div>}
      </section>
    </div>

    <div className="memories-bottom-fade" aria-hidden="true" />

    <nav className="library-bottom-nav" aria-label="Primary navigation">
      <button onClick={() => navigate("/")}><MapIcon /><span>Map</span></button>
      <button className="active"><Heart /><span>Memories</span></button>
      <button onClick={() => navigate("/friends")}><span className="nav-icon-wrap"><ContactRound />{friendRequestCount > 0 && <span className="nav-request-badge">{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>}</span><span>Friends</span></button>
      <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
    </nav>

    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
      <SheetContent side="bottom" className="memories-filter-sheet">
        <SheetHeader><SheetTitle>Filter memories</SheetTitle></SheetHeader>
        <div className="memory-filter-section"><label>Year range</label><div className="year-range-fields"><label><span>From</span><input type="number" inputMode="numeric" min="1900" max="2100" placeholder="Any year" value={yearFrom} onChange={(event) => setYearFrom(event.target.value.slice(0,4))} /></label><span aria-hidden="true">–</span><label><span>To</span><input type="number" inputMode="numeric" min="1900" max="2100" placeholder="Any year" value={yearTo} onChange={(event) => setYearTo(event.target.value.slice(0,4))} /></label></div></div>
        <label className="favorites-filter"><span><Star /> Favorites only</span><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></label>
        <button className="apply-memory-filters" onClick={() => setFiltersOpen(false)}>Show memories</button>
      </SheetContent>
    </Sheet>
    <QuickAddMemorySheet open={showAddMemory} onOpenChange={setShowAddMemory} onAdd={async (data) => Boolean(await addMemory({ ...data, tags: data.tags ?? [] }))} />
    {detailMemory && <MemoryDetail overlay memoryOverride={detailMemory} onClose={() => setDetailMemory(null)} />}
    <QuickAddMemorySheet open={Boolean(editingMemory)} editingMemory={editingMemory} onOpenChange={(open) => { if (!open) setEditingMemory(null); }} onAdd={async (data) => { if (!editingMemory) return false; const saved = await updateMemory(editingMemory.id, { ...data, tags: data.tags ?? [] }); if (saved) { setEditingMemory(null); setSelectedMemory((current) => current?.id === editingMemory.id ? { ...current, ...data, tags: data.tags ?? [] } : current); } return saved; }} />
    <AnimatePresence>{selectedMemory && <motion.aside className="library-memory-inspector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .24 }}>
      <div className="library-inspector-scroll-area">
        <div className="library-inspector-story">
          <div className="library-inspector-gallery">
            <MemoryPhotoGallery memory={selectedMemory} />
            <div className="desktop-inspector-actions"><div className="desktop-inspector-menu-wrap"><button onClick={() => setInspectorMenuOpen((open) => !open)} aria-label="Memory actions"><MoreHorizontal /></button>{inspectorMenuOpen && <div className="desktop-inspector-menu"><button onClick={() => { setInspectorMenuOpen(false); setEditingMemory(selectedMemory); }}><Pencil />Edit memory</button><button onClick={() => { setInspectorMenuOpen(false); void shareMemory(selectedMemory); }}><Share2 />Share</button><button className="danger" onClick={() => { setInspectorMenuOpen(false); setDeletingMemory(selectedMemory); setDeleteOpen(true); }}><Trash2 />Delete memory</button></div>}</div></div>
          </div>
          <div className="library-inspector-summary"><div className="memory-title-row"><h2>{selectedMemory.title}</h2></div><div className="library-inspector-meta"><p><MapPin />{selectedMemory.locationName || "Somewhere special"}</p><p><CalendarDays />{format(new Date(`${selectedMemory.date}T12:00:00`), "MMMM d, yyyy")}</p></div></div>
          <div className="library-inspector-map">
            {typeof selectedMemory.locationLat === "number" && typeof selectedMemory.locationLng === "number" ? <Map key={`${selectedMemory.id}:${selectedMemory.locationLat}:${selectedMemory.locationLng}`} initialViewState={{ longitude: selectedMemory.locationLng, latitude: selectedMemory.locationLat, zoom: 11.5 }} mapStyle={mapStyle} attributionControl={false} style={{ width: "100%", height: "100%" }}><Marker longitude={selectedMemory.locationLng} latitude={selectedMemory.locationLat} anchor="bottom"><div className="memory-pin is-selected"><span className="pin-brand-quote" aria-hidden="true">“</span></div></Marker></Map> : <div className="library-inspector-no-location"><MapPin /><span>No location saved</span></div>}
          </div>
          <div className="inspector-player"><MiniPlayer key={`${selectedMemory.id}:${selectedMemory.songTitle}:${selectedMemory.artist}`} songTitle={selectedMemory.songTitle} artist={selectedMemory.artist} variant="map" /></div>
        </div>
      </div>
    </motion.aside>}</AnimatePresence>
    <AlertDialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeletingMemory(null); }}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this memory?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{deletingMemory?.title}.” This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!deletingMemory) return; await deleteMemory(deletingMemory.id); if (selectedMemory?.id === deletingMemory.id) setSelectedMemory(null); setDeletingMemory(null); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
};

export default MemoriesLibrary;
