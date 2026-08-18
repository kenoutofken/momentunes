import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { type MapRef, type MapStyle } from "react-map-gl/maplibre";
import { CalendarDays, ChevronRight, ImagePlus, Loader2, MapPin, Music2, X } from "lucide-react";
import { toast } from "sonner";
import { parse as parseExif } from "exifr";
import LocationSearch, { type LocationResult } from "@/components/LocationSearch";
import SongSearch from "@/components/SongSearch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { compressImage } from "@/lib/compressImage";
import { canDecodeImage, imageFileError, SUPPORTED_IMAGE_ACCEPT } from "@/lib/imageFileValidation";
import { convertDngToJpeg, isDngFile } from "@/lib/convertRawImage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { seasonFromDate, yearFromDate } from "@/lib/memoryTime";
import type { Memory } from "@/types/memory";
import { format } from "date-fns";

type QuickMemory = {
  title: string; description: string; songTitle: string; artist: string; date: string;
  memoryYear?: number | null; memorySeason?: string | null; locationName?: string | null;
  locationLat?: number | null; locationLng?: number | null; locationPlaceId?: string | null;
  mood: string; people: string[]; isPublic: boolean; imageUrl?: string | null; imageUrls?: string[]; imageFocusPoints?: Array<{ x: number; y: number }>; tags?: string[];
};

type QuickAddMemorySheetProps = { open: boolean; onOpenChange: (open: boolean) => void; onAdd: (memory: QuickMemory) => Promise<boolean>; editingMemory?: Memory | null; initialLocation?: LocationResult | null };

