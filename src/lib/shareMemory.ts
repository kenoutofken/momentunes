import { toast } from "sonner";
import type { Memory } from "@/types/memory";

export async function shareMemory(memory: Pick<Memory, "id" | "title" | "songTitle" | "artist">) {
  const url = `${window.location.origin}/journal/memories/${memory.id}`;
  try {
    if (navigator.share) await navigator.share({ title: memory.title, text: `${memory.title} — ${memory.songTitle} by ${memory.artist}`, url });
    else { await navigator.clipboard.writeText(url); toast.success("Memory link copied"); }
  } catch (error) { if ((error as Error).name !== "AbortError") toast.error("Could not share memory"); }
}
