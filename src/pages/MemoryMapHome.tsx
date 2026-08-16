import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef, type MapStyle } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, ContactRound, Heart, Map as MapIcon, MapPin, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemories } from "@/hooks/useMemories";
import type { Memory } from "@/types/memory";
import { useAuth } from "@/contexts/AuthContext";
import MiniPlayer from "@/components/MiniPlayer";
import MemoryPhotoGallery from "@/components/MemoryPhotoGallery";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import type { LocationResult } from "@/components/LocationSearch";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Supercluster from "supercluster";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MemoryDetail from "@/pages/MemoryDetail";

const DEFAULT_CENTER = { longitude: -73.92, latitude: 40.7, zoom: 9.25 };
type MemoryClusterProperties = { memoryId?: string };
type MobileCardMotion = { direction: -1 | 0 | 1; isCollection: boolean };
const FAVORITES_KEY = "momentunes:favorite-memories";
const MAP_DISPLAY_KEY = "momentunes:map-display";
const FRIEND_COLOR = "#3978d4";
const MAP_ADD_HINT_KEY = "momentunes:map-add-hint-seen";
type MapAddHintState = { visitsShown: number; lastShown?: string; dismissedUntil?: number; completed?: boolean };

const readMapAddHintState = (): MapAddHintState => {
  try {
    const stored = localStorage.getItem(MAP_ADD_HINT_KEY);
    if (!stored) return { visitsShown: 0 };
    if (stored === "true") return { visitsShown: 1, lastShown: format(new Date(), "yyyy-MM-dd") };
    return { visitsShown: 0, ...JSON.parse(stored) };
  } catch {
    return { visitsShown: 0 };
  }
};

const writeMapAddHintState = (state: MapAddHintState) => {
  try { localStorage.setItem(MAP_ADD_HINT_KEY, JSON.stringify(state)); } catch { /* The hint can still work without persistence. */ }
};

