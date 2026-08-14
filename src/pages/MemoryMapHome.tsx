import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef, type MapStyle } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Heart, Map as MapIcon, MapPin, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemories } from "@/hooks/useMemories";
import type { Memory } from "@/types/memory";
import { useAuth } from "@/contexts/AuthContext";
import MiniPlayer from "@/components/MiniPlayer";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnimatePresence, motion } from "framer-motion";
import Supercluster from "supercluster";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const DEFAULT_CENTER = { longitude: -73.92, latitude: 40.7, zoom: 9.25 };
type MemoryClusterProperties = { memoryId?: string };
const FAVORITES_KEY = "momentunes:favorite-memories";

const fallbackMemory: Memory = {
  id: "preview-memory",
  title: "A sunset dinner with my friends",
  description: "One of those evenings that felt like it could last forever.",
  songTitle: "Sweet Disposition",
  artist: "The Temper Trap",
  date: "2026-06-14",
  locationName: "Brooklyn, New York",
  locationLat: 40.694,
  locationLng: -73.92,
  mood: "Joyful",
  people: [],
  isPublic: false,
  imageUrl: "/landing/landing_02.png",
  tags: [],
  createdAt: "2026-06-14T19:30:00Z",
};

const getMapStyle = (apiKey?: string): MapStyle => apiKey ? ({
  version: 8,
  sources: {
    geoapify: {
      type: "raster",
      tiles: [`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}`],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors, © Geoapify",
    },
  },
  layers: [{ id: "geoapify", type: "raster", source: "geoapify", paint: { "raster-opacity": 0.72, "raster-saturation": -0.35 } }],
}) : ({
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.68, "raster-saturation": -0.45 } }],
});

