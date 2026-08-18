import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ContactRound, Heart, Map as MapIcon, MapPin, Music2, Plus, Search, SlidersHorizontal, Star, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useMemories } from "@/hooks/useMemories";
import type { Memory } from "@/types/memory";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import QuickAddMemorySheet from "@/components/QuickAddMemorySheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useFriendRequestCount } from "@/hooks/useFriendRequestCount";
import MemoryDetail from "@/pages/MemoryDetail";

const FAVORITES_KEY = "momentunes:favorite-memories";
const shortLocation = (location: string) => {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  const city = parts.length >= 4 ? parts[1] : parts[0];
  return [city, parts[parts.length - 1]].join(", ");
};

const MemoriesLibrary = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile: currentProfile } = useCurrentProfile();
  const friendRequestCount = useFriendRequestCount();
  const [searchParams] = useSearchParams();
  const { memories, loading, addMemory } = useMemories();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(() => searchParams.get("favorites") === "true");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); } catch { return new Set(); }
  });
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [detailMemory, setDetailMemory] = useState<Memory | null>(null);
  const displayName = currentProfile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Your profile";
  const username = currentProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";
  const avatarUrl = currentProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

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

  useEffect(() => window.scrollTo(0, 0), []);
  useEffect(() => {
    setFavoritesOnly(searchParams.get("favorites") === "true");
  }, [searchParams]);

  return <main className="memories-library">
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
          return <article key={memory.id} className="memory-library-row" onClick={() => setDetailMemory(memory)}>
            <img src={memory.imageUrl || "/landing/landing_02.png"} alt="" />
            <div className="memory-row-copy">
              <h2><span className="memory-row-title">{memory.title}</span></h2>
              <div className="memory-row-meta">
                <p><MapPin /> <span>{memory.locationName ? shortLocation(memory.locationName) : "Somewhere special"}</span></p>
                <p><CalendarDays /> <span>{format(new Date(`${memory.date}T12:00:00`), "dd/MM/yy")}</span></p>
              </div>
              <p className="memory-row-song"><Music2 /> <span>{memory.songTitle} — {memory.artist}</span></p>
            </div>
            <div className="memory-row-actions">
              <button type="button" className="memory-row-more" onClick={(event) => { event.stopPropagation(); setDetailMemory(memory); }}>See more</button>
              <button type="button" className={`memory-row-favorite ${isFavorite ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); toggleFavorite(memory.id); }} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}><Star fill={isFavorite ? "currentColor" : "none"} /></button>
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
  </main>;
};

export default MemoriesLibrary;
