import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MOODS, MEMORY_SEASONS, MEMORY_TYPES } from "@/types/memory";
import { Music, X, Users, Plus, Globe, Lock, ImagePlus, Loader2, Sparkles, MapPin, CircleHelp, Upload } from "lucide-react";
import SongSearch from "@/components/SongSearch";
import { compressImage } from "@/lib/compressImage";
import { canDecodeImage, imageFileError, SUPPORTED_IMAGE_ACCEPT } from "@/lib/imageFileValidation";
import { convertDngToJpeg, isDngFile } from "@/lib/convertRawImage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { dateFromYearSeason, seasonFromDate, yearFromDate } from "@/lib/memoryTime";
import { toast } from "sonner";
import LocationSearch, { type LocationResult } from "@/components/LocationSearch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { Memory } from "@/types/memory";

type FormStage = "ai" | "form";
type FormStep = 0 | 1 | 2;
const FORM_STEPS = ["Memory", "Song & Date", "Details"] as const;
const FLOW_STEPS = ["AI Fill", ...FORM_STEPS] as const;

type PanelDragState = {
  pointerId: number;
  startX: number;
  startY: number;
};

type DraftMemory = {
  title?: unknown;
  description?: unknown;
  songTitle?: unknown;
  artist?: unknown;
  memoryYear?: unknown;
  memorySeason?: unknown;
  locationName?: unknown;
  date?: unknown;
  people?: unknown;
  tags?: unknown;
  moods?: unknown;
};

type LocalDraft = {
  savedAt: string;
  stage: FormStage;
  formStep: FormStep;
  aiPrompt: string;
  title: string;
  description: string;
  songTitle: string;
  artist: string;
  memoryYear: number;
  memorySeason: string;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  locationPlaceId: string | null;
  selectedMoods: string[];
  people: string[];
  selectedTags: string[];
  isPublic: boolean;
  imagePreview: string | null;
};

// The form owns the draft/edit state, then sends one normalized memory object back to the journal hook.
interface AddMemoryFormProps {
  onAdd: (memory: {
    title: string;
    description: string;
    songTitle: string;
    artist: string;
    date: string;
    memoryYear?: number | null;
    memorySeason?: string | null;
    locationName?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
    locationPlaceId?: string | null;
    mood: string;
    people: string[];
    isPublic: boolean;
    imageUrl?: string | null;
    tags?: string[];
  }) => Promise<boolean>;
  onClose: () => void;
  editingMemory?: Memory | null;
}

const CREATE_DRAFT_STORAGE_KEY = "recallfm:new-memory-draft";

