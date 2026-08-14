export interface Memory {
  id: string;
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
  imageUrls?: string[];
  imageFocusPoints?: Array<{ x: number; y: number }>;
  tags: string[];
  createdAt: string;
  userId?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export const MEMORY_TYPES = [
  "Family",
  "Friends",
  "Travel",
  "Holiday",
  "Adventure",
  "Relationship",
  "Solo",
  "Work",
] as const;

export const MEMORY_SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;

export const MOODS = [
  { emoji: "☀️", label: "Joyful" },
  { emoji: "🌧️", label: "Melancholy" },
  { emoji: "🌙", label: "Nostalgic" },
  { emoji: "🌸", label: "Peaceful" },
  { emoji: "🔥", label: "Energized" },
  { emoji: "🍂", label: "Bittersweet" },
] as const;
