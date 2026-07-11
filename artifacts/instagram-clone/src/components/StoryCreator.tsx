import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ImagePlus, Video, Loader2, CheckCircle, Sparkles, Type,
  Music, ChevronLeft, Pause, Play, Pencil, Eraser, Smile,
  AlignLeft, AlignCenter, AlignRight, Undo2, Trash2,
  MapPin, Hash, AtSign, HelpCircle, BarChart2, Clock,
  Sliders, Users, UserCheck, Check, Plus, Move,
} from "lucide-react";
import { useUploadStoryMedia, useCreateStory, useGenerateCaption } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TextLayer {
  id: string;
  text: string;
  x: number; // %
  y: number; // %
  color: string;
  fontSize: number;
  font: "bold" | "italic" | "classic" | "neon" | "typewriter";
  align: "left" | "center" | "right";
  bg: "none" | "solid" | "blur";
}

interface StickerLayer {
  id: string;
  type: "emoji" | "poll" | "question" | "quiz" | "countdown" | "location" | "hashtag" | "mention";
  x: number;
  y: number;
  emoji?: string;
  text?: string;
  pollQuestion?: string;
  pollA?: string;
  pollB?: string;
  quizOptions?: string[];
  quizAnswer?: number;
  countdownLabel?: string;
}

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  mode: "pen" | "marker" | "neon" | "eraser";
  opacity: number;
}

type ActiveTool = "none" | "draw" | "text" | "sticker" | "filter" | "audience";
type Step = "pick" | "edit" | "music" | "uploading" | "done";
type DrawMode = "pen" | "marker" | "neon" | "eraser";
type StickerMode = "emoji" | "poll" | "question" | "quiz" | "countdown" | "location" | "hashtag" | "mention";

// ─── Constants ───────────────────────────────────────────────────────────────

const DRAW_COLORS = ["#ffffff","#000000","#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#6366f1","#ec4899","#a855f7"];
const TEXT_COLORS = ["#ffffff","#000000","#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#6366f1","#ec4899","#a855f7","#fbbf24","#34d399","#f472b6","#818cf8"];

const BG_GRADIENTS = [
  "linear-gradient(135deg,#667eea,#764ba2)","linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)","linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)","linear-gradient(135deg,#a18cd1,#fbc2eb)",
  "linear-gradient(135deg,#ffecd2,#fcb69f)","linear-gradient(135deg,#2af598,#009efd)",
  "linear-gradient(135deg,#f7971e,#ffd200)","linear-gradient(135deg,#ff6a00,#ee0979)",
  "linear-gradient(135deg,#30cfd0,#330867)","#1a1a2e","#16213e","#0f3460",
];

const CSS_FILTERS = [
  { label: "Normal", style: "none" },{ label: "Clarendon", style: "contrast(1.2) saturate(1.35)" },
  { label: "Juno", style: "saturate(1.4) sepia(0.15) contrast(1.1)" },{ label: "Moon", style: "grayscale(1) contrast(1.1) brightness(1.1)" },
  { label: "Lark", style: "brightness(1.1) contrast(0.9) saturate(0.8)" },{ label: "Ludwig", style: "contrast(1.05) brightness(1.05) saturate(0.9)" },
  { label: "Reyes", style: "sepia(0.3) contrast(0.85) brightness(1.1) saturate(0.75)" },
  { label: "Perpetua", style: "contrast(1.1) saturate(1.1) brightness(1.02)" },{ label: "Slumber", style: "saturate(0.66) brightness(1.05) sepia(0.1)" },
];

const COMMON_EMOJIS = ["❤️","🔥","😂","🥰","😍","✨","💯","🎉","🙌","😎","👑","💪","🌟","🫶","💀","😭","🤣","👀","🎵","🌈","🦋","🍀","🎸","🏆","🚀","💎","🦄","🌸","🍕","🎮"];

