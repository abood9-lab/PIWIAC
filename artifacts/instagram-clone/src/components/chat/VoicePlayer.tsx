import { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
  isMe: boolean;
}

// Deterministic fake waveform from URL hash
function getWaveBars(url: string, count = 32): number[] {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  return Array.from({ length: count }, (_, i) => {
    const v = Math.abs(Math.sin(hash + i * 1.3) * 60 + Math.sin(i * 0.7 + hash * 0.01) * 30);
    return Math.max(15, Math.min(95, v));
  });
}

export function VoicePlayer({ url, isMe }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bars = getWaveBars(url);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(isFinite(audio.duration) ? audio.duration : 0);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play().then(() => setIsPlaying(true)).catch(() => {}); }
  };

  const handleBarClick = (i: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = (i / bars.length) * duration;
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || s <= 0) return "0:00";
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={cn(
      "flex items-center gap-2.5 px-3 py-2.5 rounded-2xl select-none",
      isMe ? "bg-primary" : "bg-secondary",
      "min-w-[200px] max-w-[260px]"
    )}>
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90",
          isMe
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-foreground/10 hover:bg-foreground/20 text-foreground"
        )}
      >
        {isPlaying
          ? <Pause className="w-3.5 h-3.5" />
          : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      {/* Waveform bars */}
      <div className="flex items-center gap-[2px] flex-1 h-8 cursor-pointer">
        {bars.map((h, i) => {
          const isPast = i / bars.length <= progress;
          return (
            <div
              key={i}
              onClick={() => handleBarClick(i)}
              className={cn(
                "rounded-full transition-colors duration-75",
                "w-[3px]",
                isPast
                  ? isMe ? "bg-white" : "bg-primary"
                  : isMe ? "bg-white/35" : "bg-foreground/20"
              )}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>

      {/* Time */}
      <span className={cn(
        "text-[10px] font-medium shrink-0 tabular-nums",
        isMe ? "text-white/75" : "text-muted-foreground"
      )}>
        {fmt(isPlaying ? currentTime : duration)}
      </span>
    </div>
  );
}