const pickerMapStyle = (apiKey?: string): MapStyle => ({
  version: 8,
  sources: { base: { type: "raster", tiles: [apiKey ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
  layers: [{ id: "base", type: "raster", source: "base", paint: { "raster-opacity": .76, "raster-saturation": -.35 } }],
});

const QuickAddMemorySheet = ({ open, onOpenChange, onAdd, editingMemory, initialLocation }: QuickAddMemorySheetProps) => {
  const { user } = useAuth();
  const isMobile = useIsMobile(900);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const pickerMapRef = useRef<MapRef | null>(null);
  const requestedDeviceLocationRef = useRef(false);
  const dateTouchedRef = useRef(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [songTitle, setSongTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageFocusPoints, setImageFocusPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [adjustingPhoto, setAdjustingPhoto] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [locationBeforePicking, setLocationBeforePicking] = useState<LocationResult | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [locatingDevice, setLocatingDevice] = useState(false);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [pickerCenter, setPickerCenter] = useState({ lat: 40.7, lng: -73.92 });
  const [pickerSearch, setPickerSearch] = useState("");
  const mapStyle = useMemo(() => pickerMapStyle(import.meta.env.VITE_GEOAPIFY_API_KEY), []);
  const today = new Date().toISOString().slice(0, 10);
  const dateLabel = date === today ? "Today" : format(new Date(`${date}T12:00:00`), "MMMM d, yyyy");
  const hasRequiredFields = Boolean(
    title.trim() && location && date && songTitle.trim() && artist.trim(),
  );

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  };

  useEffect(() => () => { imagePreviews.filter((url) => url.startsWith("blob:")).forEach(URL.revokeObjectURL); }, [imagePreviews]);

  useEffect(() => {
    if (!open || !editingMemory) return;
    dateTouchedRef.current = true;
    setTitle(editingMemory.title);
    setDate(editingMemory.date.slice(0, 10));
    setSongTitle(editingMemory.songTitle);
    setArtist(editingMemory.artist);
    setImageFiles([]);
    setImagePreviews(editingMemory.imageUrls?.length ? editingMemory.imageUrls : editingMemory.imageUrl ? [editingMemory.imageUrl] : []);
    setImageFocusPoints(editingMemory.imageFocusPoints?.length ? editingMemory.imageFocusPoints : (editingMemory.imageUrls?.length ? editingMemory.imageUrls : editingMemory.imageUrl ? [editingMemory.imageUrl] : []).map(() => ({ x: 50, y: 50 })));
    setLocation(
      editingMemory.locationName && typeof editingMemory.locationLat === "number" && typeof editingMemory.locationLng === "number"
        ? { name: editingMemory.locationName, lat: editingMemory.locationLat, lng: editingMemory.locationLng, placeId: editingMemory.locationPlaceId ?? null }
        : null,
    );
  }, [editingMemory, open]);

  useEffect(() => {
    if (!open || editingMemory || !initialLocation) return;
    setLocation(initialLocation);
    setPickerCenter({ lat: initialLocation.lat, lng: initialLocation.lng });
  }, [editingMemory, initialLocation, open]);

  const reset = () => {
    setTitle(""); setDate(new Date().toISOString().slice(0, 10)); setLocation(null);
    setSongTitle(""); setArtist(""); setImageFiles([]); setImagePreviews([]); setImageFocusPoints([]); setAdjustingPhoto(null);
    dateTouchedRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resolveLocation = useCallback(async (lat: number, lng: number) => {
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
  }, []);

  useEffect(() => {
    if (!open) {
      requestedDeviceLocationRef.current = false;
      setLocatingDevice(false);
      return;
    }
    if (editingMemory || initialLocation || location || requestedDeviceLocationRef.current || !navigator.geolocation) return;

    requestedDeviceLocationRef.current = true;
    let cancelled = false;
    setLocatingDevice(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;
        const currentPosition = { lat: coords.latitude, lng: coords.longitude };
        setLocatingDevice(false);
        setPickerCenter(currentPosition);
        void resolveLocation(currentPosition.lat, currentPosition.lng);
      },
      () => { if (!cancelled) setLocatingDevice(false); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 },
    );
    return () => { cancelled = true; };
  }, [editingMemory, initialLocation, location, open, resolveLocation]);

  const startPickingLocation = () => {
    const center = location ? { lat: location.lat, lng: location.lng } : pickerCenter;
    setLocationBeforePicking(location);
    setPickerSearch(location?.name || "");
    setPickerCenter(center);
    setPickingLocation(true);
    window.setTimeout(() => { pickerMapRef.current?.resize(); pickerMapRef.current?.jumpTo({ center: [center.lng, center.lat], zoom: 11 }); resolveLocation(center.lat, center.lng); }, 50);
  };

  const chooseImages = async (files?: FileList | null) => {
    const chosen = Array.from(files ?? []);
    if (!chosen.length) return;
    const room = Math.max(0, 8 - imagePreviews.length);
    const accepted: File[] = [];
    const shouldSuggestDate = !editingMemory && !dateTouchedRef.current && imageFiles.length === 0;
    let dateSuggested = false;
    for (const file of chosen.slice(0, room)) {
      const formatError = imageFileError(file);
      if (formatError) { toast.error(formatError); continue; }

      if (shouldSuggestDate && !dateSuggested) {
        try {
          // EXIF is read from the original file — compressImage/RAW conversion re-encode via canvas, which strips it.
          const exif = await parseExif(file, ["DateTimeOriginal", "CreateDate"]);
          const captured: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;
          if (captured instanceof Date && !Number.isNaN(captured.getTime())) {
            dateTouchedRef.current = true;
            dateSuggested = true;
            setDate(`${captured.getFullYear()}-${String(captured.getMonth() + 1).padStart(2, "0")}-${String(captured.getDate()).padStart(2, "0")}`);
            toast.info(`Date set from photo: ${format(captured, "MMMM d, yyyy")}`);
          }
        } catch { /* No EXIF date on this file (HEIC/PNG/screenshot, or stripped by the OS) — leave the date as-is. */ }
      }

      if (isDngFile(file)) {
        const toastId = toast.loading(`Converting “${file.name}”…`);
        try {
          accepted.push(await convertDngToJpeg(file));
        } catch (error) {
          console.error(error);
          toast.error(`Couldn't convert “${file.name}”. Try exporting it as JPEG.`);
        } finally {
          toast.dismiss(toastId);
        }
        continue;
      }

      if (!(await canDecodeImage(file))) { toast.error(`“${file.name}” could not be read. Try exporting it as JPEG.`); continue; }
      accepted.push(file);
    }
    if (chosen.length > room) toast.info("You can attach up to 8 photos");
    if (!accepted.length) { if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    setImageFiles((current) => [...current, ...accepted]);
    setImagePreviews((current) => [...current, ...accepted.map(URL.createObjectURL)]);
    setImageFocusPoints((current) => [...current, ...accepted.map(() => ({ x: 50, y: 50 }))]);
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
        mood: editingMemory?.mood || "🎵 Soundtracked", people: editingMemory?.people ?? [], isPublic: editingMemory?.isPublic ?? false, imageUrl: imageUrls[0] ?? null, imageUrls, imageFocusPoints: imageUrls.map((_, index) => imageFocusPoints[index] ?? { x: 50, y: 50 }), tags: editingMemory?.tags ?? [],
      });
      if (saved) { reset(); onOpenChange(false); }
    } catch (error) {
      console.error(error); toast.error("Could not save this memory");
    } finally { setSaving(false); }
  };

  return <Sheet open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
    <SheetContent side={isMobile ? "bottom" : "right"} insetForHandle={false} className={`quick-memory-sheet ${pickingLocation ? "is-picking-location" : ""}`} onOpenAutoFocus={(event) => event.preventDefault()}>
      <SheetHeader className={isMobile || pickingLocation ? "sr-only" : "quick-memory-heading"}><SheetTitle>{editingMemory ? "Edit memory" : "Add memory"}</SheetTitle></SheetHeader>
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
        <input className="quick-primary-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Memory title" maxLength={80} />
        <button
          type="button"
          className={`quick-picker-field quick-location-picker ${location ? "has-value" : ""}`}
          onClick={startPickingLocation}
        >{locatingDevice || resolvingLocation ? <Loader2 className="animate-spin" /> : <MapPin />}<span>{location?.name || (locatingDevice ? "Getting your current location…" : resolvingLocation ? "Finding this place…" : "Drop a pin on the map")}</span><ChevronRight /></button>
        <button type="button" className="quick-picker-field quick-date-picker" onClick={openDatePicker}><CalendarDays /><span>{dateLabel}</span><ChevronRight /><input ref={dateInputRef} type="date" value={date} onChange={(event) => { dateTouchedRef.current = true; setDate(event.target.value); }} tabIndex={-1} aria-label="Memory date" /></button>
        <div className={`quick-photo-field ${imagePreviews.length ? "has-images" : ""}`} role="button" tabIndex={0} onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) fileInputRef.current?.click(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInputRef.current?.click(); } }}>
          {imagePreviews.length ? <div className="quick-photo-grid">{imagePreviews.map((preview, index) => <div key={preview}><img src={preview} alt={`Selected memory ${index + 1}`} style={{ objectPosition: `${imageFocusPoints[index]?.x ?? 50}% ${imageFocusPoints[index]?.y ?? 50}%` }} /><button type="button" className="quick-remove-photo" aria-label={`Remove photo ${index + 1}`} onClick={() => { setImagePreviews((current) => current.filter((_, itemIndex) => itemIndex !== index)); setImageFocusPoints((current) => current.filter((_, itemIndex) => itemIndex !== index)); const blobIndex = imagePreviews.slice(0, index + 1).filter((url) => url.startsWith("blob:")).length - 1; if (preview.startsWith("blob:")) setImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== blobIndex)); }}><X /></button><button type="button" className="quick-adjust-photo" onClick={() => setAdjustingPhoto(index)}>Adjust</button></div>)}</div> : <><ImagePlus /><strong>Add photos</strong><small>Choose up to 8 moments from your library</small></>}
          {imagePreviews.length > 0 && imagePreviews.length < 8 && <button type="button" className="quick-add-another-photo" onClick={() => fileInputRef.current?.click()}>Add another photo</button>}
        </div>
        <input ref={fileInputRef} type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple hidden onChange={(event) => void chooseImages(event.target.files)} />
        <div className="quick-song-field"><Music2 /><SongSearch songTitle={songTitle} artist={artist} onSelect={(song, songArtist) => { setSongTitle(song); setArtist(songArtist); }} onSongTitleChange={setSongTitle} onArtistChange={setArtist} /></div>
        <button type="button" className="quick-save-memory" onClick={save} disabled={saving || !hasRequiredFields} aria-disabled={saving || !hasRequiredFields}>{saving ? <><Loader2 className="animate-spin" />Saving…</> : editingMemory ? "Save changes" : "Add memory"}</button>
      </div>}
      {adjustingPhoto !== null && imagePreviews[adjustingPhoto] && <div className="photo-focus-editor" onClick={(event) => event.stopPropagation()}>
        <div className="photo-focus-toolbar"><div><strong>Adjust cover</strong><span>Drag to choose the focal point</span></div><button type="button" onClick={() => setAdjustingPhoto(null)}><X /></button></div>
        <div className="photo-focus-frame" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const update = (clientX: number, clientY: number) => { const rect = event.currentTarget.getBoundingClientRect(); const point = { x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)) }; setImageFocusPoints((current) => current.map((item, index) => index === adjustingPhoto ? point : item)); }; update(event.clientX, event.clientY); event.currentTarget.onpointermove = (moveEvent) => update(moveEvent.clientX, moveEvent.clientY); event.currentTarget.onpointerup = () => { event.currentTarget.onpointermove = null; event.currentTarget.onpointerup = null; }; }}>
          <img src={imagePreviews[adjustingPhoto]} alt="Cover position preview" style={{ objectPosition: `${imageFocusPoints[adjustingPhoto]?.x ?? 50}% ${imageFocusPoints[adjustingPhoto]?.y ?? 50}%` }} draggable={false} />
          <span className="photo-focus-target" style={{ left: `${imageFocusPoints[adjustingPhoto]?.x ?? 50}%`, top: `${imageFocusPoints[adjustingPhoto]?.y ?? 50}%` }} />
        </div>
        <div className="photo-focus-actions"><button type="button" onClick={() => setImageFocusPoints((current) => current.map((item, index) => index === adjustingPhoto ? { x: 50, y: 50 } : item))}>Reset</button><button type="button" className="confirm" onClick={() => setAdjustingPhoto(null)}>Done</button></div>
      </div>}
    </SheetContent>
  </Sheet>;
};

export default QuickAddMemorySheet;