const MUSIC_TRACKS = [
  { id:"chill",name:"Midnight Chill",artist:"Lo-Fi Studio",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",emoji:"🌙",from:"from-indigo-500",to:"to-purple-600" },
  { id:"summer",name:"Summer Vibes",artist:"Tropical Beats",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",emoji:"☀️",from:"from-amber-400",to:"to-orange-500" },
  { id:"epic",name:"Epic Journey",artist:"Cinematic Co.",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",emoji:"🎬",from:"from-red-500",to:"to-rose-700" },
  { id:"romantic",name:"Sweet Love",artist:"Romance Strings",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",emoji:"💕",from:"from-pink-400",to:"to-fuchsia-600" },
  { id:"dance",name:"Dance Floor",artist:"Club Remix",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",emoji:"🎉",from:"from-violet-500",to:"to-indigo-600" },
  { id:"lofi",name:"Study Session",artist:"Lo-Fi Beats",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",emoji:"📚",from:"from-teal-400",to:"to-emerald-600" },
  { id:"power",name:"Rise Up",artist:"Power Beats",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3",emoji:"🔥",from:"from-orange-400",to:"to-red-600" },
  { id:"acoustic",name:"Morning Light",artist:"Acoustic Studio",url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3",emoji:"🎸",from:"from-lime-400",to:"to-green-600" },
];

const fontStyles: Record<TextLayer["font"], React.CSSProperties> = {
  bold: { fontFamily: "sans-serif", fontWeight: 900 },
  italic: { fontFamily: "Georgia, serif", fontStyle: "italic" },
  classic: { fontFamily: "sans-serif", fontWeight: 400 },
  neon: { fontFamily: "monospace", fontWeight: 700, textShadow: "0 0 10px currentColor, 0 0 20px currentColor" },
  typewriter: { fontFamily: "Courier New, monospace", fontWeight: 500, letterSpacing: "0.05em" },
};

const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Draggable Text Layer ─────────────────────────────────────────────────────

function TextLayerEl({
  layer, selected,
  onSelect, onDragStart,
}: {
  layer: TextLayer; selected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  const bgStyle: React.CSSProperties =
    layer.bg === "solid" ? { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "4px 8px" } :
    layer.bg === "blur"  ? { backdropFilter: "blur(8px)", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 6, padding: "4px 8px" } :
    {};
  return (
    <div
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); onDragStart(e); }}
      className={cn(
        "absolute cursor-grab active:cursor-grabbing select-none max-w-[85%] touch-none",
        selected && "ring-2 ring-white/80 ring-offset-1 ring-offset-transparent rounded"
      )}
      style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: "translate(-50%,-50%)", textAlign: layer.align, ...bgStyle }}
    >
      {selected && <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 text-white/60 text-[9px]"><Move size={8}/> drag</div>}
      <span style={{ color: layer.color, fontSize: layer.fontSize, textShadow: "0 2px 8px rgba(0,0,0,0.7)", ...fontStyles[layer.font] }}>
        {layer.text}
      </span>
    </div>
  );
}

// ─── Draggable Sticker Layer ──────────────────────────────────────────────────

function StickerEl({ s, selected, onSelect, onDragStart }: {
  s: StickerLayer; selected: boolean;
  onSelect: () => void; onDragStart: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); onDragStart(e); }}
      className={cn(
        "absolute cursor-grab active:cursor-grabbing select-none touch-none",
        selected && "ring-2 ring-white/80 rounded-2xl ring-offset-1 ring-offset-transparent"
      )}
      style={{ left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-50%)" }}
    >
      {selected && <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 text-white/60 text-[9px]"><Move size={8}/> drag</div>}

      {s.type === "emoji" && <span style={{ fontSize: 48 }}>{s.emoji}</span>}

      {s.type === "poll" && (
        <div className="bg-white/90 rounded-2xl p-3 min-w-[150px] shadow-lg">
          <div className="text-black font-bold text-sm mb-2">{s.pollQuestion || "Vote!"}</div>
          {[s.pollA || "Yes 👍", s.pollB || "No 👎"].map((opt, i) => (
            <div key={i} className="rounded-full border-2 border-gray-300 text-xs font-semibold text-black py-1 px-3 mb-1 text-center">{opt}</div>
          ))}
        </div>
      )}
      {s.type === "question" && (
        <div className="bg-gradient-to-br from-fuchsia-500 to-indigo-500 rounded-2xl p-3 min-w-[150px] shadow-lg">
          <div className="text-white text-xs font-bold mb-1">ASK ME A QUESTION</div>
          <div className="bg-white/20 rounded-xl py-2 px-3 text-white/80 text-xs">{s.text || "Ask me anything..."}</div>
        </div>
      )}
      {s.type === "quiz" && (
        <div className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-2xl p-3 min-w-[150px] shadow-lg">
          <div className="text-white text-xs font-bold mb-1">QUIZ 🧠</div>
          <div className="text-white text-sm font-semibold mb-2">{s.text || "Quiz question?"}</div>
          {(s.quizOptions || ["Option A","Option B","Option C"]).map((opt, i) => (
            <div key={i} className={cn("rounded-xl text-xs font-semibold py-1.5 px-3 mb-1 text-center", i === (s.quizAnswer ?? 0) ? "bg-green-400 text-white" : "bg-white/20 text-white")}>{opt}</div>
          ))}
        </div>
      )}
      {s.type === "countdown" && (
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-3 min-w-[120px] shadow-lg text-center">
          <div className="text-white text-xs font-bold mb-1">⏰ COUNTDOWN</div>
          <div className="text-white font-black text-2xl">00:00</div>
          <div className="text-white/80 text-xs">{s.countdownLabel || "Until event!"}</div>
        </div>
      )}
      {s.type === "location" && (
        <div className="bg-white/90 rounded-full py-2 px-4 shadow-lg flex items-center gap-1">
          <MapPin size={14} className="text-red-500 shrink-0"/>
          <span className="text-black text-sm font-semibold">{s.text || "Location"}</span>
        </div>
      )}
      {s.type === "hashtag" && (
        <div className="bg-white/90 rounded-full py-2 px-4 shadow-lg">
          <span className="text-blue-600 text-sm font-bold">#{s.text || "hashtag"}</span>
        </div>
      )}
      {s.type === "mention" && (
        <div className="bg-white/90 rounded-full py-2 px-4 shadow-lg">
          <span className="text-indigo-600 text-sm font-bold">@{s.text || "username"}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StoryCreator({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const uploadMutation = useUploadStoryMedia();
  const createMutation = useCreateStory();
  const captionMutation = useGenerateCaption();

  const [step, setStep] = useState<Step>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [bgStyle, setBgStyle] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState(0);
  const [audience, setAudience] = useState<"everyone" | "close_friends">("everyone");
  const [activeTool, setActiveTool] = useState<ActiveTool>("none");

  // Text
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Stickers
  const [stickers, setStickers] = useState<StickerLayer[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [stickerMode, setStickerMode] = useState<StickerMode>("emoji");
  const [stickerForm, setStickerForm] = useState<Partial<StickerLayer>>({});

  // Drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [drawMode, setDrawMode] = useState<DrawMode>("pen");
  const [drawColor, setDrawColor] = useState("#ffffff");
  const [drawSize, setDrawSize] = useState(4);
  const isDrawingRef = useRef(false);
  const currentPath = useRef<{ x: number; y: number }[]>([]);

  // Drag state
  const draggingRef = useRef<{ id: string; type: "text" | "sticker" } | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Music
  const [selectedTrack, setSelectedTrack] = useState<typeof MUSIC_TRACKS[0] | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { return () => { audioRef.current?.pause(); }; }, []);

  // ─── Drawing ──────────────────────────────────────────────────────────────

  const redrawCanvas = useCallback((allPaths: DrawPath[]) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allPaths.forEach((path) => {
      if (path.points.length < 2) return;
      ctx.save();
      ctx.globalCompositeOperation = path.mode === "eraser" ? "destination-out" : "source-over";
      ctx.globalAlpha = path.opacity;
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.size;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (path.mode === "neon") { ctx.shadowColor = path.color; ctx.shadowBlur = path.size * 3; }
      ctx.beginPath();
      ctx.moveTo(path.points[0].x, path.points[0].y);
      path.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke(); ctx.restore();
    });
  }, []);

  useEffect(() => { if (step === "edit") redrawCanvas(paths); }, [paths, step, redrawCanvas]);

  const getCanvasPos = (e: React.PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const getContainerPct = (e: React.PointerEvent) => {
    const el = canvasContainerRef.current; if (!el) return { x: 50, y: 50 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };

  // ─── Unified pointer handlers on canvas container ─────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === "draw") {
      const canvas = canvasRef.current; if (!canvas) return;
      isDrawingRef.current = true;
      currentPath.current = [getCanvasPos(e, canvas)];
    }
    // drag is initiated from individual elements, not here
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeTool === "draw" && isDrawingRef.current) {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      const pos = getCanvasPos(e, canvas);
      currentPath.current.push(pos);
      // Live stroke
      ctx.save();
      ctx.globalCompositeOperation = drawMode === "eraser" ? "destination-out" : "source-over";
      ctx.globalAlpha = drawMode === "marker" ? 0.6 : 1;
      ctx.strokeStyle = drawColor; ctx.lineWidth = drawSize;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (drawMode === "neon") { ctx.shadowColor = drawColor; ctx.shadowBlur = drawSize * 3; }
      const pts = currentPath.current;
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // Handle dragging text or sticker
    if (draggingRef.current) {
      e.preventDefault();
      const { x, y } = getContainerPct(e);
      const { id, type } = draggingRef.current;
      if (type === "text") {
        setTextLayers(prev => prev.map(l => l.id === id ? { ...l, x, y } : l));
      } else {
        setStickers(prev => prev.map(s => s.id === id ? { ...s, x, y } : s));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTool === "draw" && isDrawingRef.current) {
      isDrawingRef.current = false;
      if (currentPath.current.length > 1) {
        const newPath: DrawPath = { points: [...currentPath.current], color: drawColor, size: drawSize, mode: drawMode, opacity: drawMode === "marker" ? 0.6 : 1 };
        setPaths(prev => { const next = [...prev, newPath]; redrawCanvas(next); return next; });
      }
      currentPath.current = [];
    }
    draggingRef.current = null;
  };

  const startDrag = (e: React.PointerEvent, id: string, type: "text" | "sticker") => {
    if (activeTool === "draw") return;
    draggingRef.current = { id, type };
    // Capture pointer so moves fire even if pointer leaves element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const undoDraw = () => { const next = paths.slice(0, -1); setPaths(next); redrawCanvas(next); };
  const clearDraw = () => { setPaths([]); redrawCanvas([]); };

  // ─── Text ────────────────────────────────────────────────────────────────

  const addTextLayer = () => {
    const layer: TextLayer = { id: uid(), text: "Your text here", x: 50, y: 50, color: "#ffffff", fontSize: 28, font: "bold", align: "center", bg: "none" };
    setTextLayers(prev => [...prev, layer]);
    setSelectedTextId(layer.id);
    setActiveTool("text");
  };

  const updateText = (id: string, upd: Partial<TextLayer>) =>
    setTextLayers(prev => prev.map(l => l.id === id ? { ...l, ...upd } : l));

  const deleteText = (id: string) => {
    setTextLayers(prev => prev.filter(l => l.id !== id));
    setSelectedTextId(null); setActiveTool("none");
  };

  const selectedTextLayer = textLayers.find(l => l.id === selectedTextId);

  // ─── Stickers ────────────────────────────────────────────────────────────

  const addSticker = (extra: Partial<StickerLayer>) => {
    const s: StickerLayer = { id: uid(), type: "emoji", x: 50, y: 40, ...extra };
    setStickers(prev => [...prev, s]);
    setSelectedStickerId(s.id);
    setActiveTool("none"); setStickerForm({});
  };

  const deleteSticker = (id: string) => {
    setStickers(prev => prev.filter(s => s.id !== id));
    setSelectedStickerId(null);
  };

  // ─── Music ───────────────────────────────────────────────────────────────

  const stopAudio = () => { audioRef.current?.pause(); if (audioRef.current) audioRef.current.currentTime = 0; setPlayingTrackId(null); };
  const handleTrackPreview = (track: typeof MUSIC_TRACKS[0]) => {
    if (playingTrackId === track.id) { stopAudio(); return; }
    stopAudio();
    const audio = new Audio(track.url); audio.volume = 0.4;
    audio.play().catch(() => {}); audio.onended = () => setPlayingTrackId(null);
    audioRef.current = audio; setPlayingTrackId(track.id);
  };

  // ─── AI Caption ──────────────────────────────────────────────────────────

  const handleAI = async () => {
    setAiLoading(true);
    try {
      const r = await captionMutation.mutateAsync({ data: { prompt: "Write a short fun catchy Instagram story caption. Max 10 words, add 2 emojis." } });
      const layer: TextLayer = { id: uid(), text: r.caption, x: 50, y: 75, color: "#ffffff", fontSize: 22, font: "bold", align: "center", bg: "none" };
      setTextLayers(prev => [...prev, layer]);
      setSelectedTextId(layer.id); setActiveTool("text");
    } catch { toast({ title: "AI failed", variant: "destructive" }); }
    finally { setAiLoading(false); }
  };

  // ─── File ─────────────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast({ title: "File too large", description: "Max 50MB", variant: "destructive" }); return; }
    setMediaType(file.type.startsWith("video") ? "video" : "image");
    setBgStyle(null);
    const reader = new FileReader();
    reader.onloadend = () => { setPreview(reader.result as string); setStep("edit"); };
    reader.readAsDataURL(file);
  };

  // ─── Share ────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    if (!preview && !bgStyle) return;
    stopAudio(); setStep("uploading");
    try {
      let url = uploadedUrl;
      if (!url && preview) {
        const mimeType = preview.split(";")[0].split(":")[1] ?? "image/jpeg";
        const base64Data = preview.split(",")[1] ?? preview;
        const r = await uploadMutation.mutateAsync({ data: { data: base64Data, mimeType } });
        url = r.url; setUploadedUrl(url);
      } else if (!url) {
        url = "https://placehold.co/1080x1920/667eea/ffffff?text=Story";
      }
      const caption = textLayers.map(l => l.text).join(" ") || null;
      await createMutation.mutateAsync({
        data: {
          mediaUrl: url!,
          mediaType: "image",
          caption,
          textColor: textLayers[0]?.color ?? null,
          musicTrack: selectedTrack?.name ?? null,
          musicUrl: selectedTrack?.url ?? null,
          musicArtist: selectedTrack?.artist ?? null,
          stickers: stickers.map(s => ({
            id: s.id,
            type: s.type,
            x: s.x,
            y: s.y,
            emoji: s.emoji ?? null,
            text: s.text ?? null,
            pollQuestion: s.pollQuestion ?? null,
            pollA: s.pollA ?? null,
            pollB: s.pollB ?? null,
            quizOptions: s.quizOptions ?? [],
            quizAnswer: s.quizAnswer ?? null,
            countdownLabel: s.countdownLabel ?? null,
          })),
        } as any,
      });
      setStep("done");
      setTimeout(() => { onSuccess(); onClose(); }, 1400);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
      setStep("edit");
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}>
      <div
        className="relative w-full max-w-[420px] h-[100dvh] md:h-[90vh] md:max-h-[900px] overflow-hidden md:rounded-[32px] bg-zinc-950 shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 z-30 shrink-0">
          <button onClick={() => { stopAudio(); if (step==="edit") setStep("pick"); else if (step==="music") setStep("edit"); else onClose(); }}
            className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
            {step === "pick" ? <X size={18}/> : <ChevronLeft size={18}/>}
          </button>

          {step === "edit" && (
            <div className="flex items-center gap-2">
              <button onClick={handleAI} disabled={aiLoading}
                className="flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-60">
                {aiLoading ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Text
              </button>
              <button onClick={() => setStep("music")} className="flex items-center gap-1.5 bg-black/40 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                <Music size={12}/> Music
              </button>
              <button onClick={handleShare} className="bg-white text-black text-xs font-black px-4 py-1.5 rounded-full">Share</button>
            </div>
          )}
          {step === "music" && (
            <button onClick={handleShare} className="bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white text-xs font-bold px-5 py-1.5 rounded-full">Share Story</button>
          )}
          {(step==="pick"||step==="uploading"||step==="done") && <div className="w-20"/>}
        </div>

        {/* Body */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          <AnimatePresence mode="wait">

            {/* PICK */}
            {step === "pick" && (
              <motion.div key="pick" initial={{ opacity:0,y:20 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }}
                className="flex flex-col h-full overflow-y-auto">
                <div className="flex flex-col items-center gap-5 px-6 pt-4 pb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center shadow-xl">
                    <ImagePlus size={28} className="text-white"/>
                  </div>
                  <div className="text-center">
                    <h2 className="text-white text-xl font-black mb-1">Create Story</h2>
                    <p className="text-white/50 text-xs">Photo · Video · Text · Draw · Stickers · Music</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full">
                    {[{icon:ImagePlus,label:"Photo",sub:"From gallery",color:"text-fuchsia-400"},{icon:Video,label:"Video",sub:"Up to 50MB",color:"text-indigo-400"}].map(({icon:Icon,label,sub,color})=>(
                      <button key={label} onClick={()=>fileInputRef.current?.click()}
                        className="flex flex-col items-center gap-2 bg-white/8 hover:bg-white/12 border border-white/15 rounded-2xl py-5 transition-all active:scale-95">
                        <Icon size={22} className={color}/><div><div className="text-white text-sm font-bold">{label}</div><div className="text-white/40 text-xs">{sub}</div></div>
                      </button>
                    ))}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile}/>

                  <div className="w-full">
                    <p className="text-white/60 text-xs font-semibold mb-3 uppercase tracking-wider">Text Story — Pick background</p>
                    <div className="grid grid-cols-7 gap-2">
                      {BG_GRADIENTS.map((bg,i)=>(
                        <button key={i} onClick={()=>{setBgStyle(bg);setPreview(null);setStep("edit");}}
                          className="aspect-square rounded-xl border-2 border-transparent hover:border-white hover:scale-110 transition-all"
                          style={{ background: bg }}/>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* EDIT */}
            {step === "edit" && (
              <motion.div key="edit" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="flex h-full min-h-0">

                {/* Canvas */}
                <div
                  ref={canvasContainerRef}
                  className="relative flex-1 overflow-hidden touch-none"
                  style={{ cursor: activeTool==="draw" ? "crosshair" : draggingRef.current ? "grabbing" : "default" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onClick={() => { setSelectedTextId(null); setSelectedStickerId(null); }}
                >
                  {/* Media / background */}
                  {preview ? (
                    mediaType==="video"
                      ? <video src={preview} autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ filter: CSS_FILTERS[filterIndex].style }}/>
                      : <img src={preview} alt="" className="w-full h-full object-cover" style={{ filter: CSS_FILTERS[filterIndex].style }}/>
                  ) : (
                    <div className="w-full h-full" style={{ background: bgStyle ?? "#1a1a2e" }}/>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none"/>

                  {/* Draw canvas */}
                  <canvas ref={canvasRef} width={420} height={748}
                    className="absolute inset-0 w-full h-full"
                    style={{ pointerEvents: "none" }}/>

                  {/* Music badge */}
                  {selectedTrack && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-2 pointer-events-none">
                      <Music size={11} className="text-white"/><span className="text-white text-xs font-semibold">{selectedTrack.name}</span>
                    </div>
                  )}

                  {/* CF badge */}
                  {audience==="close_friends" && (
                    <div className="absolute top-2 right-2 bg-green-500 rounded-full px-2 py-0.5 text-white text-xs font-bold pointer-events-none">CF</div>
                  )}

                  {/* Text layers */}
                  {textLayers.map(layer=>(
                    <TextLayerEl key={layer.id} layer={layer} selected={selectedTextId===layer.id}
                      onSelect={()=>{ setSelectedTextId(layer.id); setSelectedStickerId(null); setActiveTool("text"); }}
                      onDragStart={e=>startDrag(e,layer.id,"text")}/>
                  ))}

                  {/* Sticker layers */}
                  {stickers.map(s=>(
                    <StickerEl key={s.id} s={s} selected={selectedStickerId===s.id}
                      onSelect={()=>{ setSelectedStickerId(s.id); setSelectedTextId(null); }}
                      onDragStart={e=>startDrag(e,s.id,"sticker")}/>
                  ))}

                  {/* Selected sticker actions */}
                  {selectedStickerId && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
                      <button onClick={()=>deleteSticker(selectedStickerId)}
                        className="px-3 py-1.5 bg-red-500/80 backdrop-blur-sm rounded-full text-white text-xs font-bold flex items-center gap-1">
                        <Trash2 size={11}/> Remove
                      </button>
                      <button onClick={()=>setSelectedStickerId(null)}
                        className="px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs font-bold flex items-center gap-1">
                        <Check size={11}/> Done
                      </button>
                    </div>
                  )}
                </div>

                {/* Right toolbar */}
                <div className="flex flex-col items-center gap-2 px-1 py-3 bg-black/30 backdrop-blur-sm shrink-0">
                  {([
                    { id:"text" as ActiveTool, icon:Type, label:"Text" },
                    { id:"draw" as ActiveTool, icon:Pencil, label:"Draw" },
                    { id:"sticker" as ActiveTool, icon:Smile, label:"Sticker" },
                    { id:"filter" as ActiveTool, icon:Sliders, label:"Filter" },
                    { id:"audience" as ActiveTool, icon:Users, label:"Who" },
                  ] as {id:ActiveTool,icon:React.ElementType,label:string}[]).map(({id,icon:Icon,label})=>(
                    <button key={id}
                      onClick={()=>{
                        if (id==="text") { addTextLayer(); return; }
                        setActiveTool(activeTool===id?"none":id);
                        setSelectedTextId(null); setSelectedStickerId(null);
                      }}
                      className={cn("flex flex-col items-center gap-0.5 w-12 py-2 rounded-xl transition-all text-white",
                        activeTool===id ? "bg-white/25 scale-105" : "hover:bg-white/10")}>
                      <Icon size={17}/><span className="text-[9px] font-semibold">{label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* MUSIC */}
            {step === "music" && (
              <motion.div key="music" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0 }} className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"><Music size={14}/> Choose a vibe</p>
                  <button onClick={()=>{setSelectedTrack(null);stopAudio();}}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all border",!selectedTrack?"border-white/30 bg-white/15":"border-white/10 bg-white/5 hover:bg-white/10")}>
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">🔇</div>
                    <div className="text-left flex-1"><div className="text-white text-sm font-semibold">No Music</div><div className="text-white/50 text-xs">Keep it silent</div></div>
                    {!selectedTrack && <div className="w-5 h-5 rounded-full bg-fuchsia-500 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white"/></div>}
                  </button>
                  {MUSIC_TRACKS.map(track=>(
                    <motion.div key={track.id} whileTap={{ scale:0.97 }}
                      className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-all border",selectedTrack?.id===track.id?"border-white/30 bg-white/15":"border-white/10 bg-white/5 hover:bg-white/10")}
                      onClick={()=>setSelectedTrack(track)}>
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${track.from} ${track.to} flex items-center justify-center text-xl shrink-0`}>{track.emoji}</div>
                      <div className="flex-1 min-w-0"><div className="text-white text-sm font-semibold truncate">{track.name}</div><div className="text-white/50 text-xs">{track.artist}</div></div>
                      <button onClick={e=>{e.stopPropagation();handleTrackPreview(track);}} className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 shrink-0">
                        {playingTrackId===track.id ? <Pause size={13} className="text-white"/> : <Play size={13} className="text-white ml-0.5"/>}
                      </button>
                      {selectedTrack?.id===track.id && <div className="w-5 h-5 rounded-full bg-fuchsia-500 flex items-center justify-center shrink-0"><div className="w-2 h-2 rounded-full bg-white"/></div>}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {step === "uploading" && (
              <motion.div key="uploading" initial={{ opacity:0 }} animate={{ opacity:1 }} className="flex flex-col items-center justify-center gap-5 h-full">
                <div className="relative w-24 h-24">
                  <motion.div className="absolute inset-0 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 opacity-30" animate={{ scale:[1,1.3,1] }} transition={{ duration:1.5,repeat:Infinity }}/>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 flex items-center justify-center"><Loader2 size={36} className="text-white animate-spin"/></div>
                </div>
                <p className="text-white text-lg font-semibold">Sharing your story...</p>
                <p className="text-white/50 text-sm">Just a moment ✨</p>
              </motion.div>
            )}
            {step === "done" && (
              <motion.div key="done" initial={{ scale:0.7,opacity:0 }} animate={{ scale:1,opacity:1 }} transition={{ type:"spring",bounce:0.5 }}
                className="flex flex-col items-center justify-center gap-5 h-full">
                <div className="w-24 h-24 bg-gradient-to-br from-fuchsia-500 to-indigo-500 rounded-full flex items-center justify-center shadow-2xl"><CheckCircle size={44} className="text-white"/></div>
                <p className="text-white text-xl font-black">Story shared! 🎉</p>
                <p className="text-white/50 text-sm">Your story is live for 24 hours</p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Bottom panels */}
        {step === "edit" && (
          <AnimatePresence>

            {/* Draw panel */}
            {activeTool === "draw" && (
              <motion.div key="draw" initial={{ y:"100%" }} animate={{ y:0 }} exit={{ y:"100%" }}
                className="bg-zinc-900/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Draw</span>
                  <div className="flex gap-2">
                    <button onClick={undoDraw} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20"><Undo2 size={14} className="text-white"/></button>
                    <button onClick={clearDraw} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20"><Trash2 size={14} className="text-white"/></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(["pen","marker","neon","eraser"] as DrawMode[]).map(m=>(
                    <button key={m} onClick={()=>setDrawMode(m)}
                      className={cn("flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all",drawMode===m?"bg-white text-black":"bg-white/10 text-white hover:bg-white/20")}>
                      {m==="eraser" ? <Eraser size={13} className="mx-auto"/> : m}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/50 text-xs w-8">Size</span>
                  <input type="range" min={1} max={30} value={drawSize} onChange={e=>setDrawSize(Number(e.target.value))} className="flex-1 accent-fuchsia-500"/>
                  <span className="text-white/70 text-xs w-6 text-right">{drawSize}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {DRAW_COLORS.map(c=>(
                    <button key={c} onClick={()=>setDrawColor(c)}
                      className={cn("w-7 h-7 rounded-full border-2 transition-all",drawColor===c?"border-white scale-125":"border-transparent hover:scale-110")}
                      style={{ backgroundColor:c }}/>
                  ))}
                  <label className="w-7 h-7 rounded-full overflow-hidden border-2 border-white/30 cursor-pointer hover:scale-110 transition-all relative">
                    <input type="color" value={drawColor} onChange={e=>setDrawColor(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
                    <div className="w-full h-full rounded-full" style={{ backgroundColor:drawColor }}/>
                  </label>
                </div>
              </motion.div>
            )}

            {/* Text panel */}
            {activeTool === "text" && selectedTextLayer && (
              <motion.div key="text" initial={{ y:"100%" }} animate={{ y:0 }} exit={{ y:"100%" }}
                className="bg-zinc-900/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Text Layer</span>
                  <div className="flex gap-2">
                    <button onClick={()=>{setSelectedTextId(null);setActiveTool("none");}} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20"><Check size={13} className="text-white"/></button>
                    <button onClick={()=>deleteText(selectedTextLayer.id)} className="p-1.5 bg-red-500/20 rounded-lg hover:bg-red-500/40"><Trash2 size={13} className="text-red-400"/></button>
                  </div>
                </div>
                <textarea value={selectedTextLayer.text} onChange={e=>updateText(selectedTextLayer.id,{text:e.target.value})} rows={2}
                  className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/40 outline-none resize-none border border-white/15 focus:border-fuchsia-500"/>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  {(["bold","italic","classic","neon","typewriter"] as TextLayer["font"][]).map(f=>(
                    <button key={f} onClick={()=>updateText(selectedTextLayer.id,{font:f})}
                      className={cn("px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all shrink-0",selectedTextLayer.font===f?"bg-white text-black font-bold":"bg-white/10 text-white hover:bg-white/20")}
                      style={fontStyles[f]}>{f}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="range" min={12} max={72} value={selectedTextLayer.fontSize} onChange={e=>updateText(selectedTextLayer.id,{fontSize:Number(e.target.value)})} className="flex-1 accent-fuchsia-500"/>
                  <div className="flex gap-1">
                    {([["left",AlignLeft],["center",AlignCenter],["right",AlignRight]] as [TextLayer["align"],React.ElementType][]).map(([a,Icon])=>(
                      <button key={a} onClick={()=>updateText(selectedTextLayer.id,{align:a})} className={cn("p-1.5 rounded",selectedTextLayer.align===a?"bg-white/30":"bg-white/10")}><Icon size={11} className="text-white"/></button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {(["none","solid","blur"] as TextLayer["bg"][]).map(b=>(
                      <button key={b} onClick={()=>updateText(selectedTextLayer.id,{bg:b})}
                        className={cn("px-1.5 py-1 rounded text-[9px] font-bold capitalize",selectedTextLayer.bg===b?"bg-white text-black":"bg-white/10 text-white")}>{b}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {TEXT_COLORS.map(c=>(
                    <button key={c} onClick={()=>updateText(selectedTextLayer.id,{color:c})}
                      className={cn("w-6 h-6 rounded-full border-2 transition-all",selectedTextLayer.color===c?"border-white scale-125":"border-transparent hover:scale-110")}
                      style={{ backgroundColor:c }}/>
                  ))}
                  <label className="w-6 h-6 rounded-full overflow-hidden border-2 border-white/30 cursor-pointer relative hover:scale-110 transition-all">
                    <input type="color" value={selectedTextLayer.color} onChange={e=>updateText(selectedTextLayer.id,{color:e.target.value})} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
                    <div className="w-full h-full rounded-full" style={{ backgroundColor:selectedTextLayer.color }}/>
                  </label>
                </div>
              </motion.div>
            )}

            {/* Sticker panel */}
            {activeTool === "sticker" && (
              <motion.div key="sticker" initial={{ y:"100%" }} animate={{ y:0 }} exit={{ y:"100%" }}
                className="bg-zinc-900/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 space-y-3 shrink-0 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Stickers</span>
                  <button onClick={()=>setActiveTool("none")}><X size={16} className="text-white/60"/></button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide shrink-0">
                  {([["emoji","😀","Emoji"],["poll","📊","Poll"],["question","❓","Ask"],["quiz","🧠","Quiz"],["countdown","⏰","Timer"],["location","📍","Place"],["hashtag","#","Tag"],["mention","@","Mention"]] as [StickerMode,string,string][]).map(([mode,icon,label])=>(
                    <button key={mode} onClick={()=>setStickerMode(mode)}
                      className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all",stickerMode===mode?"bg-white text-black":"bg-white/10 text-white hover:bg-white/20")}>
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {stickerMode==="emoji" && (
                  <div className="grid grid-cols-8 gap-1.5">
                    {COMMON_EMOJIS.map(em=>(
                      <button key={em} onClick={()=>addSticker({type:"emoji",emoji:em})} className="text-2xl hover:scale-125 active:scale-90 transition-all text-center">{em}</button>
                    ))}
                  </div>
                )}
                {stickerMode==="poll" && (
                  <div className="space-y-2">
                    <input placeholder="Question?" value={stickerForm.pollQuestion??""} onChange={e=>setStickerForm(p=>({...p,pollQuestion:e.target.value}))} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    <div className="flex gap-2">
                      <input placeholder="Option A" value={stickerForm.pollA??""} onChange={e=>setStickerForm(p=>({...p,pollA:e.target.value}))} className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                      <input placeholder="Option B" value={stickerForm.pollB??""} onChange={e=>setStickerForm(p=>({...p,pollB:e.target.value}))} className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    </div>
                    <button onClick={()=>addSticker({type:"poll",pollQuestion:stickerForm.pollQuestion,pollA:stickerForm.pollA,pollB:stickerForm.pollB})} className="w-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2"><Plus size={13}/> Add Poll</button>
                  </div>
                )}
                {stickerMode==="question" && (
                  <div className="space-y-2">
                    <input placeholder="Ask me a question..." value={stickerForm.text??""} onChange={e=>setStickerForm(p=>({...p,text:e.target.value}))} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    <button onClick={()=>addSticker({type:"question",text:stickerForm.text})} className="w-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2"><HelpCircle size={13}/> Add Question</button>
                  </div>
                )}
                {stickerMode==="quiz" && (
                  <div className="space-y-2">
                    <input placeholder="Quiz question" value={stickerForm.text??""} onChange={e=>setStickerForm(p=>({...p,text:e.target.value}))} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    {["A","B","C"].map((opt,i)=>(
                      <input key={opt} placeholder={`Option ${opt}`} value={(stickerForm.quizOptions??[])[i]??""} onChange={e=>{ const opts=[...(stickerForm.quizOptions??["","",""])]; opts[i]=e.target.value; setStickerForm(p=>({...p,quizOptions:opts})); }} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    ))}
                    <button onClick={()=>addSticker({type:"quiz",text:stickerForm.text,quizOptions:stickerForm.quizOptions,quizAnswer:0})} className="w-full bg-gradient-to-r from-violet-500 to-purple-700 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2"><BarChart2 size={13}/> Add Quiz</button>
                  </div>
                )}
                {stickerMode==="countdown" && (
                  <div className="space-y-2">
                    <input placeholder="Event name" value={stickerForm.countdownLabel??""} onChange={e=>setStickerForm(p=>({...p,countdownLabel:e.target.value}))} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    <button onClick={()=>addSticker({type:"countdown",countdownLabel:stickerForm.countdownLabel})} className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2"><Clock size={13}/> Add Countdown</button>
                  </div>
                )}
                {stickerMode==="location" && (
                  <div className="space-y-2">
                    <input placeholder="Location name" value={stickerForm.text??""} onChange={e=>setStickerForm(p=>({...p,text:e.target.value}))} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    <button onClick={()=>addSticker({type:"location",text:stickerForm.text})} className="w-full bg-red-500 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2"><MapPin size={13}/> Add Location</button>
                  </div>
                )}
                {stickerMode==="hashtag" && (
                  <div className="space-y-2">
                    <input placeholder="hashtag (without #)" value={stickerForm.text??""} onChange={e=>setStickerForm(p=>({...p,text:e.target.value}))} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    <button onClick={()=>addSticker({type:"hashtag",text:stickerForm.text})} className="w-full bg-blue-500 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2"><Hash size={13}/> Add Hashtag</button>
                  </div>
                )}
                {stickerMode==="mention" && (
                  <div className="space-y-2">
                    <input placeholder="username (without @)" value={stickerForm.text??""} onChange={e=>setStickerForm(p=>({...p,text:e.target.value}))} className="w-full bg-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/15 focus:border-fuchsia-500"/>
                    <button onClick={()=>addSticker({type:"mention",text:stickerForm.text})} className="w-full bg-indigo-500 text-white text-sm font-bold py-2 rounded-xl flex items-center justify-center gap-2"><AtSign size={13}/> Add Mention</button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Filter panel */}
            {activeTool==="filter" && preview && (
              <motion.div key="filter" initial={{ y:"100%" }} animate={{ y:0 }} exit={{ y:"100%" }}
                className="bg-zinc-900/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Filters</span>
                  <button onClick={()=>setActiveTool("none")}><X size={16} className="text-white/60"/></button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {CSS_FILTERS.map((f,i)=>(
                    <button key={f.label} onClick={()=>setFilterIndex(i)}
                      className={cn("flex flex-col items-center gap-1.5 shrink-0 transition-all",filterIndex===i?"scale-105":"opacity-60 hover:opacity-90")}>
                      <div className={cn("w-14 h-14 rounded-xl overflow-hidden border-2",filterIndex===i?"border-white":"border-transparent")}>
                        <img src={preview} alt={f.label} className="w-full h-full object-cover" style={{ filter:f.style }}/>
                      </div>
                      <span className="text-white text-[9px] font-semibold">{f.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Audience panel */}
            {activeTool==="audience" && (
              <motion.div key="audience" initial={{ y:"100%" }} animate={{ y:0 }} exit={{ y:"100%" }}
                className="bg-zinc-900/95 backdrop-blur-sm border-t border-white/10 px-4 py-4 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Who can see this?</span>
                  <button onClick={()=>setActiveTool("none")}><X size={16} className="text-white/60"/></button>
                </div>
                <div className="flex flex-col gap-2">
                  {([["everyone",Users,"Everyone","Your followers and the public"],["close_friends",UserCheck,"Close Friends only","Only your close friends list"]] as ["everyone"|"close_friends",React.ElementType,string,string][]).map(([val,Icon,label,sub])=>(
                    <button key={val} onClick={()=>{setAudience(val);setActiveTool("none");}}
                      className={cn("flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left",
                        audience===val ? (val==="close_friends"?"border-green-500 bg-green-500/10":"border-white/40 bg-white/10") : "border-white/10 bg-white/5 hover:bg-white/10")}>
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0",val==="close_friends"?"bg-green-500/20":"bg-white/10")}>
                        <Icon size={19} className={val==="close_friends"?"text-green-400":"text-white"}/>
                      </div>
                      <div className="flex-1"><div className="text-white text-sm font-semibold">{label}</div><div className="text-white/50 text-xs">{sub}</div></div>
                      {audience===val && <Check size={15} className={val==="close_friends"?"text-green-400":"text-white"}/>}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
