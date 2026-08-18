import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAudioSettings } from "@/contexts/AudioSettingsContext";

interface MiniPlayerProps {
  songTitle: string;
  artist: string;
  autoPlay?: boolean;
  variant?: "default" | "overlay" | "compact" | "map";
}

interface DeezerTrack {
  preview: string;
  title: string;
  artist: string;
  album: string;
  albumCover: string;
  duration: number;
}

const MiniPlayer = ({ songTitle, artist, autoPlay = false, variant = "default" }: MiniPlayerProps) => {
  const isOverlay = variant === "overlay";
  const isCompact = variant === "compact";
  const isMap = variant === "map";
  const playerId = useId();
  const [track, setTrack] = useState<DeezerTrack | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const { siteMuted, siteVolume } = useAudioSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const autoStartedRef = useRef(false);
  const userPausedAutoRef = useRef(false);

  const searchTrack = useCallback(async () => {
    if (searched) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke("deezer-search", {
        body: { query: `${songTitle} ${artist}` },
      });
      if (!error && data?.track) {
        setTrack(data.track);
      }
    } catch (e) {
      console.error("Deezer search failed:", e);
    }
    setLoading(false);
  }, [songTitle, artist, searched]);

  // Lazy-load: search on mount
  useEffect(() => {
    searchTrack();
  }, [searchTrack]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    autoStartedRef.current = false;
    setPlaying(false);
    setProgress(0);
  }, []);

  const pausePlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    autoStartedRef.current = false;
    if (autoPlay) userPausedAutoRef.current = true;
    setPlaying(false);
  }, [autoPlay]);

  const startPlayback = useCallback((startedByAutoPlay = false) => {
    if (!audioRef.current || !track) return;
    autoStartedRef.current = startedByAutoPlay;
    window.dispatchEvent(new CustomEvent("recallfm:preview-play", { detail: { playerId } }));
    audioRef.current.play().then(() => setPlaying(true)).catch(() => {
      if (startedByAutoPlay) autoStartedRef.current = false;
    });
  }, [playerId, track]);

  // Auto-play when active, stop when not
  useEffect(() => {
    if (autoPlay && track && audioRef.current && !playing && !userPausedAutoRef.current) {
      startPlayback(true);
    }
    if (!autoPlay) {
      userPausedAutoRef.current = false;
    }
    if (!autoPlay && autoStartedRef.current && audioRef.current && playing) {
      stopPlayback();
    }
  }, [autoPlay, track, playing, startPlayback, stopPlayback]);

  useEffect(() => {
    userPausedAutoRef.current = false;
  }, [track?.preview]);

  useEffect(() => {
    const handlePreviewPlay = (event: Event) => {
      const otherPlayerId = (event as CustomEvent<{ playerId: string }>).detail?.playerId;
      if (otherPlayerId && otherPlayerId !== playerId) stopPlayback();
    };

    window.addEventListener("recallfm:preview-play", handlePreviewPlay);
    return () => window.removeEventListener("recallfm:preview-play", handlePreviewPlay);
  }, [playerId, stopPlayback]);

  useEffect(() => {
    window.addEventListener("recallfm:preview-pause-all", pausePlayback);
    return () => window.removeEventListener("recallfm:preview-pause-all", pausePlayback);
  }, [pausePlayback]);

  const togglePlay = () => {
    if (!audioRef.current || !track) return;
    if (playing) {
      audioRef.current.pause();
      autoStartedRef.current = false;
      if (autoPlay) userPausedAutoRef.current = true;
      setPlaying(false);
    } else {
      userPausedAutoRef.current = false;
      startPlayback();
    }
  };

  const handleTogglePlay = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    togglePlay();
  };

  const handleToggleMuted = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setMuted((current) => !current);
  };

  const updateProgress = useCallback(() => {
    if (audioRef.current) {
      const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(isNaN(pct) ? 0 : pct);
    }
    animRef.current = requestAnimationFrame(updateProgress);
  }, []);

  useEffect(() => {
    if (playing) {
      animRef.current = requestAnimationFrame(updateProgress);
    } else {
      cancelAnimationFrame(animRef.current);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, updateProgress]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = siteVolume;
    }
  }, [siteVolume, track?.preview]);

  const handleEnded = () => {
    autoStartedRef.current = false;
    if (autoPlay) userPausedAutoRef.current = true;
    setPlaying(false);
    setProgress(0);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * audioRef.current.duration;
    setProgress(pct * 100);
  };

  if (loading) {
    if (isMap) {
      return (
        <div className="track-row map-track-loading" aria-live="polite">
          <div className="track-art track-art-placeholder"><Loader2 className="animate-spin" /></div>
          <div className="track-copy"><strong>{songTitle}</strong><span>Finding preview…</span></div>
          <button type="button" disabled aria-label="Finding preview"><Loader2 className="animate-spin" /></button>
        </div>
      );
    }
    if (isCompact) {
      return (
        <button
          type="button"
          disabled
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground opacity-70 ring-1 ring-border"
          aria-label="Finding preview"
        >
          <Loader2 size={14} className="animate-spin" />
        </button>
      );
    }

    return (
      <div className={cn("flex items-center gap-2 rounded-md px-3 py-2", isOverlay ? "bg-black/50 backdrop-blur-sm" : "bg-muted")}>
        <Loader2 size={14} className={cn("animate-spin", isOverlay ? "text-white" : "text-primary")} />
        <span className={cn("text-xs", isOverlay ? "text-white/70" : "text-muted-foreground")}>Finding preview…</span>
      </div>
    );
  }

  if (!track) {
    if (isMap) {
      return (
        <div className="track-row map-track-unavailable">
          <div className="track-art track-art-placeholder"><Music2 /></div>
          <div className="track-copy"><strong>{songTitle}</strong><span>{artist} · Preview unavailable</span></div>
          <button type="button" disabled aria-label="No preview available"><Play /></button>
        </div>
      );
    }
    if (isCompact) {
      return (
        <button
          type="button"
          disabled
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground opacity-60 ring-1 ring-border"
          aria-label="No preview available"
        >
          <Play size={14} className="ml-0.5" />
        </button>
      );
    }

    return (
      <div className={cn("flex items-center gap-2 rounded-md px-3 py-2", isOverlay ? "bg-black/50 backdrop-blur-sm" : "bg-muted")}>
        <span className={cn("text-xs", isOverlay ? "text-white/70" : "text-muted-foreground")}>No preview available</span>
      </div>
    );
  }

  if (isCompact) {
    return (
      <>
        <button
          type="button"
          onClick={handleTogglePlay}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20 transition-all hover:scale-110 hover:bg-primary/90 hover:shadow-md hover:ring-primary/45 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={playing ? "Pause preview" : "Play preview"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
        <audio
          ref={audioRef}
          src={track.preview}
          muted={siteMuted || muted || siteVolume === 0}
          onEnded={handleEnded}
          preload="none"
        />
      </>
    );
  }

  if (isMap) {
    return (
      <div className="track-row">
        {track.albumCover ? (
          <img className="track-art" src={track.albumCover} alt={`${track.album} album cover`} />
        ) : (
          <div className="track-art track-art-placeholder" aria-label="Album artwork unavailable"><Music2 /></div>
        )}
        <div className="track-copy"><strong>{track.title || songTitle}</strong><span>{track.artist || artist}</span></div>
        <button type="button" onClick={handleTogglePlay} aria-label={playing ? "Pause preview" : "Play preview"}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</button>
        <audio ref={audioRef} src={track.preview} muted={siteMuted || muted || siteVolume === 0} onEnded={handleEnded} preload="none" />
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg overflow-hidden", isOverlay ? "bg-black/50 backdrop-blur-sm border-0" : "border border-border bg-muted/50")}>
      <div className="flex items-center gap-3 p-3">
        {track.albumCover && (
          <img
            src={track.albumCover}
            alt={track.album}
            className="h-10 w-10 rounded-md object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium truncate", isOverlay ? "text-white" : "text-foreground")}>{track.title}</p>
          <p className={cn("text-xs truncate", isOverlay ? "text-white/70" : "text-muted-foreground")}>{track.artist}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleMuted}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2",
              isOverlay
                ? "text-white/70 hover:bg-white/15 hover:text-white focus-visible:ring-white/70"
                : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm focus-visible:ring-ring"
            )}
            aria-label={siteMuted || siteVolume === 0 ? "Site audio is muted" : muted ? "Unmute" : "Mute"}
          >
            {siteMuted || muted || siteVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button
            type="button"
            onClick={handleTogglePlay}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition-all hover:scale-110 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2",
              isOverlay
                ? "bg-white text-black ring-1 ring-white/40 hover:bg-white/90 hover:ring-white/70 focus-visible:ring-white/70"
                : "bg-primary text-primary-foreground ring-1 ring-primary/20 hover:bg-primary/90 hover:ring-primary/45 focus-visible:ring-ring"
            )}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div
        className={cn("h-1 cursor-pointer", isOverlay ? "bg-white/20" : "bg-muted")}
        onClick={handleProgressClick}
      >
        <div
          className={cn("h-full transition-[width] duration-100", isOverlay ? "bg-white" : "bg-primary")}
          style={{ width: `${progress}%` }}
        />
      </div>
      <audio
        ref={audioRef}
        src={track.preview}
        muted={siteMuted || muted || siteVolume === 0}
        onEnded={handleEnded}
        preload="none"
      />
    </div>
  );
};

export default MiniPlayer;
