import { useEffect, useMemo, useRef, useState } from "react";
import Map, { type MapRef, type MapStyle } from "react-map-gl/maplibre";
import { CalendarDays, ChevronRight, ImagePlus, Loader2, MapPin, Music2, X } from "lucide-react";
import { toast } from "sonner";
import LocationSearch, { type LocationResult } from "@/components/LocationSearch";
import SongSearch from "@/components/SongSearch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { seasonFromDate, yearFromDate } from "@/lib/memoryTime";
import type { Memory } from "@/types/memory";

type QuickMemory = {
  title: string; description: string; songTitle: string; artist: string; date: string;
  memoryYear?: number | null; memorySeason?: string | null; locationName?: string | null;
  locationLat?: number | null; locationLng?: number | null; locationPlaceId?: string | null;
  mood: string; people: string[]; isPublic: boolean; imageUrl?: string | null; imageUrls?: string[]; tags?: string[];
};

type QuickAddMemorySheetProps = { open: boolean; onOpenChange: (open: boolean) => void; onAdd: (memory: QuickMemory) => Promise<boolean>; editingMemory?: Memory | null };

const pickerMapStyle = (apiKey?: string): MapStyle => ({
  version: 8,
  sources: { base: { type: "raster", tiles: [apiKey ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
  layers: [{ id: "base", type: "raster", source: "base", paint: { "raster-opacity": .76, "raster-saturation": -.35 } }],
});

const QuickAddMemorySheet = ({ open, onOpenChange, onAdd, editingMemory }: QuickAddMemorySheetProps) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerMapRef = useRef<MapRef | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [songTitle, setSongTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [locationBeforePicking, setLocationBeforePicking] = useState<LocationResult | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [pickerCenter, setPickerCenter] = useState({ lat: 40.7, lng: -73.92 });
  const [pickerSearch, setPickerSearch] = useState("");
  const mapStyle = useMemo(() => pickerMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY), []);

  useEffect(() => () => { imagePreviews.filter((url) => url.startsWith("blob:")).forEach(URL.revokeObjectURL); }, [imagePreviews]);

  useEffect(() => {
    if (!open || !editingMemory) return;
    setTitle(editingMemory.title);
    setDate(editingMemory.date.slice(0, 10));
    setSongTitle(editingMemory.songTitle);
    setArtist(editingMemory.artist);
    setImageFiles([]);
    setImagePreviews(editingMemory.imageUrls?.length ? editingMemory.imageUrls : editingMemory.imageUrl ? [editingMemory.imageUrl] : []);
    setLocation(
      editingMemory.locationName && typeof editingMemory.locationLat === "number" && typeof editingMemory.locationLng === "number"
        ? { name: editingMemory.locationName, lat: editingMemory.locationLat, lng: editingMemory.locationLng, placeId: editingMemory.locationPlaceId ?? null }
        : null,
    );
  }, [editingMemory, open]);

  const reset = () => {
    setTitle(""); setDate(new Date().toISOString().slice(0, 10)); setLocation(null);
    setSongTitle(""); setArtist(""); setImageFiles([]); setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resolveLocation = async (lat: number, lng: number) => {
    setResolvingLocation(true);
    try {
      const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
      if (!apiKey) throw new Error("Geoapify API key is not configured");
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), apiKey, format: "geojson" });
      const response = await fetch(`https://api.geoapify.com/v1/geocode/reverse?${params}`);
      if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status})`);
      const properties = (await response.json())?.features?.[0]?.properties;
      setLocation({ name: properties?.formatted || properties?.address_line2 || "Pinned location", lat, lng, placeId: properties?.place_id ?? null });
    } catch (error) {
      console.error(error);
      setLocation({ name: "Pinned location", lat, lng, placeId: null });
    } finally { setResolvingLocation(false); }
  };

  const startPickingLocation = () => {
    const center = location ? { lat: location.lat, lng: location.lng } : pickerCenter;
    setLocationBeforePicking(location);
    setPickerSearch(location?.name || "");
    setPickerCenter(center);
    setPickingLocation(true);
    window.setTimeout(() => { pickerMapRef.current?.resize(); pickerMapRef.current?.jumpTo({ center: [center.lng, center.lat], zoom: 11 }); resolveLocation(center.lat, center.lng); }, 50);
  };

  const chooseImages = (files?: FileList | null) => {
    const chosen = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!chosen.length) { toast.error("Choose image files"); return; }
    const room = Math.max(0, 8 - imagePreviews.length);
    const accepted = chosen.slice(0, room);
    if (chosen.length > room) toast.info("You can attach up to 8 photos");
    setImageFiles((current) => [...current, ...accepted]);
    setImagePreviews((current) => [...current, ...accepted.map(URL.createObjectURL)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadImages = async () => {
    const existingUrls = imagePreviews.filter((url) => !url.startsWith("blob:"));
    if (!imageFiles.length || !user) return existingUrls;
    const uploaded = await Promise.all(imageFiles.map(async (file, index) => {
      const compressed = await compressImage(file);
      const fileName = `${user.id}/${Date.now()}-${index}.jpg`;
      const { error } = await supabase.storage.from("memory-images").upload(fileName, compressed, { contentType: "image/jpeg" });
      if (error) throw error;
      return supabase.storage.from("memory-images").getPublicUrl(fileName).data.publicUrl;
    }));
    return [...existingUrls, ...uploaded];
  };

  const save = async () => {
    if (!title.trim()) { toast.error("Give this memory a title"); return; }
    if (!location) { toast.error("Drop a pin for this memory"); return; }
    if (!date) { toast.error("Choose a date"); return; }
    if (!songTitle.trim() || !artist.trim()) { toast.error("Choose a song"); return; }
    setSaving(true);
    try {
      const imageUrls = await uploadImages();
      const saved = await onAdd({
        title: title.trim(), description: editingMemory?.description ?? "", songTitle: songTitle.trim(), artist: artist.trim(), date,
        memoryYear: yearFromDate(date), memorySeason: seasonFromDate(date), locationName: location.name,
        locationLat: location.lat, locationLng: location.lng, locationPlaceId: location.placeId,
        mood: editingMemory?.mood || "🎵 Soundtracked", people: editingMemory?.people ?? [], isPublic: editingMemory?.isPublic ?? false, imageUrl: imageUrls[0] ?? null, imageUrls, tags: editingMemory?.tags ?? [],
      });
      if (saved) { reset(); onOpenChange(false); }
    } catch (error) {
      console.error(error); toast.error("Could not save this memory");
    } finally { setSaving(false); }
  };

  return <Sheet open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
    <SheetContent side="bottom" className={`quick-memory-sheet ${pickingLocation ? "is-picking-location" : ""}`}>
      <SheetHeader className="sr-only"><SheetTitle>Add memory</SheetTitle></SheetHeader>
      {pickingLocation ? <div className="embedded-location-picker">
        <Map ref={pickerMapRef} initialViewState={{ longitude: pickerCenter.lng, latitude: pickerCenter.lat, zoom: 11 }} mapStyle={mapStyle} dragRotate={false} touchPitch={false} attributionControl={false} onMove={() => setResolvingLocation(true)} onMoveEnd={() => { const center = pickerMapRef.current?.getCenter(); if (!center) return; setPickerCenter({ lat: center.lat, lng: center.lng }); resolveLocation(center.lat, center.lng); }} style={{ position: "absolute", inset: 0 }} />
        <div className="embedded-picker-search">
          <LocationSearch
            value={pickerSearch}
            onChange={(value, result) => {
              setPickerSearch(value);
              if (!result) return;
              setLocation(result);
              setPickerCenter({ lat: result.lat, lng: result.lng });
              pickerMapRef.current?.flyTo({ center: [result.lng, result.lat], zoom: 14, duration: 650 });
            }}
            maxLength={120}
            menuPlacement="bottom"
          />
        </div>
        <div className="embedded-picker-title"><strong>Choose a location</strong><span>Move the map beneath the pin</span></div>
        <div className="embedded-picker-pin memory-pin is-selected" aria-hidden="true"><span className="pin-brand-quote">“</span></div>
        <div className="embedded-picker-card"><div><MapPin /><span>{resolvingLocation ? "Finding this place…" : location?.name || "Move the map to choose a place"}</span></div><div><button onClick={() => { setLocation(locationBeforePicking); setPickingLocation(false); }}>Cancel</button><button className="confirm" disabled={!location || resolvingLocation} onClick={() => setPickingLocation(false)}>Confirm location</button></div></div>
      </div> : <div className="quick-memory-fields">
        <input className="quick-primary-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Memory title" maxLength={80} autoFocus />
        <button
          type="button"
          className={`quick-picker-field quick-location-picker ${location ? "has-value" : ""}`}
          onClick={startPickingLocation}
        ><MapPin /><span>{location?.name || "Drop a pin on the map"}</span><ChevronRight /></button>
        <label className="quick-picker-field"><CalendarDays /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><ChevronRight /></label>
        <div className={`quick-photo-field ${imagePreviews.length ? "has-images" : ""}`}>
          {imagePreviews.length ? <div className="quick-photo-grid">{imagePreviews.map((preview, index) => <div key={preview}><img src={preview} alt={`Selected memory ${index + 1}`} /><button type="button" onClick={() => { setImagePreviews((current) => current.filter((_, itemIndex) => itemIndex !== index)); const blobIndex = imagePreviews.slice(0, index + 1).filter((url) => url.startsWith("blob:")).length - 1; if (preview.startsWith("blob:")) setImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== blobIndex)); }}><X /></button></div>)}</div> : <><ImagePlus /><strong>Add photos</strong><small>Choose up to 8 moments from your library</small></>}
          {imagePreviews.length < 8 && <button type="button" className="quick-add-another-photo" onClick={() => fileInputRef.current?.click()}><ImagePlus />{imagePreviews.length ? "Add another" : "Choose photos"}</button>}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => chooseImages(event.target.files)} />
        <div className="quick-song-field"><Music2 /><SongSearch songTitle={songTitle} artist={artist} onSelect={(song, songArtist) => { setSongTitle(song); setArtist(songArtist); }} onSongTitleChange={setSongTitle} onArtistChange={setArtist} /></div>
        <button type="button" className="quick-save-memory" onClick={save} disabled={saving}>{saving ? <><Loader2 className="animate-spin" />Saving…</> : editingMemory ? "Save changes" : "Add memory"}</button>
      </div>}
    </SheetContent>
  </Sheet>;
};

export default QuickAddMemorySheet;