const FieldHelp = ({ label, help }: { label: string; help: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={`Help: ${label}`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <CircleHelp size={14} />
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" className="w-[min(240px,calc(100vw-2rem))] p-3 text-xs leading-relaxed">
      <p>{help}</p>
    </PopoverContent>
  </Popover>
);

const FieldLabel = ({
  children,
  help,
  label,
  className = "mb-1",
}: {
  children: ReactNode;
  help: string;
  label: string;
  className?: string;
}) => (
  <div className={`${className} flex items-center gap-1.5 text-sm font-medium text-foreground`}>
    <span>{children}</span>
    <FieldHelp label={label} help={help} />
  </div>
);

const AddMemoryForm = ({ onAdd, onClose, editingMemory }: AddMemoryFormProps) => {
  const isEditing = Boolean(editingMemory);
  const { user } = useAuth();
  const [stage, setStage] = useState<FormStage>(editingMemory ? "form" : "ai");
  const [formStep, setFormStep] = useState<FormStep>(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [title, setTitle] = useState(editingMemory?.title ?? "");
  const [description, setDescription] = useState(editingMemory?.description ?? "");
  const [songTitle, setSongTitle] = useState(editingMemory?.songTitle ?? "");
  const [artist, setArtist] = useState(editingMemory?.artist ?? "");
  const [memoryYear, setMemoryYear] = useState(
    editingMemory?.memoryYear ?? yearFromDate(editingMemory?.date ?? new Date().toISOString())
  );
  const [memorySeason, setMemorySeason] = useState(
    editingMemory?.memorySeason ?? seasonFromDate(editingMemory?.date ?? new Date().toISOString())
  );
  const [locationName, setLocationName] = useState(editingMemory?.locationName ?? "");
  const [locationLat, setLocationLat] = useState<number | null>(editingMemory?.locationLat ?? null);
  const [locationLng, setLocationLng] = useState<number | null>(editingMemory?.locationLng ?? null);
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(editingMemory?.locationPlaceId ?? null);
  const [selectedMoods, setSelectedMoods] = useState<string[]>(
    editingMemory?.mood ? editingMemory.mood.split(",").map(s => s.trim()).filter(Boolean) : []
  );
  const [people, setPeople] = useState<string[]>(editingMemory?.people ?? []);
  const [personInput, setPersonInput] = useState("");
  const [customMoodInput, setCustomMoodInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(editingMemory?.tags ?? []);
  const [customTagInput, setCustomTagInput] = useState("");
  const [isPublic, setIsPublic] = useState(editingMemory?.isPublic ?? true);
  const [imagePreview, setImagePreview] = useState<string | null>(editingMemory?.imageUrl ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const restoredDraftRef = useRef(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const dragRef = useRef<PanelDragState | null>(null);

  const draftStorageKey = useMemo(() => {
    if (!user?.id) return null;
    return `${CREATE_DRAFT_STORAGE_KEY}:${user.id}`;
  }, [user?.id]);

  // AI Fill returns plain mood names, so this maps them back to the app's emoji labels when possible.
  const normalizeMood = (mood: string) => {
    const cleanMood = mood.trim().toLowerCase();
    const match = MOODS.find((m) => cleanMood === m.label.toLowerCase() || cleanMood.includes(m.label.toLowerCase()));
    return match ? `${match.emoji} ${match.label}` : mood.trim();
  };

  // Only trusted fields from the edge function are copied into state, with small limits for list fields.
  const applyDraft = (draft: DraftMemory) => {
    if (typeof draft.title === "string") setTitle(draft.title.slice(0, 80));
    if (typeof draft.description === "string") setDescription(draft.description);
    if (typeof draft.songTitle === "string") setSongTitle(draft.songTitle);
    if (typeof draft.artist === "string") setArtist(draft.artist);
    if (typeof draft.memoryYear === "number") setMemoryYear(draft.memoryYear);
    if (typeof draft.memorySeason === "string" && (MEMORY_SEASONS as readonly string[]).includes(draft.memorySeason)) setMemorySeason(draft.memorySeason);
    if (typeof draft.locationName === "string") {
      setLocationName(draft.locationName.slice(0, 120));
      setLocationLat(null);
      setLocationLng(null);
      setLocationPlaceId(null);
    }
    if (typeof draft.date === "string" && draft.date && typeof draft.memoryYear !== "number") {
      setMemoryYear(yearFromDate(draft.date));
      setMemorySeason(seasonFromDate(draft.date));
    }
    if (Array.isArray(draft.people)) setPeople(draft.people.filter((p: unknown) => typeof p === "string" && p.trim()).slice(0, 8));
    if (Array.isArray(draft.tags)) setSelectedTags(draft.tags.filter((t: unknown) => typeof t === "string" && t.trim()).slice(0, 8));
    if (Array.isArray(draft.moods)) {
      const moods = draft.moods
        .filter((m: unknown) => typeof m === "string" && m.trim())
        .map(normalizeMood)
        .slice(0, 4);
      if (moods.length > 0) setSelectedMoods(Array.from(new Set(moods)));
    }
  };

  // Sends rough notes to the Supabase edge function, then moves the user into the editable manual form.
  const draftMemory = async () => {
    const notes = aiPrompt.trim();
    if (!notes) {
      toast.error("Add a few notes first");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      toast.error("Sign in again before using AI Fill");
      return;
    }

    setDrafting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/draft-memory`, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `AI draft failed (${response.status})`);
      }
      if (!data?.draft) throw new Error("AI did not return a draft");

      applyDraft(data.draft);
      setStage("form");
      setFormStep(0);
      toast.success("Draft added. You can edit anything before saving.");
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to draft memory";
      toast.error(message);
    } finally {
      setDrafting(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formatError = imageFileError(file);
    if (formatError) { toast.error(formatError); e.target.value = ""; return; }

    if (isDngFile(file)) {
      const toastId = toast.loading(`Converting “${file.name}”…`);
      try {
        const converted = await convertDngToJpeg(file);
        setImageFile(converted);
        setImagePreview(URL.createObjectURL(converted));
      } catch {
        toast.error(`Couldn't convert “${file.name}”. Try exporting it as JPEG.`);
      } finally {
        toast.dismiss(toastId);
        e.target.value = "";
      }
      return;
    }

    if (!(await canDecodeImage(file))) { toast.error(`“${file.name}” could not be read. Try exporting it as JPEG.`); e.target.value = ""; return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Cover generation happens server-side so the OpenAI key never has to be exposed to the browser.
  const generateCover = async () => {
    if (!title) {
      toast.error("Add a title first so AI knows what to create");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      toast.error("Sign in again before generating a cover");
      return;
    }
    setGenerating(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cover`, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          mood: selectedMoods.join(", "),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Cover generation failed (${response.status})`);
      }
      if (data?.imageUrl) {
        setImagePreview(data.imageUrl);
        setImageFile(null);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.error("No image was returned");
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to generate cover image";
      toast.error(message);
    }
    setGenerating(false);
  };

  const uploadImage = async (): Promise<string | null> => {
    // Uploaded photos are compressed first to keep storage usage and page load time reasonable.
    if (!imageFile || !user) return imagePreview; // Keep existing URL if editing
    setUploading(true);
    try {
      const compressed = await compressImage(imageFile);
      const fileName = `${user.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("memory-images")
        .upload(fileName, compressed, { contentType: "image/jpeg" });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from("memory-images")
        .getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload image");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const addPerson = () => {
    const name = personInput.trim();
    if (name && !people.includes(name)) {
      setPeople([...people, name]);
    }
    setPersonInput("");
  };

  const removePerson = (name: string) => {
    setPeople(people.filter((p) => p !== name));
  };

  const toggleMood = (moodLabel: string) => {
    setSelectedMoods((prev) => {
      if (prev.includes(moodLabel)) return prev.filter((m) => m !== moodLabel);
      // If nothing selected yet, single-select (replace)
      if (prev.length === 0) return [moodLabel];
      // After first pick, allow multi-select (add)
      return [...prev, moodLabel];
    });
  };

  const addCustomMood = () => {
    const mood = customMoodInput.trim();
    if (mood && !selectedMoods.includes(mood)) {
      setSelectedMoods((prev) => prev.length === 0 ? [mood] : [...prev, mood]);
    }
    setCustomMoodInput("");
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const tag = customTagInput.trim();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags((prev) => [...prev, tag]);
    }
    setCustomTagInput("");
  };

  const updateLocation = (name: string, location?: LocationResult | null) => {
    // The visible location name can exist by itself, but map filtering needs coordinates/place id.
    setLocationName(name);

    if (location === null) {
      setLocationLat(null);
      setLocationLng(null);
      setLocationPlaceId(null);
      return;
    }

    if (location) {
      setLocationLat(location.lat);
      setLocationLng(location.lng);
      setLocationPlaceId(location.placeId);
    }
  };

  const startManualEntry = () => {
    setStage("form");
    setFormStep(0);
  };

  const hasDraftableContent = useMemo(() => (
    aiPrompt.trim().length > 0 ||
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    songTitle.trim().length > 0 ||
    artist.trim().length > 0 ||
    locationName.trim().length > 0 ||
    selectedMoods.length > 0 ||
    people.length > 0 ||
    selectedTags.length > 0 ||
    !isPublic ||
    Boolean(imagePreview)
  ), [
    aiPrompt,
    title,
    description,
    songTitle,
    artist,
    locationName,
    selectedMoods,
    people,
    selectedTags,
    isPublic,
    imagePreview,
  ]);

  const clearLocalDraft = () => {
    if (!draftStorageKey || typeof window === "undefined") return;
    window.localStorage.removeItem(draftStorageKey);
  };

  useEffect(() => {
    if (isEditing || !draftStorageKey || restoredDraftRef.current || typeof window === "undefined") return;

    restoredDraftRef.current = true;
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Partial<LocalDraft>;
      if (draft.stage === "ai" || draft.stage === "form") setStage(draft.stage);
      if (draft.formStep === 0 || draft.formStep === 1 || draft.formStep === 2) setFormStep(draft.formStep);
      if (typeof draft.aiPrompt === "string") setAiPrompt(draft.aiPrompt);
      if (typeof draft.title === "string") setTitle(draft.title.slice(0, 80));
      if (typeof draft.description === "string") setDescription(draft.description);
      if (typeof draft.songTitle === "string") setSongTitle(draft.songTitle);
      if (typeof draft.artist === "string") setArtist(draft.artist);
      if (typeof draft.memoryYear === "number") setMemoryYear(draft.memoryYear);
      if (typeof draft.memorySeason === "string" && (MEMORY_SEASONS as readonly string[]).includes(draft.memorySeason)) {
        setMemorySeason(draft.memorySeason);
      }
      if (typeof draft.locationName === "string") setLocationName(draft.locationName.slice(0, 120));
      if (typeof draft.locationLat === "number" || draft.locationLat === null) setLocationLat(draft.locationLat ?? null);
      if (typeof draft.locationLng === "number" || draft.locationLng === null) setLocationLng(draft.locationLng ?? null);
      if (typeof draft.locationPlaceId === "string" || draft.locationPlaceId === null) setLocationPlaceId(draft.locationPlaceId ?? null);
      if (Array.isArray(draft.selectedMoods)) {
        setSelectedMoods(draft.selectedMoods.filter((mood): mood is string => typeof mood === "string").slice(0, 8));
      }
      if (Array.isArray(draft.people)) {
        setPeople(draft.people.filter((person): person is string => typeof person === "string").slice(0, 8));
      }
      if (Array.isArray(draft.selectedTags)) {
        setSelectedTags(draft.selectedTags.filter((tag): tag is string => typeof tag === "string").slice(0, 8));
      }
      if (typeof draft.isPublic === "boolean") setIsPublic(draft.isPublic);
      if (typeof draft.imagePreview === "string" || draft.imagePreview === null) setImagePreview(draft.imagePreview ?? null);

      toast.success("Restored your draft");
    } catch (error) {
      console.error(error);
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, isEditing]);

  useEffect(() => {
    if (isEditing || !draftStorageKey || typeof window === "undefined") return;

    if (!hasDraftableContent) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    const draft: LocalDraft = {
      savedAt: new Date().toISOString(),
      stage,
      formStep,
      aiPrompt,
      title,
      description,
      songTitle,
      artist,
      memoryYear,
      memorySeason,
      locationName,
      locationLat,
      locationLng,
      locationPlaceId,
      selectedMoods,
      people,
      selectedTags,
      isPublic,
      imagePreview: imagePreview?.startsWith("blob:") ? null : imagePreview,
    };

    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  }, [
    draftStorageKey,
    isEditing,
    hasDraftableContent,
    stage,
    formStep,
    aiPrompt,
    title,
    description,
    songTitle,
    artist,
    memoryYear,
    memorySeason,
    locationName,
    locationLat,
    locationLng,
    locationPlaceId,
    selectedMoods,
    people,
    selectedTags,
    isPublic,
    imagePreview,
  ]);

  useEffect(() => {
    if (isEditing || typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDraftableContent) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDraftableContent, isEditing]);

  const goToPreviousStep = () => {
    setFormStep((current) => (current === 0 ? 0 : ((current - 1) as FormStep)));
  };

  const goBackFromForm = () => {
    if (formStep === 0) {
      setStage("ai");
      return;
    }

    goToPreviousStep();
  };

  const goToNextStep = () => {
    setFormStep((current) => (current === 2 ? 2 : ((current + 1) as FormStep)));
  };

  const saveMemory = async () => {
    // Multi-step creation only saves from the last step; edit mode can save from the full form immediately.
    if (stage !== "form") return;
    if (!editingMemory && formStep !== FORM_STEPS.length - 1) {
      return;
    }
    if (!title || !songTitle || !artist || selectedMoods.length === 0) return;
    const imageUrl = await uploadImage();
    const saved = await onAdd({
      title,
      description,
      songTitle,
      artist,
      date: dateFromYearSeason(memoryYear, memorySeason),
      memoryYear,
      memorySeason,
      locationName: locationName.trim() || null,
      locationLat: locationName.trim() ? locationLat : null,
      locationLng: locationName.trim() ? locationLng : null,
      locationPlaceId: locationName.trim() ? locationPlaceId : null,
      mood: selectedMoods.join(", "),
      people,
      isPublic,
      imageUrl,
      tags: selectedTags,
    });
    if (saved) {
      clearLocalDraft();
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const resetPanelDrag = () => {
    if (formRef.current) {
      formRef.current.style.transform = "";
      formRef.current.style.transition = "";
    }
    dragRef.current = null;
  };

  const getCloseOffset = (clientX: number, clientY: number) => {
    if (!dragRef.current) return 0;
    return editingMemory
      ? Math.max(0, dragRef.current.startX - clientX)
      : Math.max(0, clientY - dragRef.current.startY);
  };

  const setPanelTransform = (offset: number) => {
    if (!formRef.current) return;
    formRef.current.style.transition = "none";
    formRef.current.style.transform = editingMemory ? `translateX(-${offset}px)` : `translateY(${offset}px)`;
  };

  const handlePanelPointerDown = (event: React.PointerEvent<HTMLFormElement>) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof HTMLElement) || !event.target.closest("[data-drag-close-handle]")) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanelPointerMove = (event: React.PointerEvent<HTMLFormElement>) => {
    if (!dragRef.current) return;

    const closeOffset = getCloseOffset(event.clientX, event.clientY);
    const crossOffset = editingMemory
      ? Math.abs(event.clientY - dragRef.current.startY)
      : Math.abs(event.clientX - dragRef.current.startX);

    if (closeOffset > 12 && closeOffset > crossOffset) {
      event.preventDefault();
      setPanelTransform(closeOffset);
    }
  };

  const handlePanelPointerUp = (event: React.PointerEvent<HTMLFormElement>) => {
    if (!dragRef.current) return;

    const closeOffset = getCloseOffset(event.clientX, event.clientY);
    const threshold = Math.min(160, editingMemory
      ? (formRef.current?.offsetWidth ?? 320) * 0.33
      : (formRef.current?.offsetHeight ?? 320) * 0.22);

    event.currentTarget.releasePointerCapture(dragRef.current.pointerId);
    resetPanelDrag();

    if (closeOffset > threshold) {
      onClose();
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-black/80 backdrop-blur-sm",
        editingMemory ? "items-stretch justify-start p-0" : "items-end justify-center p-0 sm:px-4 sm:pt-4"
      )}
      onClick={onClose}
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onPointerDown={handlePanelPointerDown}
        onPointerMove={handlePanelPointerMove}
        onPointerUp={handlePanelPointerUp}
        onPointerCancel={resetPanelDrag}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLElement && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "overflow-y-auto bg-background p-6 shadow-xl animate-in duration-500",
          editingMemory
            ? "h-full max-h-full w-[90vw] max-w-lg rounded-r-2xl slide-in-from-left"
            : "h-[92dvh] w-full rounded-t-2xl slide-in-from-bottom sm:h-auto sm:max-h-[90vh] sm:max-w-lg"
        )}
      >
        <div data-drag-close-handle className="relative mb-6 flex cursor-grab touch-none items-center justify-between active:cursor-grabbing">
          {!editingMemory && (
            <span className="absolute left-1/2 top-[-14px] h-1.5 w-12 -translate-x-1/2 rounded-full bg-muted-foreground/30" />
          )}
          <h2 className="font-display text-xl font-semibold">
            {editingMemory ? "Edit Memory" : stage === "ai" ? "Start a Memory" : "New Music Memory"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-foreground/70 bg-white text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X size={20} />
          </button>
        </div>

        {stage === "ai" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Step 1 of {FLOW_STEPS.length}</span>
                <span>{FLOW_STEPS[0]}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {FLOW_STEPS.map((step, index) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-colors ${
                      index === 0 ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles size={16} className="text-primary" />
                AI Fill
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Add a few notes and AI Fill will draft the form for you.
              </p>
            </div>

            <div>
              <FieldLabel
                label="Notes"
                help="Jot down anything you remember. Fragments are fine."
              >
                Notes
              </FieldLabel>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={"e.g. last summer\nroad trip to Tofino with Maya\nDreams by Fleetwood Mac\npeaceful and nostalgic"}
                rows={9}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            <button
              type="button"
              onClick={draftMemory}
              disabled={!aiPrompt.trim() || drafting}
              className="w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {drafting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {drafting ? "Drafting…" : "AI Fill the Form"}
            </button>

            <button
              type="button"
              onClick={startManualEntry}
              className="w-full rounded-lg border border-border bg-card py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Skip and Enter Manually
            </button>
          </div>
        ) : (
        <div className="space-y-4">
          {!editingMemory && (
            <button
              type="button"
              onClick={() => {
                setStage("ai");
                setFormStep(0);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Sparkles size={14} />
              Back to AI Fill
            </button>
          )}
          {!editingMemory && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Step {formStep + 2} of {FLOW_STEPS.length}
              </span>
              <span>{FORM_STEPS[formStep]}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {FLOW_STEPS.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => {
                    if (index === 0) {
                      setStage("ai");
                      setFormStep(0);
                      return;
                    }
                    setFormStep((index - 1) as FormStep);
                  }}
                  className={`h-1.5 rounded-full transition-colors ${
                    index <= formStep + 1 ? "bg-primary" : "bg-muted"
                  }`}
                  aria-label={`Go to ${step}`}
                />
              ))}
            </div>
          </div>
          )}

          {(editingMemory || formStep === 0) && (
            <>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <FieldLabel
                label="Title"
                help="A short name for this memory."
                className="mb-0"
              >
                Title
              </FieldLabel>
              <span className={`text-xs font-normal ${title.length > 70 ? "text-destructive" : "text-muted-foreground"}`}>{80 - title.length}</span>
            </div>
            <input
              value={title}
              onChange={(e) => { if (e.target.value.length <= 80) setTitle(e.target.value); }}
              placeholder="e.g. Dancing in the rain after finals"
              className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
              maxLength={80}
            />
          </div>

          <div>
            <FieldLabel
              label="Story"
              help="What happened, and what do you want to remember about it?"
            >
              Story
            </FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe how it felt..."
              rows={3}
              className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Image upload / generate */}
          <div>
            <FieldLabel
              label="Cover image"
              help="Upload an existing image from your device, or generate one from the memory."
            >
              <span className="flex items-center gap-1.5"><ImagePlus size={14} className="text-primary" /> Cover image</span>
            </FieldLabel>
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Preview" className="h-32 w-full rounded-lg object-cover border border-border" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-foreground/60 text-background flex items-center justify-center hover:bg-foreground/80 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : generating ? (
              <div className="h-32 w-full rounded-lg border-2 border-dashed border-primary/30 bg-card flex flex-col items-center justify-center gap-2">
                <Loader2 size={20} className="text-primary animate-spin" />
                <span className="text-xs text-muted-foreground">Generating cover…</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 h-20 rounded-lg border-2 border-dashed border-border bg-card flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                >
                  <Upload size={18} />
                  <span className="text-[10px] mt-1">Upload image</span>
                </button>
                <button
                  type="button"
                  onClick={generateCover}
                  className="flex-1 h-20 rounded-lg border-2 border-dashed border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                >
                  <Sparkles size={18} />
                  <span className="text-[10px] mt-1">AI Generate</span>
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_IMAGE_ACCEPT}
              onChange={(event) => void handleImageSelect(event)}
              className="hidden"
            />
          </div>
            </>
          )}

          {(editingMemory || formStep === 1) && (
            <>
          <div className="gradient-warm rounded-lg p-4 space-y-3">
            <FieldLabel
              label="Song"
              help="The song and artist connected to this memory."
            >
              <span className="flex items-center gap-2"><Music size={16} className="text-primary" /> Song</span>
            </FieldLabel>
            <SongSearch
              songTitle={songTitle}
              artist={artist}
              onSongTitleChange={setSongTitle}
              onArtistChange={setArtist}
              onSelect={(s, a) => { setSongTitle(s); setArtist(a); }}
            />
          </div>

          <div>
            <FieldLabel
              label="Date"
              help="Use the season and year if you do not remember the exact date."
            >
              Date
            </FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={memorySeason}
                onChange={(e) => setMemorySeason(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {MEMORY_SEASONS.map((season) => (
                  <option key={season} value={season}>{season}</option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                min={1900}
                max={new Date().getFullYear() + 1}
                value={memoryYear}
                onChange={(e) => setMemoryYear(Number(e.target.value) || new Date().getFullYear())}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
            </>
          )}

          {(editingMemory || formStep === 2) && (
            <>
          <div>
            <FieldLabel
              label="Place"
              help="Add a location if this memory belongs on the map."
            >
              <span className="flex items-center gap-1.5"><MapPin size={14} className="text-primary" /> Place</span>
            </FieldLabel>
            <LocationSearch value={locationName} onChange={updateLocation} maxLength={120} menuPlacement="top" />
          </div>

          <div>
            <FieldLabel
              label="People"
              help="Add anyone who was part of the memory."
            >
              <span className="flex items-center gap-1.5"><Users size={14} className="text-primary" /> People</span>
            </FieldLabel>
            <div className="flex gap-2 mb-2">
              <input
                value={personInput}
                onChange={(e) => setPersonInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }}
                placeholder="Name"
                className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={addPerson}
                className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            {people.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-foreground border border-primary/20">
                    {p}
                    <button type="button" onClick={() => removePerson(p)} className="hover:text-destructive"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <FieldLabel
              label="Mood"
              help="Pick the main feeling, then add more if needed."
            >
              Mood
            </FieldLabel>
            <p className="text-xs text-muted-foreground mb-2">
              {selectedMoods.length === 0 ? "Pick one to start" : "Add more if needed"}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MOODS.map((m) => {
                const label = `${m.emoji} ${m.label}`;
                const active = selectedMoods.includes(label);
                return (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => toggleMood(label)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {m.emoji} {m.label}
                  </button>
                );
              })}
              {selectedMoods
                .filter((sm) => !MOODS.some((m) => `${m.emoji} ${m.label}` === sm))
                .map((custom) => (
                  <button
                    key={custom}
                    type="button"
                    onClick={() => toggleMood(custom)}
                    className="px-3 py-1.5 rounded-full text-sm border transition-all border-primary bg-primary text-primary-foreground shadow-sm"
                  >
                    {custom}
                    <X size={12} className="inline ml-1 -mr-0.5" />
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                value={customMoodInput}
                onChange={(e) => setCustomMoodInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMood(); } }}
                placeholder="Custom mood"
                className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={addCustomMood}
                disabled={!customMoodInput.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Memory Type Tags */}
          <div>
            <FieldLabel
              label="Type"
              help="Tag the kind of memory so it is easier to filter later."
            >
              Type
            </FieldLabel>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MEMORY_TYPES.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
              {selectedTags
                .filter((t) => !(MEMORY_TYPES as readonly string[]).includes(t))
                .map((custom) => (
                  <button
                    key={custom}
                    type="button"
                    onClick={() => toggleTag(custom)}
                    className="px-3 py-1.5 rounded-full text-sm border transition-all border-primary bg-primary text-primary-foreground shadow-sm"
                  >
                    {custom}
                    <X size={12} className="inline ml-1 -mr-0.5" />
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
                placeholder="Custom type"
                className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={addCustomTag}
                disabled={!customTagInput.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div>
            <FieldLabel
              label="Visibility"
              help="Choose whether this memory stays private or can appear in Discover."
            >
              Visibility
            </FieldLabel>
            <div className="inline-flex rounded-full border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  !isPublic
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Lock size={14} />
                Private
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isPublic
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Globe size={14} />
                Public
              </button>
            </div>
          </div>
            </>
          )}
        </div>
        )}

        {stage === "form" && (
          <div className="mt-6 flex gap-2">
            {!editingMemory && (
              <button
                type="button"
                onClick={goBackFromForm}
                className="flex-1 rounded-lg border border-border bg-card py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Back
              </button>
            )}
            {!editingMemory && formStep < FORM_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goToNextStep}
                className="flex-1 rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={saveMemory}
                disabled={!title || !songTitle || !artist || selectedMoods.length === 0 || uploading}
                className="flex-1 rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading && <Loader2 size={16} className="animate-spin" />}
                {uploading ? "Uploading…" : editingMemory ? "Update Memory" : "Save Memory"}
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
};

export default AddMemoryForm;