const mobileCardVariants = {
  initial: ({ direction, isCollection }: MobileCardMotion) => direction === 0
    ? { opacity: 0, y: 24, x: isCollection ? 0 : "-50%" }
    : { opacity: 1, y: 0, x: direction > 0 ? "105%" : "-105%" },
  animate: ({ isCollection }: MobileCardMotion) => ({ opacity: 1, y: 0, x: isCollection ? 0 : "-50%" }),
  exit: ({ direction, isCollection }: MobileCardMotion) => direction === 0
    ? { opacity: 0, y: 20, x: isCollection ? 0 : "-50%" }
    : { opacity: 1, y: 0, x: direction > 0 ? "-105%" : "105%" },
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
  const prefersReducedMotion = useReducedMotion();
  const { user } = useAuth();
  const { profile: currentProfile } = useCurrentProfile();
  const mapRef = useRef<MapRef | null>(null);
  const cardTouchStartX = useRef<number | null>(null);
  const mapLongPressTimerRef = useRef<number | null>(null);
  const suppressMapClickRef = useRef(false);
  const mapLocationRequestRef = useRef(0);
  const mapHintTimerRef = useRef<number | null>(null);
  const mapHintDismissTimerRef = useRef<number | null>(null);
  const { memories, loading, addMemory, updateMemory, deleteMemory } = useMemories();
  const requestedMemoryId = searchParams.get("memory");
  const requestedProfileId = searchParams.get("profile");
  const requestedFriendFilterId = searchParams.get("friend");
  const requestedProfileUsername = searchParams.get("username");
  const [friendMapMemories, setFriendMapMemories] = useState<Memory[]>([]);
  const [friendMapOwner, setFriendMapOwner] = useState<{ username: string; displayName?: string; avatarUrl?: string } | null>(null);
  const [friendMapLoading, setFriendMapLoading] = useState(false);
  const [friendsMemories, setFriendsMemories] = useState<Memory[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(requestedMemoryId);
  const [activeCollectionIds, setActiveCollectionIds] = useState<string[]>(requestedMemoryId ? [requestedMemoryId] : []);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapView, setMapView] = useState({ bounds: [-180, -85, 180, 85] as [number, number, number, number], zoom: DEFAULT_CENTER.zoom });
  const [showForm, setShowForm] = useState(false);
  const [formInitialLocation, setFormInitialLocation] = useState<LocationResult | null>(null);
  const [mapDraftLocation, setMapDraftLocation] = useState<LocationResult | null>(null);
  const [resolvingMapDraft, setResolvingMapDraft] = useState(false);
  const [showMapAddHint, setShowMapAddHint] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [mapDisplay, setMapDisplay] = useState<{ mine: boolean; friends: boolean }>(() => {
    if (requestedFriendFilterId) return { mine: false, friends: true };
    try { return { mine: true, friends: false, ...JSON.parse(localStorage.getItem(MAP_DISPLAY_KEY) || "{}") }; } catch { return { mine: true, friends: false }; }
  });
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(requestedFriendFilterId ? [requestedFriendFilterId] : []);
  const [friendFilterQuery, setFriendFilterQuery] = useState("");
  const [favorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); } catch { return new Set(); }
  });
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(Boolean(requestedMemoryId));
  const [cardDirection, setCardDirection] = useState<-1 | 0 | 1>(0);
  const [inspectorMenuOpen, setInspectorMenuOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detailMemory, setDetailMemory] = useState<Memory | null>(null);
  const displayName = currentProfile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Your profile";
  const username = currentProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";
  const avatarUrl = currentProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  useEffect(() => {
    if (!requestedProfileId) { setFriendMapMemories([]); setFriendMapOwner(null); setFriendMapLoading(false); return; }
    let cancelled = false;
    setFriendMapLoading(true);
    const loadFriendMap = async () => {
      const [{ data, error }, { data: owner, error: ownerError }] = await Promise.all([
        supabase.from("memories").select("*").eq("user_id", requestedProfileId).order("date", { ascending: false }),
        supabase.from("profiles").select("user_id, username, display_name, avatar_url").eq("user_id", requestedProfileId).maybeSingle(),
      ]);
      if (cancelled) return;
      if (error) toast.error("Could not load this friend's map");
      if (ownerError) console.error("Could not load friend profile", ownerError);
      setFriendMapOwner({
        username: owner?.username ?? requestedProfileUsername ?? "friend",
        displayName: owner?.display_name ?? undefined,
        avatarUrl: owner?.avatar_url ?? undefined,
      });
      setFriendMapMemories((data ?? []).map((row) => ({
        id: row.id, userId: row.user_id, username: owner?.username ?? requestedProfileUsername, displayName: owner?.display_name, avatarUrl: owner?.avatar_url,
        title: row.title, description: row.description ?? "", songTitle: row.song_title, artist: row.artist, date: row.date,
        memoryYear: row.memory_year, memorySeason: row.memory_season, locationName: row.location_name, locationLat: row.location_lat, locationLng: row.location_lng, locationPlaceId: row.location_place_id,
        mood: row.mood, people: row.people ?? [], isPublic: row.is_public, imageUrl: row.image_url, imageUrls: row.image_urls?.length ? row.image_urls : row.image_url ? [row.image_url] : [], tags: row.tags ?? [], createdAt: row.created_at,
      })));
      setFriendMapLoading(false);
    };
    void loadFriendMap();
    return () => { cancelled = true; };
  }, [requestedProfileId, requestedProfileUsername]);

  useEffect(() => {
    try { localStorage.setItem(MAP_DISPLAY_KEY, JSON.stringify(mapDisplay)); } catch { /* Display preferences can remain session-only. */ }
  }, [mapDisplay]);

  useEffect(() => {
    if (!requestedFriendFilterId) return;
    setMapDisplay({ mine: false, friends: true });
    setSelectedFriendIds([requestedFriendFilterId]);
  }, [requestedFriendFilterId]);

  useEffect(() => {
    if (!user || requestedProfileId || !mapDisplay.friends) { setFriendsMemories([]); setFriendsLoading(false); return; }
    let cancelled = false;
    const loadFriendsMemories = async () => {
      setFriendsLoading(true);
      const { data: relationships, error: followsError } = await supabase.from("friendships").select("requester_id, recipient_id").eq("status", "accepted").or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);
      if (cancelled) return;
      if (followsError) { toast.error("Could not load friends’ memories"); setFriendsLoading(false); return; }
      const friendIds = (relationships ?? []).map((relationship) => relationship.requester_id === user.id ? relationship.recipient_id : relationship.requester_id);
      if (!friendIds.length) { setFriendsMemories([]); setFriendsLoading(false); return; }
      const [{ data: profiles }, { data: rows, error }] = await Promise.all([
        supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", friendIds),
        supabase.from("memories").select("*").in("user_id", friendIds).order("date", { ascending: false }),
      ]);
      if (cancelled) return;
      if (error) toast.error("Could not load friends’ memories");
      const profileById = new globalThis.Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      setFriendsMemories((rows ?? []).map((row) => {
        const owner = profileById.get(row.user_id);
        return {
          id: row.id, userId: row.user_id, username: owner?.username, displayName: owner?.display_name, avatarUrl: owner?.avatar_url,
          title: row.title, description: row.description ?? "", songTitle: row.song_title, artist: row.artist, date: row.date,
          memoryYear: row.memory_year, memorySeason: row.memory_season, locationName: row.location_name, locationLat: row.location_lat, locationLng: row.location_lng, locationPlaceId: row.location_place_id,
          mood: row.mood, people: row.people ?? [], isPublic: row.is_public, imageUrl: row.image_url, imageUrls: row.image_urls?.length ? row.image_urls : row.image_url ? [row.image_url] : [], tags: row.tags ?? [], createdAt: row.created_at,
        };
      }));
      setFriendsLoading(false);
    };
    void loadFriendsMemories().catch((error) => {
      console.error("Could not load friends’ memories", error);
      if (!cancelled) {
        setFriendsMemories([]);
        setFriendsLoading(false);
        toast.error("Could not load friends’ memories");
      }
    });
    return () => { cancelled = true; };
  }, [mapDisplay.friends, requestedProfileId, user]);

  const friendOptions = useMemo(() => Array.from(new globalThis.Map(friendsMemories.filter((memory) => memory.userId).map((memory) => [memory.userId!, {
    id: memory.userId!, username: memory.username || "friend", displayName: memory.displayName, avatarUrl: memory.avatarUrl,
  }])).values()).sort((a, b) => a.username.localeCompare(b.username)), [friendsMemories]);
  const visibleFriendsMemories = useMemo(() => friendsMemories.filter((memory) => selectedFriendIds.length === 0 || (memory.userId && selectedFriendIds.includes(memory.userId))), [friendsMemories, selectedFriendIds]);
  const activeMapMemories = useMemo(() => requestedProfileId ? friendMapMemories : [...(mapDisplay.mine ? memories : []), ...(mapDisplay.friends ? visibleFriendsMemories : [])], [friendMapMemories, mapDisplay.friends, mapDisplay.mine, memories, requestedProfileId, visibleFriendsMemories]);
  const mapLoading = loading || friendMapLoading;
  const locatedMemories = useMemo(
    () => activeMapMemories.filter((memory) => typeof memory.locationLat === "number" && typeof memory.locationLng === "number"),
    [activeMapMemories],
  );
  const displayMemories = locatedMemories;
  const latestLocatedMemory = useMemo(() => locatedMemories.reduce<Memory | null>((latest, memory) => {
    if (!latest) return memory;
    const memoryTime = new Date(memory.createdAt || `${memory.date}T12:00:00`).getTime();
    const latestTime = new Date(latest.createdAt || `${latest.date}T12:00:00`).getTime();
    return memoryTime > latestTime ? memory : latest;
  }, null), [locatedMemories]);
  const filteredMemories = displayMemories.filter((memory) => {
    const haystack = `${memory.title} ${memory.songTitle} ${memory.artist} ${memory.locationName ?? ""}`.toLowerCase();
    const memoryYear = new Date(`${memory.date}T12:00:00`).getFullYear();
    return haystack.includes(query.trim().toLowerCase())
      && (!yearFrom || memoryYear >= Number(yearFrom))
      && (!yearTo || memoryYear <= Number(yearTo))
      && (!favoritesOnly || favorites.has(memory.id));
  });
  const visibleMemories = query.trim() || yearFrom || yearTo || favoritesOnly ? filteredMemories : displayMemories;
  const hasFriendSelection = mapDisplay.friends && selectedFriendIds.length > 0;
  const displayFilterActive = !mapDisplay.mine || mapDisplay.friends || hasFriendSelection;
  const allFiltersDefault = !yearFrom && !yearTo && !favoritesOnly && !displayFilterActive;
  const clearMapFilters = () => { setYearFrom(""); setYearTo(""); setFavoritesOnly(false); setMapDisplay({ mine: true, friends: false }); setSelectedFriendIds([]); setFriendFilterQuery(""); };
  const matchingFriendOptions = friendOptions.filter((friend) => !selectedFriendIds.includes(friend.id) && `${friend.username} ${friend.displayName || ""}`.toLowerCase().includes(friendFilterQuery.trim().toLowerCase()));
  const selectedFilterFriend = selectedFriendIds.length === 1 ? friendOptions.find((friend) => friend.id === selectedFriendIds[0]) : undefined;
  const focusedMapFriend = requestedProfileId ? friendMapOwner : selectedFriendIds.length === 1 ? {
    username: selectedFilterFriend?.username || requestedProfileUsername || "friend",
    displayName: selectedFilterFriend?.displayName,
    avatarUrl: selectedFilterFriend?.avatarUrl,
  } : null;
  const focusedMapFriendMemoryCount = requestedProfileId ? friendMapMemories.length : selectedFriendIds.length === 1 ? friendsMemories.filter((memory) => memory.userId === selectedFriendIds[0]).length : 0;
  const mapDisplayControls = <div className="map-display-filter"><label>Show on map</label><div><button type="button" className={mapDisplay.mine ? "active" : ""} role="switch" aria-checked={mapDisplay.mine} onClick={() => setMapDisplay((current) => ({ ...current, mine: !current.mine }))}><span aria-hidden="true" />My memories</button><button type="button" className={mapDisplay.friends ? "active" : ""} role="switch" aria-checked={mapDisplay.friends} onClick={() => setMapDisplay((current) => ({ ...current, friends: !current.friends }))}><span aria-hidden="true" />{friendsLoading ? "Loading friends…" : "Friends’ memories"}</button></div>{mapDisplay.friends && !friendsLoading && friendOptions.length > 0 && <div className="friend-pin-filter"><div className="friend-filter-search"><Search /><input value={friendFilterQuery} onChange={(event) => setFriendFilterQuery(event.target.value)} placeholder="Add a friend filter…" aria-label="Search friends to filter map" />{friendFilterQuery && <button type="button" onClick={() => setFriendFilterQuery("")} aria-label="Clear friend search"><X /></button>}</div>{selectedFriendIds.length > 0 ? <div className="selected-friend-filters">{selectedFriendIds.map((id) => {
    const friend = friendOptions.find((item) => item.id === id); if (!friend) return null;
    return <button type="button" key={id} onClick={() => setSelectedFriendIds((current) => current.filter((item) => item !== id))}>{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.username.slice(0,2).toUpperCase()}</span>}@{friend.username}<X /></button>;
  })}<button type="button" className="clear-friend-filters" onClick={() => setSelectedFriendIds([])}>All friends</button></div> : <p className="all-friends-note">Showing all friends</p>}{friendFilterQuery.trim() && <div className="friend-filter-results">{matchingFriendOptions.length ? matchingFriendOptions.slice(0,6).map((friend) => <button type="button" key={friend.id} onClick={() => { setSelectedFriendIds((current) => [...current, friend.id]); setFriendFilterQuery(""); }}>{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.username.slice(0,2).toUpperCase()}</span>}<strong>@{friend.username}</strong><small>Add</small></button>) : <p>No matching friends</p>}</div>}</div>}</div>;
  const yearRangeControls = <div className="memory-filter-section"><label>Year range</label><div className="year-range-fields"><label><span>From</span><input type="number" inputMode="numeric" min="1900" max="2100" placeholder="Any year" value={yearFrom} onChange={(event) => setYearFrom(event.target.value.slice(0,4))} /></label><span aria-hidden="true">–</span><label><span>To</span><input type="number" inputMode="numeric" min="1900" max="2100" placeholder="Any year" value={yearTo} onChange={(event) => setYearTo(event.target.value.slice(0,4))} /></label></div></div>;
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
    if (mapLoading || !selectedId || displayMemories.some((memory) => memory.id === selectedId)) return;
    setSelectedId(null);
    setMemoryPanelOpen(false);
    setActiveCollectionIds([]);
  }, [displayMemories, mapLoading, selectedId]);

  useEffect(() => {
    if (searchParams.get("add") === "true") setShowForm(true);
  }, [searchParams]);

  useEffect(() => {
    if (!mapLoaded || mapLoading || selectedId || !latestLocatedMemory || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [latestLocatedMemory.locationLng!, latestLocatedMemory.locationLat!],
      zoom: 10.25,
      duration: 850,
    });
  }, [latestLocatedMemory, mapLoading, mapLoaded, selectedId]);

  useEffect(() => {
    if (!mapLoaded || memoryPanelOpen || showForm || searchOpen || filtersOpen) return;
    const hintState = readMapAddHintState();
    const today = format(new Date(), "yyyy-MM-dd");
    if (hintState.completed || hintState.visitsShown >= 3 || hintState.lastShown === today || (hintState.dismissedUntil ?? 0) > Date.now()) return;

    mapHintTimerRef.current = window.setTimeout(() => {
      setShowMapAddHint(true);
      writeMapAddHintState({ ...hintState, visitsShown: hintState.visitsShown + 1, lastShown: today });
      mapHintDismissTimerRef.current = window.setTimeout(() => setShowMapAddHint(false), 5_000);
    }, 1_200);

    return () => {
      if (mapHintTimerRef.current !== null) window.clearTimeout(mapHintTimerRef.current);
      mapHintTimerRef.current = null;
    };
  }, [filtersOpen, mapLoaded, memoryPanelOpen, searchOpen, showForm]);

  useEffect(() => () => {
    if (mapHintTimerRef.current !== null) window.clearTimeout(mapHintTimerRef.current);
    if (mapHintDismissTimerRef.current !== null) window.clearTimeout(mapHintDismissTimerRef.current);
  }, []);

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
    setCardDirection(0);
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
    setCardDirection(direction < 0 ? -1 : 1);
    setSelectedId(sharedLocationMemories[nextIndex].id);
  };

  const updateMapView = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    setMapView({ bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], zoom: map.getZoom() });
  };

  const clearMapLongPress = () => {
    if (mapLongPressTimerRef.current !== null) window.clearTimeout(mapLongPressTimerRef.current);
    mapLongPressTimerRef.current = null;
  };

  const dismissMapAddHint = (snooze = false) => {
    if (mapHintTimerRef.current !== null) window.clearTimeout(mapHintTimerRef.current);
    if (mapHintDismissTimerRef.current !== null) window.clearTimeout(mapHintDismissTimerRef.current);
    mapHintTimerRef.current = null;
    mapHintDismissTimerRef.current = null;
    setShowMapAddHint(false);
    if (snooze) writeMapAddHintState({ ...readMapAddHintState(), dismissedUntil: Date.now() + 7 * 24 * 60 * 60 * 1_000 });
  };

  const completeMapAddHint = () => {
    writeMapAddHintState({ ...readMapAddHintState(), completed: true });
    dismissMapAddHint();
  };

  const chooseMapDraftLocation = async (lat: number, lng: number, suppressNextClick = false) => {
    clearMapLongPress();
    suppressMapClickRef.current = suppressNextClick;
    setMemoryPanelOpen(false);
    setSelectedId(null);
    setActiveCollectionIds([]);
    setMapDraftLocation({ name: "Selected map location", lat, lng, placeId: null });
    setResolvingMapDraft(true);
    const requestId = ++mapLocationRequestRef.current;
    try {
      const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
      if (!apiKey) throw new Error("Geoapify API key is not configured");
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), apiKey, format: "geojson" });
      const response = await fetch(`https://api.geoapify.com/v1/geocode/reverse?${params}`);
      if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status})`);
      const properties = (await response.json())?.features?.[0]?.properties;
      if (requestId !== mapLocationRequestRef.current) return;
      setMapDraftLocation({ name: properties?.formatted || properties?.address_line2 || "Selected map location", lat, lng, placeId: properties?.place_id ?? null });
    } catch (error) {
      console.error(error);
    } finally {
      if (requestId === mapLocationRequestRef.current) setResolvingMapDraft(false);
    }
  };

  return (
    <main className={`memory-map-home ${!isMobile && memoryPanelOpen && selectedMemory ? "has-desktop-inspector" : ""}`}>
      <Map
        ref={mapRef}
        onLoad={() => { setMapLoaded(true); updateMapView(); }}
        onMoveEnd={updateMapView}
        onMoveStart={(event) => { clearMapLongPress(); if (event.originalEvent) dismissMapAddHint(); }}
        onContextMenu={(event) => {
          event.originalEvent.preventDefault();
          void chooseMapDraftLocation(event.lngLat.lat, event.lngLat.lng);
        }}
        onTouchStart={(event) => {
          dismissMapAddHint();
          clearMapLongPress();
          const { lat, lng } = event.lngLat;
          mapLongPressTimerRef.current = window.setTimeout(() => { void chooseMapDraftLocation(lat, lng, true); }, 650);
        }}
        onTouchEnd={clearMapLongPress}
        onClick={() => {
          dismissMapAddHint();
          if (suppressMapClickRef.current) { suppressMapClickRef.current = false; return; }
          setSearchOpen(false);
          setFiltersOpen(false);
          setMapDraftLocation(null);
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
        {!isMobile && <NavigationControl position="bottom-right" showCompass={false} />}
        {mapDraftLocation && <Marker longitude={mapDraftLocation.lng} latitude={mapDraftLocation.lat} anchor="bottom">
          <div className="memory-pin map-draft-pin" aria-hidden="true"><span className="pin-brand-quote">“</span></div>
        </Marker>}
        {mapClusters.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          if (feature.properties.cluster) {
            const clusterLeaves = clusterIndex.getLeaves(feature.properties.cluster_id, Infinity);
            const clusterMemories = clusterLeaves.map((leaf) => visibleMemories.find((memory) => memory.id === leaf.properties.memoryId)).filter((memory): memory is Memory => Boolean(memory));
            const hasFriendMemories = clusterMemories.some((memory) => Boolean(memory.userId && memory.userId !== user?.id));
            const hasOwnMemories = clusterMemories.some((memory) => !memory.userId || memory.userId === user?.id);
            const clusterOwnership = hasFriendMemories && hasOwnMemories ? "mixed-ownership" : hasFriendMemories ? "friends-ownership" : "own-ownership";
            return <Marker key={`cluster-${feature.properties.cluster_id}`} longitude={longitude} latitude={latitude} anchor="center">
            <button
              type="button"
              className={`memory-cluster ${clusterOwnership}`}
              aria-label={`${feature.properties.point_count} memories nearby`}
              onClick={(event) => {
                event.stopPropagation();
                const leaves = clusterLeaves;
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
          }
          const memory = visibleMemories.find((item) => item.id === feature.properties.memoryId);
          const isFriendPin = Boolean(memory?.userId && memory.userId !== user?.id);
          const ownerName = memory?.displayName || memory?.username || "Friend";
          return memory ? <Marker key={memory.id} longitude={longitude} latitude={latitude} anchor="bottom">
            <button
              type="button"
              className={`memory-pin ${isFriendPin ? "friend-memory-pin" : ""} ${memory.id === selectedMemory?.id ? "is-selected" : ""}`}
              aria-label={`Open ${memory.title}${isFriendPin ? ` by ${ownerName}` : ""}`}
              onClick={(event) => { event.stopPropagation(); selectMemory(memory); }}
            >
              {isFriendPin ? <span className="friend-pin-avatar" aria-hidden="true" style={!memory.avatarUrl ? { backgroundColor: FRIEND_COLOR } : undefined}>{memory.avatarUrl ? <img src={memory.avatarUrl} alt="" /> : ownerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span> : <span className="pin-brand-quote" aria-hidden="true">“</span>}
            </button>
          </Marker> : null;
        })}
      </Map>

      <div className="map-wash" aria-hidden="true" />

      {showMapAddHint && !memoryPanelOpen && !showForm && !searchOpen && !filtersOpen && !mapDraftLocation && <div className="map-add-hint" role="status">
        <MapPin />
        <span>{isMobile ? "Long-press the map to add a memory here" : "Right-click the map to add a memory here"}</span>
        <button type="button" onClick={() => dismissMapAddHint(true)} aria-label="Dismiss map tip for seven days"><X /></button>
      </div>}

      {mapDraftLocation && <div className="map-add-memory-prompt" role="dialog" aria-label="Add a memory at this location" onClick={(event) => event.stopPropagation()}>
        <MapPin />
        <div><strong>Add a memory here?</strong><span>{resolvingMapDraft ? "Finding this place…" : mapDraftLocation.name}</span></div>
        <button type="button" onClick={() => { mapLocationRequestRef.current += 1; setMapDraftLocation(null); setResolvingMapDraft(false); }}>Cancel</button>
        <button type="button" className="confirm" disabled={resolvingMapDraft} onClick={() => { setFormInitialLocation(mapDraftLocation); setMapDraftLocation(null); setShowForm(true); }}>Add memory</button>
      </div>}

      <header className="map-header">
        <button type="button" className="add-memory-pill" title={isMobile ? "Add a memory, or long-press the map to choose a place" : "Add a memory, or right-click the map to choose a place"} aria-label={isMobile ? "Add memory. You can also long-press the map to choose a place." : "Add memory. You can also right-click the map to choose a place."} onClick={() => { setMapDraftLocation(null); setFormInitialLocation(null); setShowForm(true); }}>
          <Plus size={23} strokeWidth={2.2} />
          <span>Add</span>
        </button>
        <div className="mobile-map-search">
          <Search size={22} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories…" aria-label="Search memories" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}
        </div>
        <button type="button" className={`map-filter-button ${yearFrom || yearTo || favoritesOnly || displayFilterActive ? "active" : ""}`} onClick={() => setFiltersOpen(true)} aria-label="Filter map memories"><SlidersHorizontal /></button>
      </header>

      {isMobile && focusedMapFriend && <div className="mobile-friend-map-owner" aria-label={`Viewing @${focusedMapFriend.username}'s map`}>
        {focusedMapFriend.avatarUrl ? <img src={focusedMapFriend.avatarUrl} alt="" /> : <span>{focusedMapFriend.username.slice(0,2).toUpperCase()}</span>}
        <div><strong>@{focusedMapFriend.username}</strong><small>{friendMapLoading || friendsLoading ? "Loading memories…" : `${focusedMapFriendMemoryCount} shared ${focusedMapFriendMemoryCount === 1 ? "memory" : "memories"}`}</small></div>
      </div>}

      {query && <div className="mobile-map-search-results">
        {filteredMemories.length ? filteredMemories.slice(0, 5).map((memory) => <button key={memory.id} onClick={() => selectMemory(memory)}><strong>{memory.title}</strong><span>{memory.songTitle} · {memory.locationName}</span></button>) : <p>No memories found.</p>}
      </div>}

      <aside className="desktop-map-sidebar">
        <button type="button" className="desktop-add-memory" title="Add a memory, or right-click the map to choose a place" onClick={() => { setMapDraftLocation(null); setFormInitialLocation(null); setShowForm(true); }}><Plus /><span>Add memory</span></button>
        <nav className="desktop-map-nav" aria-label="Desktop navigation">
          <button className="active"><MapIcon /><span>Map</span></button>
          <button onClick={() => navigate("/journal")}><Heart /><span>Memories</span></button>
          <button onClick={() => navigate("/friends")}><ContactRound /><span>Friends</span></button>
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
        <button type="button" className={`desktop-map-tool-button ${yearFrom || yearTo || favoritesOnly || displayFilterActive ? "active" : ""}`} onClick={() => { setSearchOpen(false); setFiltersOpen((open) => !open); }} aria-label="Filter map memories"><SlidersHorizontal /></button>
        {filtersOpen && <div className="desktop-map-filter-card">
          <div className="desktop-filter-card-header"><strong>Filter memories</strong><button type="button" disabled={allFiltersDefault} onClick={clearMapFilters}>Clear</button></div>
          {mapDisplayControls}
          {yearRangeControls}
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
        <button type="button" className={`desktop-map-filter ${yearFrom || yearTo || favoritesOnly || displayFilterActive ? "active" : ""}`} onClick={() => { setSearchOpen(false); setFiltersOpen((open) => !open); }} aria-label="Filter map memories"><SlidersHorizontal /></button>
        {filtersOpen && <div className="desktop-map-filter-card">
          <div className="desktop-filter-card-header"><strong>Filter memories</strong><button type="button" disabled={allFiltersDefault} onClick={clearMapFilters}>Clear</button></div>
          {mapDisplayControls}
          {yearRangeControls}
          <label className="favorites-filter"><span><Star /> Favorites only</span><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></label>
          <button className="apply-memory-filters" onClick={() => setFiltersOpen(false)}>Show on map</button>
        </div>}
      </div>}

      <AnimatePresence mode="sync" custom={{ direction: cardDirection, isCollection: sharedLocationMemories.length > 1 }}>
      {!mapLoading && selectedMemory && memoryPanelOpen && (
        <motion.article
          key={`${isMobile ? "mobile" : "desktop"}-${selectedMemory.id}`}
          className={`now-playing-memory ${isMobile && sharedLocationMemories.length > 1 ? `has-location-collection ${sharedLocationIndex === 0 ? "collection-first" : sharedLocationIndex === sharedLocationMemories.length - 1 ? "collection-last" : "collection-middle"}` : ""}`}
          custom={{ direction: cardDirection, isCollection: sharedLocationMemories.length > 1 }}
          variants={isMobile ? mobileCardVariants : undefined}
          initial={isMobile ? "initial" : { opacity: 0, x: 28, scale: 0.985 }}
          animate={isMobile ? "animate" : { opacity: 1, x: 0, scale: 1 }}
          exit={isMobile ? "exit" : { opacity: 0, x: 24, scale: 0.99 }}
          transition={{ duration: prefersReducedMotion ? 0 : isMobile ? 0.28 : 0.32, ease: [0.4, 0, 0.2, 1] }}
          onClick={() => { if (!isMobile) return; if (requestedProfileId || (selectedMemory.userId && selectedMemory.userId !== user?.id)) navigate(`/discover/memories/${selectedMemory.id}`); else setDetailMemory(selectedMemory); }}
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
            {sharedLocationMemories.length > 1 && <div className="memory-carousel-arrows" onClick={(event) => event.stopPropagation()}>
              <button disabled={sharedLocationIndex === 0} onClick={() => selectAdjacentLocationMemory(-1)} aria-label="Previous memory"><ChevronLeft /></button>
              <span aria-live="polite" aria-atomic="true">{sharedLocationIndex + 1} of {sharedLocationMemories.length}</span>
              <button disabled={sharedLocationIndex === sharedLocationMemories.length - 1} onClick={() => selectAdjacentLocationMemory(1)} aria-label="Next memory"><ChevronRight /></button>
            </div>}
            <div className="memory-story">
              {selectedMemory.userId && selectedMemory.userId !== user?.id && <p className="memory-owner">{selectedMemory.avatarUrl ? <img src={selectedMemory.avatarUrl} alt="" /> : <span style={{ backgroundColor: FRIEND_COLOR }}>{(selectedMemory.displayName || selectedMemory.username || "Friend").slice(0,2).toUpperCase()}</span>}<strong>{selectedMemory.displayName || `@${selectedMemory.username || "friend"}`}</strong></p>}
              <div className="memory-title-row"><h1>{selectedMemory.title}</h1></div>
              <div className="memory-meta">
                <p className="memory-location" title={selectedMemory.locationName || "Somewhere special"}>{selectedMemory.locationName || "Somewhere special"}</p>
                <time dateTime={selectedMemory.date}>{format(new Date(`${selectedMemory.date}T12:00:00`), "MMM d, yyyy")}</time>
              </div>
              <div onClick={(event) => event.stopPropagation()}><MiniPlayer key={`${selectedMemory.id}:${selectedMemory.songTitle}:${selectedMemory.artist}`} songTitle={selectedMemory.songTitle} artist={selectedMemory.artist} variant="map" /></div>
            </div>
            {sharedLocationMemories.length > 1 && sharedLocationIndex > 0 && (() => {
              const previousMemory = sharedLocationMemories[sharedLocationIndex - 1];
              return <button type="button" className="previous-memory-card-peek" onClick={(event) => { event.stopPropagation(); selectAdjacentLocationMemory(-1); }} aria-label={`Show previous memory: ${previousMemory.title}`}>
                <img src={previousMemory.imageUrl || "/landing/landing_02.png"} alt="" />
                <span><strong>{previousMemory.title}</strong><small>{previousMemory.locationName || "Somewhere special"}</small></span>
              </button>;
            })()}
            {sharedLocationMemories.length > 1 && sharedLocationIndex < sharedLocationMemories.length - 1 && (() => {
              const nextMemory = sharedLocationMemories[sharedLocationIndex + 1];
              return <button type="button" className="next-memory-card-peek" onClick={(event) => { event.stopPropagation(); selectAdjacentLocationMemory(1); }} aria-label={`Show next memory: ${nextMemory.title}`}>
                <img src={nextMemory.imageUrl || "/landing/landing_02.png"} alt="" />
                <span><strong>{nextMemory.title}</strong><small>{nextMemory.locationName || "Somewhere special"}</small></span>
              </button>;
            })()}
          </> : <>
            <div className="inspector-scroll-area">
              <div className="desktop-inspector-media">
                <MemoryPhotoGallery memory={selectedMemory} />
                <div className="desktop-inspector-actions" onClick={(event) => event.stopPropagation()}>
                  {!requestedProfileId && (!selectedMemory.userId || selectedMemory.userId === user?.id) && <div className="desktop-inspector-menu-wrap">
                    <button onClick={() => setInspectorMenuOpen((current) => !current)} aria-label="Memory actions"><MoreHorizontal /></button>
                    {inspectorMenuOpen && <div className="desktop-inspector-menu">
                      <button onClick={() => { setInspectorMenuOpen(false); setEditingMemory(selectedMemory); }}><Pencil />Edit memory</button>
                      <button className="danger" onClick={() => { setInspectorMenuOpen(false); setDeleteOpen(true); }}><Trash2 />Delete memory</button>
                    </div>}
                  </div>}
                  <button onClick={() => { setInspectorMenuOpen(false); setSearchOpen(false); setMemoryPanelOpen(false); }} aria-label="Close inspector"><X /></button>
                </div>
              </div>
              <div className="memory-story">
                {selectedMemory.userId && selectedMemory.userId !== user?.id && <p className="memory-owner">{selectedMemory.avatarUrl ? <img src={selectedMemory.avatarUrl} alt="" /> : <span style={{ backgroundColor: FRIEND_COLOR }}>{(selectedMemory.displayName || selectedMemory.username || "Friend").slice(0,2).toUpperCase()}</span>}<strong>{selectedMemory.displayName || `@${selectedMemory.username || "friend"}`}</strong></p>}
                <div className="memory-title-row"><h1>{selectedMemory.title}</h1></div>
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
        <button onClick={() => navigate("/friends")}><ContactRound /><span>Friends</span></button>
        <button onClick={() => navigate("/account")}><UserRound /><span>Account</span></button>
      </nav>

      <QuickAddMemorySheet open={showForm} initialLocation={formInitialLocation} onOpenChange={(open) => { setShowForm(open); if (!open) setFormInitialLocation(null); }} onAdd={async (data) => { const saved = Boolean(await addMemory({ ...data, tags: data.tags ?? [] })); if (saved && formInitialLocation) completeMapAddHint(); return saved; }} />
      {detailMemory && <MemoryDetail overlay memoryOverride={detailMemory} onClose={() => setDetailMemory(null)} />}
      <QuickAddMemorySheet open={Boolean(editingMemory)} editingMemory={editingMemory} onOpenChange={(next) => { if (!next) setEditingMemory(null); }} onAdd={async (data) => { if (!editingMemory) return false; const saved = await updateMemory(editingMemory.id, { ...data, tags: data.tags ?? [] }); if (saved) setEditingMemory(null); return saved; }} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent className="max-w-sm rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this memory?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{selectedMemory?.title}.” This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!selectedMemory) return; await deleteMemory(selectedMemory.id); setMemoryPanelOpen(false); setSelectedId(null); setActiveCollectionIds([]); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Sheet open={isMobile && filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="memories-filter-sheet">
          <SheetHeader><SheetTitle>Filter map memories</SheetTitle></SheetHeader>
          <button type="button" className="mobile-clear-map-filters" disabled={allFiltersDefault} onClick={clearMapFilters}>Clear filters</button>
          {mapDisplayControls}
          {yearRangeControls}
          <label className="favorites-filter"><span><Star /> Favorites only</span><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></label>
          <button className="apply-memory-filters" onClick={() => { setFiltersOpen(false); if (selectedId && !visibleMemories.some((memory) => memory.id === selectedId)) { setSelectedId(null); setMemoryPanelOpen(false); setActiveCollectionIds([]); } }}>Show on map</button>
        </SheetContent>
      </Sheet>
    </main>
  );
};

export default MemoryMapHome;
