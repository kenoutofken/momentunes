import { createContext, useContext, useEffect, useMemo, useState } from "react";

type AudioSettingsContextValue = {
  siteMuted: boolean;
  siteVolume: number;
  toggleSiteMuted: () => void;
  setSiteMuted: (muted: boolean) => void;
  setSiteVolume: (volume: number) => void;
};

const AudioSettingsContext = createContext<AudioSettingsContextValue | undefined>(undefined);
const MUTED_STORAGE_KEY = "recallfm:site-muted";
// Use a new Momentunes key so the zero-volume value written by the former
// missing-preference bug is not treated as an intentional user setting.
const VOLUME_STORAGE_KEY = "momentunes:site-volume";
const DEFAULT_VOLUME = 0.75;

// Volume is stored as a 0-1 number because that matches HTMLAudioElement.volume.
const clampVolume = (volume: number) => Math.min(Math.max(volume, 0), 1);

export const AudioSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [siteMuted, setSiteMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === "true";
  });
  const [siteVolume, setSiteVolumeState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_VOLUME;
    const storedVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (storedVolume === null) return DEFAULT_VOLUME;
    const savedVolume = Number(storedVolume);
    return Number.isFinite(savedVolume) ? clampVolume(savedVolume) : DEFAULT_VOLUME;
  });

  useEffect(() => {
    // Audio preferences persist locally so the app remembers them between visits.
    window.localStorage.setItem(MUTED_STORAGE_KEY, String(siteMuted));
  }, [siteMuted]);

  useEffect(() => {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(siteVolume));
  }, [siteVolume]);

  const value = useMemo(
    // Memoizing keeps audio controls from re-rendering unless a setting actually changes.
    () => ({
      siteMuted,
      siteVolume,
      setSiteMuted,
      setSiteVolume: (volume: number) => setSiteVolumeState(clampVolume(volume)),
      toggleSiteMuted: () => setSiteMuted((current) => !current),
    }),
    [siteMuted, siteVolume],
  );

  return (
    <AudioSettingsContext.Provider value={value}>
      {children}
    </AudioSettingsContext.Provider>
  );
};

export const useAudioSettings = () => {
  const context = useContext(AudioSettingsContext);
  if (!context) {
    throw new Error("useAudioSettings must be used within AudioSettingsProvider");
  }
  return context;
};