const MemoryMapHome = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile(900);
  const { user } = useAuth();
  const { profile: currentProfile } = useCurrentProfile();
  const mapRef = useRef<MapRef | null>(null);
  const cardTouchStartX = useRef<number | null>(null);
  const { memories, loading, addMemory, updateMemory, deleteMemory } = useMemories();
  const requestedMemoryId = searchParams.get("memory");
  const [selectedId, setSelectedId] = useState<string | null>(requestedMemoryId);
  const [activeCollectionIds, setActiveCollectionIds] = useState<string[]>(requestedMemoryId ? [requestedMemoryId] : []);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapView, setMapView] = useState({ bounds: [-180, -85, 180, 85] as [number, number, number, number], zoom: DEFAULT_CENTER.zoom });
  const [showForm, setShowForm] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [year, setYear] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); } catch { return new Set(); }
  });
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(Boolean(requestedMemoryId));
  const [inspectorMenuOpen, setInspectorMenuOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const displayName = currentProfile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Your profile";
  const username = currentProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";
  const avatarUrl = currentProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  const locatedMemories = useMemo(
    () => memories.filter((memory) => typeof memory.locationLat === "number" && typeof memory.locationLng === "number"),
    [memories],
  );
  const displayMemories = useMemo(
    () => locatedMemories.length ? locatedMemories : [fallbackMemory],
    [locatedMemories],
  );
  const latestLocatedMemory = useMemo(() => locatedMemories.reduce<Memory | null>((latest, memory) => {
    if (!latest) return memory;
    const memoryTime = new Date(memory.createdAt || `${memory.date}T12:00:00`).getTime();
    const latestTime = new Date(latest.createdAt || `${latest.date}T12:00:00`).getTime();
    return memoryTime > latestTime ? memory : latest;
  }, null), [locatedMemories]);
  const years = useMemo(() => Array.from(new Set(displayMemories.map((memory) => new Date(`${memory.date}T12:00:00`).getFullYear()))).sort((a, b) => b - a), [displayMemories]);
  const filteredMemories = displayMemories.filter((memory) => {
    const haystack = `${memory.title} ${memory.songTitle} ${memory.artist} ${memory.locationName ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase())
      && (year === "all" || String(new Date(`${memory.date}T12:00:00`).getFullYear()) === year)
      && (!favoritesOnly || favorites.has(memory.id));
  });
  const visibleMemories = query.trim() || year !== "all" || favoritesOnly ? filteredMemories : displayMemories;
  const clusterIndex = useMemo(() => {
    const index = new Supercluster<MemoryClusterProperties>({ radius: 54, maxZoom: 17 });
    index.load(visibleMemories.map((memory) => ({
      type: "Feature" as const,
      properties: { memoryId: memory.id },
      geometry: { type: "Point" as const, coordinates: [memory.locationLng!, memory.locationLat!] },
    })));
    return index;
  }, [visibleMemories]);
  const mapClusters = useMemo(
    () => clusterIndex.getClusters(mapView.bounds, Math.floor(mapView.zoom)),
    [clusterIndex, mapView],
  );
  const selectedMemory = displayMemories.find((memory) => memory.id === selectedId);
  const sharedLocationMemories = useMemo(() => activeCollectionIds.map((id) => displayMemories.find((memory) => memory.id === id)).filter((memory): memory is Memory => Boolean(memory)), [activeCollectionIds, displayMemories]);
  const sharedLocationIndex = selectedMemory ? sharedLocationMemories.findIndex((memory) => memory.id === selectedMemory.id) : -1;

  useEffect(() => {
    const memoryId = searchParams.get("memory");
    if (!memoryId) return;
    setSelectedId(memoryId);
    setActiveCollectionIds([memoryId]);
    setMemoryPanelOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("add") === "true") setShowForm(true);
  }, [searchParams]);

  useEffect(() => {
    if (!mapLoaded || loading || selectedId || !latestLocatedMemory || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [latestLocatedMemory.locationLng!, latestLocatedMemory.locationLat!],
      zoom: 10.25,
      duration: 850,
    });
  }, [latestLocatedMemory, loading, mapLoaded, selectedId]);

  const selectedMemoryId = selectedMemory?.id;
  const selectedLatitude = selectedMemory?.locationLat;
  const selectedLongitude = selectedMemory?.locationLng;

  useEffect(() => {
    if (!mapLoaded || !selectedMemoryId || selectedLatitude == null || selectedLongitude == null || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [selectedLongitude, selectedLatitude],
      zoom: Math.max(mapRef.current.getZoom(), 9.25),
      duration: 750,
      offset: isMobile ? [0, -150] : [-46, 0],
    });
  }, [isMobile, mapLoaded, selectedLatitude, selectedLongitude, selectedMemoryId]);

  const selectMemory = (memory: Memory) => {
    setSelectedId(memory.id);
    const memoriesAtLocation = displayMemories.filter((item) => Math.abs(item.locationLat! - memory.locationLat!) < 0.000001 && Math.abs(item.locationLng! - memory.locationLng!) < 0.000001);
    setActiveCollectionIds(memoriesAtLocation.map((item) => item.id));
    setMemoryPanelOpen(true);
    setSearchOpen(false);
  };

  const selectAdjacentLocationMemory = (direction: number) => {
    if (sharedLocationMemories.length < 2 || sharedLocationIndex < 0) return;
    const nextIndex = sharedLocationIndex + direction;
    if (nextIndex < 0 || nextIndex >= sharedLocationMemories.length) return;
    setSelectedId(sharedLocationMemories[nextIndex].id);
  };

  const updateMapView = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    setMapView({ bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], zoom: map.getZoom() });
  };

  return (
    <main className={`memory-map-home ${!isMobile && memoryPanelOpen && selectedMemory ? "has-desktop-inspector" : ""}`}>
      <Map
        ref={mapRef}
        onLoad={() => { setMapLoaded(true); updateMapView(); }}
        onMoveEnd={updateMapView}
        onClick={() => {
          setSearchOpen(false);
          setFiltersOpen(false);
          if (isMobile && memoryPanelOpen) {
            setMemoryPanelOpen(false);
            setSelectedId(null);
            setActiveCollectionIds([]);
          }
        }}
        initialViewState={DEFAULT_CENTER}
        mapStyle={getMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY)}
        dragRotate={false}
        touchPitch={false}
        minZoom={2}
        maxZoom={17}
        attributionControl={false}
        style={{ position: "absolute", inset: 0 }}
      >
        {!isMobile && <NavigationControl position="bottom-left" showCompass={false} />}
        {mapClusters.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          if (feature.properties.cluster) return <Marker key={`cluster-${feature.properties.cluster_id}`} longitude={longitude} latitude={latitude} anchor="center">
            <button
              type="button"
              className="memory-cluster"
              aria-label={`${feature.properties.point_count} memories nearby`}
              onClick={(event) => {
                event.stopPropagation();
                const leaves = clusterIndex.getLeaves(feature.properties.cluster_id, Infinity);
                const collectionIds = leaves.map((leaf) => leaf.properties.memoryId).filter((id): id is string => Boolean(id));
                const firstMemory = visibleMemories.find((memory) => memory.id === collectionIds[0]);
                if (firstMemory) {
                  setActiveCollectionIds(collectionIds);
                  setSelectedId(firstMemory.id);
                  setMemoryPanelOpen(true);
                  setSearchOpen(false);
                }
                const firstCoordinates = leaves[0]?.geometry.coordinates;
                const sameLocation = Boolean(firstCoordinates) && leaves.every((leaf) => Math.abs(leaf.geometry.coordinates[0] - firstCoordinates[0]) < 0.000001 && Math.abs(leaf.geometry.coordinates[1] - firstCoordinates[1]) < 0.000001);
                const expansionZoom = clusterIndex.getClusterExpansionZoom(feature.properties.cluster_id);
                if (!sameLocation && expansionZoom <= 17) {
                  mapRef.current?.easeTo({ center: [longitude, latitude], zoom: expansionZoom, duration: 650 });
                }
              }}
            ><span>{feature.properties.point_count}</span></button>
          </Marker>;
          const memory = visibleMemories.find((item) => item.id === feature.properties.memoryId);
          return memory ? <Marker key={memory.id} longitude={longitude} latitude={latitude} anchor="bottom">
            <button
              type="button"
              className={`memory-pin ${memory.id === selectedMemory?.id ? "is-selected" : ""}`}
              aria-label={`Open ${memory.title}`}
              onClick={(event) => { event.stopPropagation(); selectMemory(memory); }}
            >
              <span className="pin-brand-quote" aria-hidden="true">“</span>
            </button>
          </Marker> : null;
        })}
      </Map>

      <div className="map-wash" aria-hidden="true" />

      <header className="map-header">
        <button type="button" className="add-memory-pill" onClick={() => setShowForm(true)}>
          <Plus size={23} strokeWidth={2.2} />
          <span>Add</span>
        </button>
        <div className="mobile-map-search">
          <Search size={22} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories…" aria-label="Search memories" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}
        </div>
        <button type="button" className={`map-filter-button ${year !== "all" || favoritesOnly ? "active" : ""}`} onClick={() => setFiltersOpen(true)} aria-label="Filter map memories"><SlidersHorizontal /></button>
      </header>

      {query && <div className="mobile-map-search-results">
        {filteredMemories.length ? filteredMemories.slice(0, 5).map((memory) => <button key={memory.id} onClick={() => selectMemory(memory)}><strong>{memory.title}</strong><span>{memory.songTitle} · {memory.locationName}</span></button>) : <p>No memories found.</p>}
      </div>}

      <aside className="desktop-map-sidebar">
        <button type="button" className="desktop-add-memory" onClick={() => setShowForm(true)}><Plus /><span>Add memory</span></button>
        <nav className="desktop-map-nav" aria-label="Desktop navigation">
          <button className="active"><MapIcon /><span>Map</span></button>
          <button onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button>
          <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
        </nav>
        <div className="desktop-account-wrap">
          <button type="button" className="desktop-account" onClick={() => navigate("/account")}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="account-initials">{displayName.slice(0, 2).toUpperCase()}</span>}
            <span className="account-name"><strong>{displayName}</strong>{username && <small>@{username}</small>}</span>
          </button>
        </div>
      </aside>

      {memoryPanelOpen && selectedMemory ? <div className={`desktop-compact-map-tools ${searchOpen ? "search-expanded" : ""}`} onClick={(event) => event.stopPropagation()}>
        {searchOpen ? <div className="desktop-compact-search-field">
          <Search />
          <input autoFocus value={query} onFocus={() => setFiltersOpen(false)} onChange={(event) => { setFiltersOpen(false); setQuery(event.target.value); }} placeholder="Search memories…" aria-label="Search memories" />
          <button type="button" onClick={() => { setSearchOpen(false); setQuery(""); }} aria-label="Collapse search"><X /></button>
          {query && <div className="desktop-search-results">{filteredMemories.length ? filteredMemories.slice(0, 6).map((memory) => <button key={memory.id} onClick={() => selectMemory(memory)}><strong>{memory.title}</strong><span>{memory.songTitle} · {memory.locationName}</span></button>) : <p>No memories found.</p>}</div>}
        </div> : <button type="button" className="desktop-map-tool-button compact-search-trigger" onClick={() => { setFiltersOpen(false); setSearchOpen(true); }} aria-label="Search memories"><Search /></button>}
        <button type="button" className={`desktop-map-tool-button ${year !== "all" || favoritesOnly ? "active" : ""}`} onClick={() => { setSearchOpen(false); setFiltersOpen((open) => !open); }} aria-label="Filter map memories"><SlidersHorizontal /></button>
        {filtersOpen && <div className="desktop-map-filter-card">
          <div className="desktop-filter-card-header"><strong>Filter memories</strong><button type="button" disabled={year === "all" && !favoritesOnly} onClick={() => { setYear("all"); setFavoritesOnly(false); }}>Clear</button></div>
          <div className="memory-filter-section"><label>Year</label><div className="filter-chips"><button className={year === "all" ? "active" : ""} onClick={() => setYear("all")}>All years</button>{years.map((item) => <button key={item} className={year === String(item) ? "active" : ""} onClick={() => setYear(String(item))}>{item}</button>)}</div></div>
          <label className="favorites-filter"><span><Star /> Favorites only</span><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></label>
          <button className="apply-memory-filters" onClick={() => { setFiltersOpen(false); if (selectedId && !visibleMemories.some((memory) => memory.id === selectedId)) { setSelectedId(null); setMemoryPanelOpen(false); setActiveCollectionIds([]); } }}>Show on map</button>
        </div>}
      </div> : <div className="desktop-standard-map-tools" onClick={(event) => event.stopPropagation()}>
        <div className="desktop-map-search">
          <Search />
          <input value={query} onFocus={() => setFiltersOpen(false)} onChange={(event) => { setFiltersOpen(false); setQuery(event.target.value); }} placeholder="Search memories…" aria-label="Search memories" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}
          {query && <div className="desktop-search-results">{filteredMemories.length ? filteredMemories.slice(0, 6).map((memory) => <button key={memory.id} onClick={() => selectMemory(memory)}><strong>{memory.title}</strong><span>{memory.songTitle} · {memory.locationName}</span></button>) : <p>No memories found.</p>}</div>}
        </div>
        <button type="button" className={`desktop-map-filter ${year !== "all" || favoritesOnly ? "active" : ""}`} onClick={() => { setSearchOpen(false); setFiltersOpen((open) => !open); }} aria-label="Filter map memories"><SlidersHorizontal /></button>
        {filtersOpen && <div className="desktop-map-filter-card">
          <div className="desktop-filter-card-header"><strong>Filter memories</strong><button type="button" disabled={year === "all" && !favoritesOnly} onClick={() => { setYear("all"); setFavoritesOnly(false); }}>Clear</button></div>
          <div className="memory-filter-section"><label>Year</label><div className="filter-chips"><button className={year === "all" ? "active" : ""} onClick={() => setYear("all")}>All years</button>{years.map((item) => <button key={item} className={year === String(item) ? "active" : ""} onClick={() => setYear(String(item))}>{item}</button>)}</div></div>
          <label className="favorites-filter"><span><Star /> Favorites only</span><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></label>
          <button className="apply-memory-filters" onClick={() => setFiltersOpen(false)}>Show on map</button>
        </div>}
      </div>}

      {isMobile && selectedMemory && memoryPanelOpen && sharedLocationMemories.length > 1 && <div className="memory-carousel-arrows" onClick={(event) => event.stopPropagation()}>
        <button disabled={sharedLocationIndex === 0} onClick={() => selectAdjacentLocationMemory(-1)} aria-label="Previous memory"><ChevronLeft /></button>
        <span>{sharedLocationIndex + 1} of {sharedLocationMemories.length}</span>
        <button disabled={sharedLocationIndex === sharedLocationMemories.length - 1} onClick={() => selectAdjacentLocationMemory(1)} aria-label="Next memory"><ChevronRight /></button>
      </div>}

      <AnimatePresence mode="wait">
      {!loading && selectedMemory && memoryPanelOpen && (
        <motion.article
          key={`${isMobile ? "mobile" : "desktop"}-${selectedMemory.id}`}
          className={`now-playing-memory ${isMobile && sharedLocationMemories.length > 1 ? `has-location-collection ${sharedLocationIndex === 0 ? "collection-first" : sharedLocationIndex === sharedLocationMemories.length - 1 ? "collection-last" : "collection-middle"}` : ""}`}
          initial={isMobile ? { opacity: 0, y: 24, x: sharedLocationMemories.length > 1 ? 0 : "-50%" } : { opacity: 0, x: 28, scale: 0.985 }}
          animate={isMobile ? { opacity: 1, y: 0, x: sharedLocationMemories.length > 1 ? 0 : "-50%" } : { opacity: 1, x: 0, scale: 1 }}
          exit={isMobile ? { opacity: 0, y: 20, x: sharedLocationMemories.length > 1 ? 0 : "-50%" } : { opacity: 0, x: 24, scale: 0.99 }}
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          onClick={() => isMobile && selectedMemory.id !== fallbackMemory.id && navigate(`/journal/memories/${selectedMemory.id}`)}
          onTouchStart={(event) => { cardTouchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const startX = cardTouchStartX.current;
            const endX = event.changedTouches[0]?.clientX;
            cardTouchStartX.current = null;
            if (!isMobile || startX == null || endX == null || Math.abs(endX - startX) < 48) return;
            event.stopPropagation();
            selectAdjacentLocationMemory(endX < startX ? 1 : -1);
          }}
        >
          {isMobile ? <>
            <img src={selectedMemory.imageUrl || "/landing/landing_02.png"} alt="" className="memory-cover" style={{ objectPosition: `${selectedMemory.imageFocusPoints?.[0]?.x ?? 50}% ${selectedMemory.imageFocusPoints?.[0]?.y ?? 50}%` }} />
            <div className="memory-story">
              <div className="memory-title-row"><span className="memory-brand-quote" aria-hidden="true">“</span><h1>{selectedMemory.title}</h1></div>
              <p className="memory-meta">{selectedMemory.locationName || "Somewhere special"} <span>·</span> {format(new Date(`${selectedMemory.date}T12:00:00`), "MMM d, yyyy")}</p>
              <div onClick={(event) => event.stopPropagation()}><MiniPlayer key={`${selectedMemory.id}:${selectedMemory.songTitle}:${selectedMemory.artist}`} songTitle={selectedMemory.songTitle} artist={selectedMemory.artist} variant="map" /></div>
            </div>
            {sharedLocationMemories.length > 1 && sharedLocationIndex > 0 && (() => {
              const previousMemory = sharedLocationMemories[sharedLocationIndex - 1];
              return <button type="button" className="previous-memory-card-peek" onClick={(event) => { event.stopPropagation(); selectAdjacentLocationMemory(-1); }} aria-label={`Show previous memory: ${previousMemory.title}`}>
                <img src={previousMemory.imageUrl || "/landing/landing_02.png"} alt="" />
                <span><strong>“{previousMemory.title}</strong><small>{previousMemory.locationName || "Somewhere special"}</small></span>
              </button>;
            })()}
            {sharedLocationMemories.length > 1 && sharedLocationIndex < sharedLocationMemories.length - 1 && (() => {
              const nextMemory = sharedLocationMemories[sharedLocationIndex + 1];
              return <button type="button" className="next-memory-card-peek" onClick={(event) => { event.stopPropagation(); selectAdjacentLocationMemory(1); }} aria-label={`Show next memory: ${nextMemory.title}`}>
                <img src={nextMemory.imageUrl || "/landing/landing_02.png"} alt="" />
                <span><strong>“{nextMemory.title}</strong><small>{nextMemory.locationName || "Somewhere special"}</small></span>
              </button>;
            })()}
          </> : <>
            <div className="inspector-scroll-area">
              <div className="desktop-inspector-media">
                <img src={selectedMemory.imageUrl || "/landing/landing_02.png"} alt="" className="memory-cover" style={{ objectPosition: `${selectedMemory.imageFocusPoints?.[0]?.x ?? 50}% ${selectedMemory.imageFocusPoints?.[0]?.y ?? 50}%` }} />
                <div className="desktop-inspector-actions" onClick={(event) => event.stopPropagation()}>
                  <div className="desktop-inspector-menu-wrap">
                    <button onClick={() => setInspectorMenuOpen((current) => !current)} aria-label="Memory actions"><MoreHorizontal /></button>
                    {inspectorMenuOpen && <div className="desktop-inspector-menu">
                      <button onClick={() => { setInspectorMenuOpen(false); setEditingMemory(selectedMemory); }}><Pencil />Edit memory</button>
                      <button className="danger" onClick={() => { setInspectorMenuOpen(false); setDeleteOpen(true); }}><Trash2 />Delete memory</button>
                    </div>}
                  </div>
                  <button onClick={() => { setInspectorMenuOpen(false); setSearchOpen(false); setMemoryPanelOpen(false); }} aria-label="Close inspector"><X /></button>
                </div>
              </div>
              <div className="memory-story">
                <div className="memory-title-row"><span className="memory-brand-quote" aria-hidden="true">“</span><h1>{selectedMemory.title}</h1></div>
                <div className="desktop-inspector-meta"><p><MapPin />{selectedMemory.locationName || "Somewhere special"}</p><p><CalendarDays />{format(new Date(`${selectedMemory.date}T12:00:00`), "MMMM d, yyyy")}</p></div>
                <div className="inspector-player" onClick={(event) => event.stopPropagation()}><MiniPlayer key={`${selectedMemory.id}:${selectedMemory.songTitle}:${selectedMemory.artist}`} songTitle={selectedMemory.songTitle} artist={selectedMemory.artist} variant="map" /></div>
              </div>
            </div>
            {sharedLocationMemories.length > 1 && <div className="desktop-location-carousel" onClick={(event) => event.stopPropagation()}>
              <button onClick={() => selectAdjacentLocationMemory(-1)} aria-label="Previous memory"><ChevronLeft /></button>
              <span>{sharedLocationIndex + 1} of {sharedLocationMemories.length} at this place</span>
              <button onClick={() => selectAdjacentLocationMemory(1)} aria-label="Next memory"><ChevronRight /></button>
            </div>}
          </>}
        </motion.article>
      )}
      </AnimatePresence>

      <nav className="map-bottom-nav" aria-label="Primary navigation">
        <button className="active"><MapIcon /><span>Map</span></button>
        <button onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button>
        <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
      </nav>

      <QuickAddMemorySheet open={showForm} onOpenChange={setShowForm} onAdd={async (data) => Boolean(await addMemory({ ...data, tags: data.tags ?? [] }))} />
      <QuickAddMemorySheet open={Boolean(editingMemory)} editingMemory={editingMemory} onOpenChange={(next) => { if (!next) setEditingMemory(null); }} onAdd={async (data) => { if (!editingMemory) return false; const saved = await updateMemory(editingMemory.id, { ...data, tags: data.tags ?? [] }); if (saved) setEditingMemory(null); return saved; }} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this memory?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{selectedMemory?.title}.” This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!selectedMemory || selectedMemory.id === fallbackMemory.id) return; await deleteMemory(selectedMemory.id); setMemoryPanelOpen(false); setSelectedId(null); setActiveCollectionIds([]); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Sheet open={isMobile && filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="memories-filter-sheet">
          <SheetHeader><SheetTitle>Filter map memories</SheetTitle></SheetHeader>
          <button type="button" className="mobile-clear-map-filters" disabled={year === "all" && !favoritesOnly} onClick={() => { setYear("all"); setFavoritesOnly(false); }}>Clear filters</button>
          <div className="memory-filter-section"><label>Year</label><div className="filter-chips"><button className={year === "all" ? "active" : ""} onClick={() => setYear("all")}>All years</button>{years.map((item) => <button key={item} className={year === String(item) ? "active" : ""} onClick={() => setYear(String(item))}>{item}</button>)}</div></div>
          <label className="favorites-filter"><span><Star /> Favorites only</span><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></label>
          <button className="apply-memory-filters" onClick={() => { setFiltersOpen(false); if (selectedId && !visibleMemories.some((memory) => memory.id === selectedId)) { setSelectedId(null); setMemoryPanelOpen(false); setActiveCollectionIds([]); } }}>Show on map</button>
        </SheetContent>
      </Sheet>
    </main>
  );
};

export default MemoryMapHome;
