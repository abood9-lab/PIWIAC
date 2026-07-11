import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Camera, RotateCcw, X, Send,
  FlipHorizontal2, Music, ChevronRight, Check,
  Pen, Type, Smile, SlidersHorizontal,
  Video, ImagePlus, BookImage, Infinity, Play, Trash2, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import * as faceapi from "face-api.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MODEL_URL = `${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/weights`;

const BASE_URL = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

async function apiRequest(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("pixlr_token") ?? "";
  const r = await fetch(`${BASE_URL}/api/${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── AR Filters ────────────────────────────────────────────────────────────────

interface ARFilter {
  id: string;
  label: string;
  emoji: string;
  draw: (ctx: CanvasRenderingContext2D, landmarks: faceapi.FaceLandmarks68, scale: {sx: number; sy: number}) => void;
}

function drawDogFilter(ctx: CanvasRenderingContext2D, lm: faceapi.FaceLandmarks68, s: {sx: number; sy: number}) {
  const pts = lm.positions;
  const nose = pts[30];
  const leftBrow = pts[19];
  const rightBrow = pts[24];
  const chin = pts[8];
  const faceH = Math.abs(chin.y - leftBrow.y) * s.sy;
  const faceW = Math.abs(pts[16].x - pts[0].x) * s.sx;
  const cx = ((leftBrow.x + rightBrow.x) / 2) * s.sx;
  const topY = Math.min(leftBrow.y, rightBrow.y) * s.sy;

  // Left ear
  ctx.save();
  ctx.translate(cx - faceW * 0.35, topY - faceH * 0.18);
  ctx.rotate(-0.3);
  ctx.fillStyle = "#8B4513";
  roundRect(ctx, -faceW * 0.15, -faceH * 0.35, faceW * 0.28, faceH * 0.4, 8);
  ctx.fill();
  ctx.fillStyle = "#D2691E";
  roundRect(ctx, -faceW * 0.09, -faceH * 0.28, faceW * 0.18, faceH * 0.28, 6);
  ctx.fill();
  ctx.restore();

  // Right ear
  ctx.save();
  ctx.translate(cx + faceW * 0.35, topY - faceH * 0.18);
  ctx.rotate(0.3);
  ctx.fillStyle = "#8B4513";
  roundRect(ctx, -faceW * 0.15, -faceH * 0.35, faceW * 0.28, faceH * 0.4, 8);
  ctx.fill();
  ctx.fillStyle = "#D2691E";
  roundRect(ctx, -faceW * 0.09, -faceH * 0.28, faceW * 0.18, faceH * 0.28, 6);
  ctx.fill();
  ctx.restore();

  // Dog nose
  const nx = nose.x * s.sx;
  const ny = nose.y * s.sy;
  const noseR = faceW * 0.09;
  ctx.beginPath();
  ctx.ellipse(nx, ny, noseR, noseR * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(nx - noseR * 0.3, ny - noseR * 0.25, noseR * 0.2, noseR * 0.15, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();

  // Whiskers
  const wy = ny + noseR * 0.6;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(nx - noseR, wy + i * noseR * 0.7); ctx.lineTo(nx - noseR * 3.5, wy + i * noseR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx + noseR, wy + i * noseR * 0.7); ctx.lineTo(nx + noseR * 3.5, wy + i * noseR); ctx.stroke();
  }
}

function drawBunnyFilter(ctx: CanvasRenderingContext2D, lm: faceapi.FaceLandmarks68, s: {sx: number; sy: number}) {
  const pts = lm.positions;
  const leftBrow = pts[19];
  const rightBrow = pts[24];
  const chin = pts[8];
  const faceH = Math.abs(chin.y - leftBrow.y) * s.sy;
  const faceW = Math.abs(pts[16].x - pts[0].x) * s.sx;
  const cx = ((leftBrow.x + rightBrow.x) / 2) * s.sx;
  const topY = Math.min(leftBrow.y, rightBrow.y) * s.sy;

  const earW = faceW * 0.16;
  const earH = faceH * 0.85;

  for (const side of [-1, 1]) {
    const ex = cx + side * faceW * 0.2;
    ctx.save();
    ctx.translate(ex, topY - earH * 0.4);
    ctx.rotate(side * 0.18);
    // Outer ear
    ctx.beginPath();
    ctx.ellipse(0, 0, earW / 2, earH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f5f5f5";
    ctx.fill();
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Inner ear
    ctx.beginPath();
    ctx.ellipse(0, earH * 0.08, earW * 0.3, earH * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffb6c1";
    ctx.fill();
    ctx.restore();
  }
}

function drawCatFilter(ctx: CanvasRenderingContext2D, lm: faceapi.FaceLandmarks68, s: {sx: number; sy: number}) {
  const pts = lm.positions;
  const leftBrow = pts[19];
  const rightBrow = pts[24];
  const nose = pts[30];
  const chin = pts[8];
  const faceH = Math.abs(chin.y - leftBrow.y) * s.sy;
  const faceW = Math.abs(pts[16].x - pts[0].x) * s.sx;
  const cx = ((leftBrow.x + rightBrow.x) / 2) * s.sx;
  const topY = Math.min(leftBrow.y, rightBrow.y) * s.sy;

  for (const [side, angle] of [[-1, -0.5], [1, 0.5]] as [number, number][]) {
    const ex = cx + side * faceW * 0.32;
    ctx.save();
    ctx.translate(ex, topY - faceH * 0.12);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-faceW * 0.15, -faceH * 0.3);
    ctx.lineTo(faceW * 0.15, -faceH * 0.3);
    ctx.closePath();
    ctx.fillStyle = "#2d2d2d";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -faceH * 0.02);
    ctx.lineTo(-faceW * 0.09, -faceH * 0.25);
    ctx.lineTo(faceW * 0.09, -faceH * 0.25);
    ctx.closePath();
    ctx.fillStyle = "#ff9ecd";
    ctx.fill();
    ctx.restore();
  }

  // Whiskers
  const nx = nose.x * s.sx;
  const ny = nose.y * s.sy;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(nx - faceW * 0.05, ny + i * faceH * 0.025); ctx.lineTo(nx - faceW * 0.45, ny + i * faceH * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx + faceW * 0.05, ny + i * faceH * 0.025); ctx.lineTo(nx + faceW * 0.45, ny + i * faceH * 0.04); ctx.stroke();
  }
}

function drawCrownFilter(ctx: CanvasRenderingContext2D, lm: faceapi.FaceLandmarks68, s: {sx: number; sy: number}) {
  const pts = lm.positions;
  const leftBrow = pts[17];
  const rightBrow = pts[26];
  const faceW = Math.abs(pts[16].x - pts[0].x) * s.sx;
  const cx = ((leftBrow.x + rightBrow.x) / 2) * s.sx;
  const topY = Math.min(leftBrow.y, rightBrow.y) * s.sy;
  const crownH = faceW * 0.38;
  const crownW = faceW * 0.85;
  const left = cx - crownW / 2;
  const baseY = topY - faceW * 0.06;

  // Crown body
  ctx.beginPath();
  ctx.moveTo(left, baseY);
  ctx.lineTo(left, baseY - crownH * 0.6);
  ctx.lineTo(left + crownW * 0.2, baseY - crownH * 0.3);
  ctx.lineTo(left + crownW * 0.35, baseY - crownH);
  ctx.lineTo(left + crownW * 0.5, baseY - crownH * 0.45);
  ctx.lineTo(left + crownW * 0.65, baseY - crownH);
  ctx.lineTo(left + crownW * 0.8, baseY - crownH * 0.3);
  ctx.lineTo(left + crownW, baseY - crownH * 0.6);
  ctx.lineTo(left + crownW, baseY);
  ctx.closePath();
  const grad = ctx.createLinearGradient(left, baseY - crownH, left, baseY);
  grad.addColorStop(0, "#FFD700");
  grad.addColorStop(0.5, "#FFA500");
  grad.addColorStop(1, "#FF8C00");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#cc7000";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gems
  const gems = [
    { x: left + crownW * 0.18, y: baseY - crownH * 0.65, r: crownH * 0.1, color: "#ff4488" },
    { x: left + crownW * 0.5, y: baseY - crownH * 0.5, r: crownH * 0.13, color: "#4488ff" },
    { x: left + crownW * 0.82, y: baseY - crownH * 0.65, r: crownH * 0.1, color: "#44ff88" },
    { x: left + crownW * 0.35, y: baseY - crownH * 1.02, r: crownH * 0.09, color: "#ff4444" },
    { x: left + crownW * 0.65, y: baseY - crownH * 1.02, r: crownH * 0.09, color: "#aa44ff" },
  ];
  gems.forEach(g => {
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
    ctx.fillStyle = g.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function drawGlassesFilter(ctx: CanvasRenderingContext2D, lm: faceapi.FaceLandmarks68, s: {sx: number; sy: number}) {
  const pts = lm.positions;
  const leftEyeOuter = pts[36];
  const leftEyeInner = pts[39];
  const rightEyeInner = pts[42];
  const rightEyeOuter = pts[45];
  const leftEyeTop = pts[37];

  const lx = ((leftEyeOuter.x + leftEyeInner.x) / 2) * s.sx;
  const rx = ((rightEyeInner.x + rightEyeOuter.x) / 2) * s.sx;
  const ey = ((leftEyeTop.y) * s.sy);
  const lensR = Math.abs(leftEyeInner.x - leftEyeOuter.x) * s.sx * 0.65;

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1a1a1a";

  // Left lens
  ctx.beginPath();
  ctx.arc(lx, ey, lensR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(100,200,255,0.25)";
  ctx.fill();
  ctx.stroke();

  // Right lens
  ctx.beginPath();
  ctx.arc(rx, ey, lensR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Bridge
  ctx.beginPath();
  ctx.moveTo(lx + lensR, ey);
  ctx.lineTo(rx - lensR, ey);
  ctx.stroke();

  // Arms
  ctx.beginPath();
  ctx.moveTo(lx - lensR, ey);
  ctx.lineTo(pts[0].x * s.sx - lensR * 0.5, ey - lensR * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx + lensR, ey);
  ctx.lineTo(pts[16].x * s.sx + lensR * 0.5, ey - lensR * 0.2);
  ctx.stroke();
}

function drawHeartsFilter(ctx: CanvasRenderingContext2D, lm: faceapi.FaceLandmarks68, s: {sx: number; sy: number}) {
  const pts = lm.positions;
  const lx = ((pts[36].x + pts[39].x) / 2) * s.sx;
  const rx = ((pts[42].x + pts[45].x) / 2) * s.sx;
  const ey = pts[37].y * s.sy;
  const size = Math.abs(pts[39].x - pts[36].x) * s.sx * 0.55;

  drawHeart(ctx, lx, ey, size, "#ff3366");
  drawHeart(ctx, rx, ey, size, "#ff3366");

  // Sparkles around face
  const sparkles = [pts[0], pts[16], pts[19], pts[24]];
  sparkles.forEach((p, i) => {
    const spx = p.x * s.sx;
    const spy = p.y * s.sy;
    const colors = ["#ff6699", "#ff99cc", "#ffaadd", "#ff77aa"];
    drawSparkle(ctx, spx, spy, size * 0.3, colors[i % colors.length]);
  });
}

function drawRainbowFilter(ctx: CanvasRenderingContext2D, lm: faceapi.FaceLandmarks68, s: {sx: number; sy: number}) {
  const pts = lm.positions;
  const leftCheek = pts[1];
  const rightCheek = pts[15];
  const noseTip = pts[30];

  const cx = noseTip.x * s.sx;
  const cy = noseTip.y * s.sy;
  const r = Math.abs(rightCheek.x - leftCheek.x) * s.sx * 0.55;

  const colors = ["#FF0000","#FF7700","#FFFF00","#00CC00","#0000FF","#8B00FF"];
  colors.forEach((color, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r - i * (r / 8), Math.PI, 0, false);
    ctx.lineWidth = r / 8;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Stars on cheeks
  drawSparkle(ctx, leftCheek.x * s.sx, leftCheek.y * s.sy, r * 0.15, "#FFD700");
  drawSparkle(ctx, rightCheek.x * s.sx, rightCheek.y * s.sy, r * 0.15, "#FFD700");
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.3);
  ctx.bezierCurveTo(-size, -size * 0.2, -size * 1.2, size * 0.5, 0, size);
  ctx.bezierCurveTo(size * 1.2, size * 0.5, size, -size * 0.2, 0, size * 0.3);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.3, size * 0.3);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.3, size * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const AR_FILTERS: ARFilter[] = [
  { id: "none",    label: "Natural", emoji: "😊", draw: () => {} },
  { id: "dog",     label: "Dog",     emoji: "🐶", draw: drawDogFilter },
  { id: "bunny",   label: "Bunny",   emoji: "🐰", draw: drawBunnyFilter },
  { id: "cat",     label: "Cat",     emoji: "😺", draw: drawCatFilter },
  { id: "crown",   label: "Crown",   emoji: "👑", draw: drawCrownFilter },
  { id: "glasses", label: "Glasses", emoji: "🕶️", draw: drawGlassesFilter },
  { id: "hearts",  label: "Hearts",  emoji: "❤️", draw: drawHeartsFilter },
  { id: "rainbow", label: "Rainbow", emoji: "🌈", draw: drawRainbowFilter },
];

// ─── Music ─────────────────────────────────────────────────────────────────────

const TRACKS = [
  { id: "1", title: "Tropical Vibes",   artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",  emoji: "🌴" },
  { id: "2", title: "Chill Groove",     artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",  emoji: "🎷" },
  { id: "3", title: "Electric Dreams",  artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",  emoji: "⚡" },
  { id: "4", title: "Night Drive",      artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",  emoji: "🌙" },
  { id: "5", title: "Summer Pop",       artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3", emoji: "☀️" },
];

// ─── Text overlays ─────────────────────────────────────────────────────────────

const TEXT_COLORS = ["#FFFFFF","#FF3B5C","#FFCC00","#00C7BE","#007AFF","#AF52DE","#FF9500","#000000"];

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SnapPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Camera
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [cameraReady, setCameraReady] = useState(false);

  // AR filter
  const arCanvasRef    = useRef<HTMLCanvasElement>(null);
  const animFrameRef   = useRef<number>(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [activeFilter, setActiveFilter] = useState(0); // index into AR_FILTERS

  // Capture
  const [captured, setCaptured]   = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);

  // Post-capture edit tools
  const [tool, setTool]           = useState<"none"|"text"|"sticker"|"filter">("none");
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [textInput, setTextInput] = useState("");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const dragTxtRef                = useRef<{id:string;ox:number;oy:number;mx:number;my:number}|null>(null);
  const containerRef              = useRef<HTMLDivElement>(null);
  const [postFilter, setPostFilter] = useState("none");

  // Drawing layer
  const drawCanvasRef  = useRef<HTMLCanvasElement>(null);
  const [drawMode, setDrawMode]   = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastDraw = useRef<{x:number;y:number}|null>(null);
  const [drawColor, setDrawColor] = useState("#FF3B5C");

  // Stickers
  const STICKERS = ["😂","🔥","💯","❤️","🌟","👻","💀","🎉","😎","🦋","🌈","✨","🎵","👑","💎","🌺","🐶","🐰","😺","🎸","⚡","🎤","🤩","🥵"];

  // Music
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const [showMusic, setShowMusic]     = useState(false);
  const [activeTrack, setActiveTrack] = useState<typeof TRACKS[0] | null>(null);
  const [trackPlaying, setTrackPlaying] = useState(false);

  // Video recording
  const mediaRecorderRef    = useRef<MediaRecorder | null>(null);
  const videoChunksRef      = useRef<Blob[]>([]);
  const shutterHoldRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const [capturedVideo, setCapturedVideo]     = useState<{ blob: Blob; url: string } | null>(null);
  const [recording, setRecording]             = useState(false);
  const [recordProgress, setRecordProgress]   = useState(0); // 0-100
  const MAX_RECORD_SECS = 15;

  // Composition grid (rule-of-thirds guide while framing)
  const [showGrid, setShowGrid] = useState(false);

  // View limit
  const [viewLimit, setViewLimit] = useState<1 | 2 | 3 | null>(null); // null = unlimited

  // Album
  interface AlbumItem { id: string; dataUrl: string; mediaType: "image" | "video"; timestamp: string; }
  const ALBUM_KEY = "pixlr_album";
  const loadAlbum = (): AlbumItem[] => { try { return JSON.parse(localStorage.getItem(ALBUM_KEY) ?? "[]"); } catch { return []; } };
  const [albumItems, setAlbumItems] = useState<AlbumItem[]>(() => loadAlbum());
  const [showAlbum, setShowAlbum]   = useState(false);
  const [albumSelected, setAlbumSelected] = useState<AlbumItem | null>(null);

  // Save states
  const [savingPost, setSavingPost] = useState(false);
  const [savingReel, setSavingReel] = useState(false);
  const [savedToAlbum, setSavedToAlbum] = useState(false);
  const [savedAsPost, setSavedAsPost]   = useState(false);
  const [savedAsReel, setSavedAsReel]   = useState(false);

  // Send panel
  const [showSend, setShowSend]         = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvs, setSelectedConvs] = useState<string[]>([]);
  const [sending, setSending]             = useState(false);
  const [sendDone, setSendDone]           = useState(false);

  // ── Load face-api models ─────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (e) {
        console.warn("face-api models failed to load:", e);
      }
    })();
  }, []);

  // ── Camera ───────────────────────────────────────────────────────────────

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play();
          setCameraReady(true);
        };
      }
    } catch (e) { console.error("Camera error", e); }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── AR detection loop ────────────────────────────────────────────────────

  const loopGenRef = useRef(0); // incremented each time loop should stop

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (!modelsLoaded || captured) return;
    const canvas = arCanvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    loopGenRef.current += 1;
    const gen = loopGenRef.current;

    const run = async () => {
      // Hard stop: if generation changed, this loop is stale — exit without scheduling
      if (loopGenRef.current !== gen) return;

      if (video.readyState >= 2) {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
          .withFaceLandmarks(true);

        // Check again after the async call — capture may have happened during detection
        if (loopGenRef.current !== gen) return;

        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const filter = AR_FILTERS[activeFilter];
        if (filter.id !== "none" && detections.length > 0) {
          const sx = canvas.width  / (video.videoWidth  || canvas.width);
          const sy = canvas.height / (video.videoHeight || canvas.height);
          for (const d of detections) {
            const lm = facingMode === "user"
              ? mirrorLandmarks(d.landmarks, video.videoWidth || canvas.width / sx, sx, sy)
              : scaleLandmarks(d.landmarks, sx, sy);
            filter.draw(ctx, lm, { sx: 1, sy: 1 });
          }
        }
      }

      if (loopGenRef.current === gen) {
        animFrameRef.current = requestAnimationFrame(run);
      }
    };
    animFrameRef.current = requestAnimationFrame(run);
    return () => { loopGenRef.current += 1; cancelAnimationFrame(animFrameRef.current); };
  }, [modelsLoaded, captured, activeFilter, facingMode]);

  // ── AR canvas size ────────────────────────────────────────────────────────

  useEffect(() => {
    const c = containerRef.current;
    const canvas = arCanvasRef.current;
    if (!c || !canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width  = c.clientWidth;
      canvas.height = c.clientHeight;
      const dc = drawCanvasRef.current;
      if (dc) { dc.width = c.clientWidth; dc.height = c.clientHeight; }
    });
    obs.observe(c);
    return () => obs.disconnect();
  }, []);

  // ── Capture ───────────────────────────────────────────────────────────────

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 200);

    const video = videoRef.current;
    const w = video.videoWidth  || 1280;
    const h = video.videoHeight || 720;

    // Composite: video + AR overlay
    const base = document.createElement("canvas");
    base.width = w; base.height = h;
    const bctx = base.getContext("2d")!;

    if (facingMode === "user") { bctx.translate(w, 0); bctx.scale(-1, 1); }
    bctx.drawImage(video, 0, 0, w, h);
    if (facingMode === "user") bctx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw AR layer at native video resolution
    const arCanvas = arCanvasRef.current;
    if (arCanvas && AR_FILTERS[activeFilter].id !== "none") {
      bctx.drawImage(arCanvas, 0, 0, w, h);
    }

    cancelAnimationFrame(animFrameRef.current);
    setCaptured(base.toDataURL("image/jpeg", 0.92));
    setTool("none");
  };

  // ── Video recording ──────────────────────────────────────────────────────

  const startVideoRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
    try {
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      videoChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setCapturedVideo({ blob, url });
        setRecording(false);
        setRecordProgress(0);
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordProgress(0);
      let elapsed = 0;
      recordTimerRef.current = setInterval(() => {
        elapsed += 200;
        const pct = Math.min((elapsed / (MAX_RECORD_SECS * 1000)) * 100, 100);
        setRecordProgress(pct);
        if (elapsed >= MAX_RECORD_SECS * 1000) stopVideoRecording();
      }, 200);
    } catch (e) { console.error("MediaRecorder failed", e); }
  };

  const stopVideoRecording = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleShutterDown = () => {
    if (!cameraReady || captured || capturedVideo) return;
    shutterHoldRef.current = setTimeout(() => {
      shutterHoldRef.current = null;
      startVideoRecording();
    }, 350);
  };

  const handleShutterUp = () => {
    if (recording) { stopVideoRecording(); return; }
    if (shutterHoldRef.current) {
      clearTimeout(shutterHoldRef.current);
      shutterHoldRef.current = null;
      capturePhoto();
    }
  };

  // ── Album ─────────────────────────────────────────────────────────────────

  const saveToAlbum = () => {
    // Album only supports photos (blob video URLs don't persist across sessions)
    if (!captured) return;
    const thumb = document.createElement("canvas");
    thumb.width = 320; thumb.height = 240;
    const tctx = thumb.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      tctx.drawImage(img, 0, 0, 320, 240);
      const dataUrl = thumb.toDataURL("image/jpeg", 0.6);
      const item: AlbumItem = { id: crypto.randomUUID(), dataUrl, mediaType: "image", timestamp: new Date().toISOString() };
      const updated = [item, ...albumItems].slice(0, 200);
      try {
        localStorage.setItem(ALBUM_KEY, JSON.stringify(updated));
        setAlbumItems(updated);
        setSavedToAlbum(true);
        setTimeout(() => setSavedToAlbum(false), 2000);
      } catch {
        // localStorage full — trim oldest and retry
        const trimmed = updated.slice(0, 50);
        localStorage.setItem(ALBUM_KEY, JSON.stringify(trimmed));
        setAlbumItems(trimmed);
        setSavedToAlbum(true);
        setTimeout(() => setSavedToAlbum(false), 2000);
      }
    };
    img.src = captured;
  };

  const deleteFromAlbum = (id: string) => {
    const updated = albumItems.filter(a => a.id !== id);
    localStorage.setItem(ALBUM_KEY, JSON.stringify(updated));
    setAlbumItems(updated);
    if (albumSelected?.id === id) setAlbumSelected(null);
  };

  // ── Save as Post / Reel ───────────────────────────────────────────────────

  const saveAsPost = async () => {
    if (!captured) return;
    setSavingPost(true);
    try {
      const b64 = captured.split(",")[1];
      const { url } = await apiRequest("posts/upload", { method: "POST", body: JSON.stringify({ data: b64, mimeType: "image/jpeg" }) });
      await apiRequest("posts", { method: "POST", body: JSON.stringify({ mediaUrl: url, mediaType: "image" }) });
      setSavedAsPost(true);
      setTimeout(() => setSavedAsPost(false), 2500);
    } catch (e) { console.error("Save post failed", e); }
    setSavingPost(false);
  };

  const saveAsReel = async () => {
    if (!capturedVideo) return;
    setSavingReel(true);
    try {
      const reader = new FileReader();
      const b64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(capturedVideo.blob);
      });
      const { url } = await apiRequest("posts/upload", { method: "POST", body: JSON.stringify({ data: b64, mimeType: "video/webm" }) });
      await apiRequest("posts", { method: "POST", body: JSON.stringify({ mediaUrl: url, mediaType: "video" }) });
      setSavedAsReel(true);
      setTimeout(() => setSavedAsReel(false), 2500);
    } catch (e) { console.error("Save reel failed", e); }
    setSavingReel(false);
  };

  // ── Download to device ───────────────────────────────────────────────────

  const downloadSnap = () => {
    const a = document.createElement("a");
    if (capturedVideo) {
      a.href = capturedVideo.url;
      a.download = `pixlr-snap-${Date.now()}.webm`;
    } else if (captured) {
      a.href = captured;
      a.download = `pixlr-snap-${Date.now()}.jpg`;
    } else {
      return;
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const discardPhoto = () => {
    setCaptured(null);
    setCapturedVideo(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setTextOverlays([]);
    setPostFilter("none");
    setSavedToAlbum(false);
    setSavedAsPost(false);
    setSavedAsReel(false);
    clearDraw();
  };

  // ── Drawing ───────────────────────────────────────────────────────────────

  const clearDraw = () => {
    const c = drawCanvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  };

  const onDrawStart = (e: React.PointerEvent) => {
    if (!drawMode) return;
    e.preventDefault();
    drawCanvasRef.current?.setPointerCapture(e.pointerId);
    const rect = drawCanvasRef.current!.getBoundingClientRect();
    lastDraw.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDrawing(true);
  };

  const onDrawMove = (e: React.PointerEvent) => {
    if (!drawMode || !isDrawing || !lastDraw.current) return;
    const ctx = drawCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rect = drawCanvasRef.current!.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    ctx.beginPath();
    ctx.moveTo(lastDraw.current.x, lastDraw.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.stroke();
    lastDraw.current = p;
  };

  const onDrawEnd = () => { setIsDrawing(false); lastDraw.current = null; };

  // ── Text overlays ─────────────────────────────────────────────────────────

  const addText = () => {
    if (!textInput.trim()) return;
    const c = containerRef.current;
    if (!c) return;
    setTextOverlays(prev => [...prev, {
      id: `${Date.now()}`, text: textInput, color: textColor,
      x: c.clientWidth / 2, y: c.clientHeight / 2, size: 28,
    }]);
    setTextInput("");
    setTool("none");
  };

  const onTextPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ov = textOverlays.find(t => t.id === id)!;
    dragTxtRef.current = { id, ox: ov.x, oy: ov.y, mx: e.clientX, my: e.clientY };
  };

  const onContainerPointerMove = (e: React.PointerEvent) => {
    const d = dragTxtRef.current;
    if (!d) return;
    setTextOverlays(prev => prev.map(t => t.id === d.id
      ? { ...t, x: d.ox + (e.clientX - d.mx), y: d.oy + (e.clientY - d.my) }
      : t
    ));
  };

  const onContainerPointerUp = () => { dragTxtRef.current = null; };

  // ── Music ─────────────────────────────────────────────────────────────────

  const selectTrack = (track: typeof TRACKS[0]) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (activeTrack?.id === track.id && trackPlaying) {
      setTrackPlaying(false);
      setActiveTrack(null);
      return;
    }
    const audio = new Audio(track.url);
    audio.loop = true;
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audioRef.current = audio;
    setActiveTrack(track);
    setTrackPlaying(true);
    setShowMusic(false);
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // ── Send ──────────────────────────────────────────────────────────────────

  const openSend = async () => {
    setShowSend(true);
    try {
      const data = await apiRequest("conversations");
      setConversations(data);
    } catch {}
  };

  const toggleConv = (id: string) => {
    setSelectedConvs(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const sendSnap = async () => {
    if ((!captured && !capturedVideo) || selectedConvs.length === 0) return;
    setSending(true);
    try {
      let mediaUrl: string;
      let mediaType: string;

      if (capturedVideo) {
        const reader = new FileReader();
        const b64 = await new Promise<string>((res, rej) => {
          reader.onload = () => res((reader.result as string).split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(capturedVideo.blob);
        });
        const result = await apiRequest("messages/upload", { method: "POST", body: JSON.stringify({ data: b64, mimeType: "video/webm" }) });
        mediaUrl = result.url;
        mediaType = "video";
      } else {
        const b64 = captured!.split(",")[1];
        const result = await apiRequest("messages/upload", { method: "POST", body: JSON.stringify({ data: b64, mimeType: "image/jpeg" }) });
        mediaUrl = result.url;
        mediaType = "image";
      }

      const snapPayload: any = {
        mediaUrl,
        mediaType,
        isSnap: true,
        text: activeTrack ? `🎵 ${activeTrack.title} — ${activeTrack.artist}` : undefined,
      };
      if (viewLimit !== null) {
        snapPayload.maxViews = viewLimit;
        snapPayload.viewOnce = viewLimit === 1;
      }

      await Promise.all(selectedConvs.map(convId =>
        apiRequest(`conversations/${convId}/messages`, { method: "POST", body: JSON.stringify(snapPayload) })
      ));

      setSendDone(true);
      setTimeout(() => navigate("/messages"), 1500);
    } catch (e) {
      console.error("Send failed", e);
    } finally {
      setSending(false);
    }
  };

  // ── CSS filters (post-capture) ────────────────────────────────────────────

  const CSS_FILTERS: {id:string;label:string;css:string}[] = [
    { id: "none",    label: "Natural",  css: "none" },
    { id: "vivid",   label: "Vivid",    css: "saturate(2) contrast(1.2)" },
    { id: "noir",    label: "Noir",     css: "grayscale(1) contrast(1.4)" },
    { id: "warm",    label: "Warm",     css: "sepia(0.4) hue-rotate(-15deg) saturate(1.4)" },
    { id: "cool",    label: "Cool",     css: "hue-rotate(25deg) saturate(1.3)" },
    { id: "dreamy",  label: "Dreamy",   css: "brightness(1.15) saturate(0.75) blur(0.4px)" },
  ];
  const filterCss = CSS_FILTERS.find(f => f.id === postFilter)?.css ?? "none";

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-[#0c0c0c] text-[#eceae4] z-50 flex flex-col select-none overflow-hidden font-['Plus_Jakarta_Sans']">
      {/* Film grain + light-leak atmosphere */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pixlr-grain {
          position: fixed; inset: 0; pointer-events: none; z-index: 90; opacity: 0.28; mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .pixlr-light-leak {
          position: absolute; inset: -50%; width: 200%; height: 200%; pointer-events: none; z-index: 1;
          background: radial-gradient(circle at 72% 28%, rgba(217,90,43,0.16) 0%, transparent 42%),
                      radial-gradient(circle at 25% 82%, rgba(140,42,28,0.12) 0%, transparent 52%);
          mix-blend-mode: screen;
          animation: pixlr-drift 22s infinite alternate ease-in-out;
        }
        @keyframes pixlr-drift {
          0% { transform: translate(0,0) scale(1); }
          100% { transform: translate(-4%,4%) scale(1.06); }
        }
        @keyframes pixlr-shutter-flash {
          0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; }
        }
      `}} />
      <div className="pixlr-grain" />

      {/* Flash */}
      {flashActive && (
        <div className="absolute inset-0 bg-white z-[100] pointer-events-none" style={{ animation: "pixlr-shutter-flash 0.4s ease-out forwards" }} />
      )}

      {/* ── Main camera / capture area ──────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onPointerMove={onContainerPointerMove}
        onPointerUp={onContainerPointerUp}
      >
        {!captured && <div className="pixlr-light-leak" />}
        {/* Rule-of-thirds composition grid */}
        {showGrid && !captured && !capturedVideo && (
          <div className="absolute inset-0 z-[5] pointer-events-none grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/15" />
            ))}
          </div>
        )}
        {/* Video */}
        {!captured && (
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
          />
        )}

        {/* Captured photo */}
        {captured && (
          <img
            src={captured} alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: filterCss }}
          />
        )}

        {/* Captured video preview */}
        {capturedVideo && !captured && (
          <video
            src={capturedVideo.url}
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* AR overlay canvas (live camera) */}
        {!captured && !capturedVideo && (
          <canvas
            ref={arCanvasRef}
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
          />
        )}

        {/* Drawing canvas (post-capture) */}
        {captured && (
          <canvas
            ref={drawCanvasRef}
            className="absolute inset-0 w-full h-full z-10"
            style={{ touchAction: "none", cursor: drawMode ? "crosshair" : "default" }}
            onPointerDown={onDrawStart}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawEnd}
          />
        )}

        {/* Text overlays (post-capture) */}
        {textOverlays.map(ov => (
          <div
            key={ov.id}
            className="absolute z-20 touch-none cursor-grab"
            style={{ left: ov.x, top: ov.y, transform: "translate(-50%,-50%)" }}
            onPointerDown={e => onTextPointerDown(e, ov.id)}
          >
            <span style={{
              fontSize: ov.size,
              color: ov.color,
              fontWeight: "bold",
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap",
            }}>{ov.text}</span>
          </div>
        ))}

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 pb-2 z-30">
          {/* Back */}
          <Link href="/">
            <button className="w-10 h-10 bg-black/45 backdrop-blur ring-1 ring-white/10 rounded-full flex items-center justify-center active:scale-90 transition-transform">
              <ArrowLeft className="w-5 h-5 text-[#eceae4]" />
            </button>
          </Link>

          {!captured && !capturedVideo && (
            <span className="font-['Playfair_Display'] italic text-xl tracking-tight text-[#eceae4]/90 drop-shadow-md pointer-events-none">
              Pixlr
            </span>
          )}

          {/* Music badge */}
          {activeTrack && (
            <button
              onClick={() => setShowMusic(true)}
              className="flex items-center gap-1.5 bg-black/50 backdrop-blur ring-1 ring-[#d95a2b]/40 rounded-full px-3 py-1.5"
            >
              <Music className="w-3.5 h-3.5 text-[#d95a2b]" />
              <span className="text-[#eceae4] text-xs font-medium">{activeTrack.title}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            {/* Composition grid toggle (live only) */}
            {!captured && !capturedVideo && (
              <button
                className={cn(
                  "w-10 h-10 backdrop-blur ring-1 rounded-full flex items-center justify-center active:scale-90 transition-transform",
                  showGrid ? "bg-[#d95a2b]/25 ring-[#d95a2b]/50" : "bg-black/45 ring-white/10"
                )}
                onClick={() => setShowGrid(g => !g)}
                aria-label="Toggle composition grid"
              >
                <SlidersHorizontal className={cn("w-5 h-5 rotate-90", showGrid ? "text-[#d95a2b]" : "text-[#eceae4]")} />
              </button>
            )}

            {/* Music toggle (live only) */}
            {!captured && (
              <button
                className="w-10 h-10 bg-black/45 backdrop-blur ring-1 ring-white/10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                onClick={() => setShowMusic(s => !s)}
              >
                <Music className={cn("w-5 h-5", activeTrack ? "text-[#d95a2b]" : "text-[#eceae4]")} />
              </button>
            )}

            {/* Discard / done */}
            {captured && (
              <button
                className="w-10 h-10 bg-black/45 backdrop-blur ring-1 ring-white/10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                onClick={discardPhoto}
              >
                <RotateCcw className="w-5 h-5 text-[#eceae4]" />
              </button>
            )}
          </div>
        </div>

        {/* ── Post-capture tool strip (left side) ──────────────────────── */}
        {captured && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
            {[
              { id: "text",   icon: Type,              label: "Text" },
              { id: "sticker",icon: Smile,             label: "Sticker" },
              { id: "filter", icon: SlidersHorizontal, label: "Filter" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTool(prev => prev === t.id ? "none" : t.id as any)}
                aria-label={t.label}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur ring-1 transition-all active:scale-90",
                  tool === t.id ? "bg-[#eceae4] text-[#0c0c0c] ring-[#eceae4]" : "bg-black/50 text-[#eceae4] ring-white/10"
                )}
              >
                <t.icon className="w-5 h-5" />
              </button>
            ))}
            <button
              onClick={() => setDrawMode(d => !d)}
              aria-label="Draw"
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur ring-1 transition-all active:scale-90",
                drawMode ? "bg-[#eceae4] text-[#0c0c0c] ring-[#eceae4]" : "bg-black/50 text-[#eceae4] ring-white/10"
              )}
            >
              <Pen className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Deselect tap */}
        <div className="absolute inset-0 z-0" onClick={() => { setTool("none"); setDrawMode(false); }} />
      </div>

      {/* ── Tool panels ──────────────────────────────────────────────────── */}

      {/* Music picker */}
      {showMusic && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end" onClick={() => setShowMusic(false)}>
          <div className="w-full bg-[#161311] ring-1 ring-white/10 rounded-t-3xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-['Playfair_Display'] italic text-[#eceae4] text-lg">Soundtrack</span>
              <button onClick={() => setShowMusic(false)}>
                <X className="w-5 h-5 text-[#eceae4]/60" />
              </button>
            </div>
            {activeTrack && (
              <button
                onClick={() => { audioRef.current?.pause(); audioRef.current = null; setActiveTrack(null); setTrackPlaying(false); setShowMusic(false); }}
                className="w-full py-2.5 rounded-xl bg-white/5 text-[#eceae4]/60 text-sm"
              >
                Turn off music
              </button>
            )}
            {TRACKS.map(t => (
              <button
                key={t.id}
                onClick={() => selectTrack(t)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                  activeTrack?.id === t.id ? "bg-[#d95a2b]/15 ring-1 ring-[#d95a2b]/50" : "bg-white/5"
                )}
              >
                <div className="w-9 h-9 rounded-full bg-[#d95a2b]/20 flex items-center justify-center">
                  <Music className="w-4 h-4 text-[#d95a2b]" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-[#eceae4] font-semibold text-sm">{t.title}</p>
                  <p className="text-[#eceae4]/50 text-xs">{t.artist}</p>
                </div>
                {activeTrack?.id === t.id && (
                  <div className="flex gap-0.5 items-end h-5">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-1 bg-[#d95a2b] rounded-full animate-bounce" style={{ height: `${i * 6}px`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Text tool panel */}
      {tool === "text" && captured && (
        <div className="bg-[#161311] ring-1 ring-white/10 px-4 py-3 z-40 space-y-2">
          <div className="flex gap-2">
            {TEXT_COLORS.map(c => (
              <button
                key={c}
                className={cn("w-7 h-7 rounded-full border-2 transition-transform", textColor === c ? "border-[#eceae4] scale-125" : "border-transparent")}
                style={{ background: c }}
                onClick={() => setTextColor(c)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-[#eceae4] placeholder-[#eceae4]/40 outline-none text-sm"
              placeholder="Add a caption..."
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addText()}
              autoFocus
            />
            <button onClick={addText} className="w-10 h-10 bg-[#d95a2b] rounded-xl flex items-center justify-center active:scale-90 transition-transform">
              <Check className="w-5 h-5 text-[#0c0c0c]" />
            </button>
          </div>
        </div>
      )}

      {/* Sticker panel */}
      {tool === "sticker" && captured && (
        <div className="bg-[#161311] ring-1 ring-white/10 px-4 py-3 z-40">
          <div className="grid grid-cols-8 gap-1">
            {STICKERS.map(em => (
              <button
                key={em}
                className="text-3xl h-10 flex items-center justify-center hover:scale-125 active:scale-90 transition-transform"
                onClick={() => {
                  const c = containerRef.current!;
                  setTextOverlays(prev => [...prev, {
                    id: `${Date.now()}`, text: em, color: "#fff",
                    x: c.clientWidth / 2, y: c.clientHeight / 2, size: 48,
                  }]);
                  setTool("none");
                }}
              >{em}</button>
            ))}
          </div>
        </div>
      )}

      {/* Filter panel */}
      {tool === "filter" && captured && (
        <div className="bg-[#161311] ring-1 ring-white/10 z-40">
          <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
            {CSS_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setPostFilter(f.id)}
                className="flex-shrink-0 flex flex-col items-center gap-1"
              >
                <div className={cn("w-14 h-14 rounded-xl overflow-hidden border-2 transition-colors", postFilter === f.id ? "border-[#d95a2b]" : "border-transparent")}>
                  <img src={captured} className="w-full h-full object-cover" style={{ filter: f.css }} />
                </div>
                <span className="text-[#eceae4] text-[10px]">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Draw color picker */}
      {drawMode && captured && (
        <div className="bg-[#161311] ring-1 ring-white/10 px-4 py-3 z-40 flex items-center gap-3">
          <span className="text-[#eceae4]/60 text-xs">Draw</span>
          {["#d95a2b","#FFCC00","#34C759","#007AFF","#AF52DE","#eceae4","#000000"].map(c => (
            <button
              key={c}
              className={cn("w-7 h-7 rounded-full border-2 transition-transform", drawColor === c ? "border-[#eceae4] scale-125" : "border-transparent")}
              style={{ background: c }}
              onClick={() => setDrawColor(c)}
            />
          ))}
          <button onClick={clearDraw} className="ml-auto text-[#d95a2b] text-xs">Clear</button>
        </div>
      )}

      {/* ── AR filter strip + bottom controls ──────────────────────────── */}
      {!captured && (
        <>
          {/* AR filter strip */}
          <div className="bg-transparent absolute bottom-28 left-0 right-0 z-30">
            <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1">
              {AR_FILTERS.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(i)}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center gap-1 transition-transform",
                    activeFilter === i ? "scale-110" : "opacity-70"
                  )}
                >
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center text-2xl backdrop-blur transition-all",
                    "bg-black/50",
                    activeFilter === i ? "ring-2 ring-[#d95a2b]" : "ring-1 ring-white/15"
                  )}>
                    {f.emoji}
                  </div>
                  <span className="text-[#eceae4] text-[10px] font-medium">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Capture row */}
          <div className="bg-[#0c0c0c] flex items-center justify-between px-8 py-5 z-30" style={{ paddingBottom: "max(1.25rem,env(safe-area-inset-bottom))" }}>
            {/* Flip camera */}
            <button
              onClick={() => {
                const next = facingMode === "user" ? "environment" : "user";
                setFacingMode(next);
                startCamera(next);
              }}
              className="w-12 h-12 bg-white/10 ring-1 ring-white/10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            >
              <FlipHorizontal2 className="w-6 h-6 text-[#eceae4]" />
            </button>

            {/* Shutter — tap = photo, hold = video */}
            <div className="relative">
              {/* Recording progress ring */}
              {recording && (
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
                  <circle
                    cx="40" cy="40" r="36" fill="none" stroke="#d95a2b" strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 36}`}
                    strokeDashoffset={`${2 * Math.PI * 36 * (1 - recordProgress / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <button
                onPointerDown={handleShutterDown}
                onPointerUp={handleShutterUp}
                onPointerLeave={handleShutterUp}
                onPointerCancel={handleShutterUp}
                disabled={!cameraReady}
                className={cn(
                  "w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all select-none",
                  recording ? "border-[#d95a2b] scale-110" : "border-[#eceae4] active:scale-95"
                )}
              >
                <div className={cn(
                  "rounded-full transition-all",
                  recording ? "w-10 h-10 rounded-lg bg-[#d95a2b]" : "w-16 h-16 bg-[#eceae4]"
                )} />
              </button>
            </div>

            {/* Album thumbnail / Models loading */}
            <div className="w-12 h-12 flex items-center justify-center">
              {!modelsLoaded ? (
                <div className="w-5 h-5 border-2 border-white/40 border-t-[#d95a2b] rounded-full animate-spin" />
              ) : albumItems.length > 0 ? (
                <button
                  onClick={() => setShowAlbum(true)}
                  className="w-12 h-12 rounded-xl overflow-hidden ring-1 ring-white/20 active:scale-90 transition-transform"
                >
                  <img src={albumItems[0].dataUrl} alt="Roll" className="w-full h-full object-cover" />
                </button>
              ) : (
                <button onClick={() => setShowAlbum(true)} className="w-12 h-12 bg-white/10 ring-1 ring-white/10 rounded-xl flex items-center justify-center active:scale-90 transition-transform">
                  <BookImage className="w-6 h-6 text-[#eceae4]/60" />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Post-capture: send/save bar ──────────────────────────────────── */}
      {(captured || capturedVideo) && tool === "none" && !drawMode && (
        <div className="bg-[#0c0c0c] z-40" style={{ paddingBottom: "max(1rem,env(safe-area-inset-bottom))" }}>

          {/* Recording indicator */}
          {recording && (
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="w-3 h-3 rounded-full bg-[#d95a2b] animate-pulse" />
              <span className="text-[#eceae4] text-sm font-medium">Recording — {Math.round((recordProgress / 100) * MAX_RECORD_SECS)}s</span>
            </div>
          )}

          {/* Quick action row */}
          <div className="flex items-center justify-center gap-4 px-4 pt-3 pb-2">
            {/* Save to Album */}
            <button
              onClick={saveToAlbum}
              className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
            >
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all ring-1",
                savedToAlbum ? "bg-[#4f7d5a] ring-[#4f7d5a]" : "bg-white/10 ring-white/10"
              )}>
                {savedToAlbum ? <Check className="w-5 h-5 text-[#eceae4]" /> : <BookImage className="w-5 h-5 text-[#eceae4]" />}
              </div>
              <span className="text-[#eceae4]/70 text-[10px]">{savedToAlbum ? "Saved" : "My Roll"}</span>
            </button>

            {/* Save as Post (photo only) */}
            {captured && !capturedVideo && (
              <button
                onClick={saveAsPost}
                disabled={savingPost}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all ring-1",
                  savedAsPost ? "bg-[#4f7d5a] ring-[#4f7d5a]" : "bg-white/10 ring-white/10"
                )}>
                  {savingPost ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-[#eceae4] rounded-full animate-spin" />
                  ) : savedAsPost ? <Check className="w-5 h-5 text-[#eceae4]" /> : <ImagePlus className="w-5 h-5 text-[#eceae4]" />}
                </div>
                <span className="text-[#eceae4]/70 text-[10px]">{savedAsPost ? "Published" : "Publish"}</span>
              </button>
            )}

            {/* Save as Reel (video only) */}
            {capturedVideo && (
              <button
                onClick={saveAsReel}
                disabled={savingReel}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all ring-1",
                  savedAsReel ? "bg-[#4f7d5a] ring-[#4f7d5a]" : "bg-white/10 ring-white/10"
                )}>
                  {savingReel ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-[#eceae4] rounded-full animate-spin" />
                  ) : savedAsReel ? <Check className="w-5 h-5 text-[#eceae4]" /> : <Video className="w-5 h-5 text-[#eceae4]" />}
                </div>
                <span className="text-[#eceae4]/70 text-[10px]">{savedAsReel ? "Published" : "Publish Reel"}</span>
              </button>
            )}

            {/* Download to device */}
            <button
              onClick={downloadSnap}
              className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 ring-1 ring-white/10">
                <Download className="w-5 h-5 text-[#eceae4]" />
              </div>
              <span className="text-[#eceae4]/70 text-[10px]">Download</span>
            </button>
          </div>

          {/* Main bar */}
          <div className="flex items-center justify-between px-6 py-3">
            <button onClick={discardPhoto} className="text-[#eceae4]/70 text-sm flex items-center gap-1">
              <X className="w-4 h-4" /> Discard
            </button>
            <button
              onClick={openSend}
              className="flex items-center gap-2 bg-[#d95a2b] text-[#0c0c0c] font-semibold px-6 py-3 rounded-full text-sm active:scale-95 transition-transform"
            >
              <Send className="w-4 h-4" />
              Send Snap
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Send panel ───────────────────────────────────────────────────── */}
      {showSend && (
        <div className="absolute inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end">
          <div className="w-full bg-[#161311] ring-1 ring-white/10 rounded-t-3xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
              <button onClick={() => setShowSend(false)}>
                <ArrowLeft className="w-5 h-5 text-[#eceae4]" />
              </button>
              <span className="font-['Playfair_Display'] italic text-[#eceae4] text-lg">Send Snap</span>
              <button
                onClick={sendSnap}
                disabled={selectedConvs.length === 0 || sending}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                  selectedConvs.length > 0 ? "bg-[#d95a2b] text-[#0c0c0c]" : "bg-white/10 text-[#eceae4]/40"
                )}
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : sendDone ? (
                  <><Check className="w-4 h-4" /> Sent</>
                ) : (
                  <><Send className="w-4 h-4" /> Send {selectedConvs.length > 0 ? `(${selectedConvs.length})` : ""}</>
                )}
              </button>
            </div>

            {/* View limit picker */}
            <div className="px-5 py-3 border-b border-white/10">
              <p className="text-[#eceae4]/50 text-[11px] font-semibold uppercase tracking-wide mb-2">Times it can be opened</p>
              <div className="flex gap-2">
                {([
                  { label: "Once", value: 1 },
                  { label: "Twice", value: 2 },
                  { label: "3 times", value: 3 },
                  { label: "Unlimited", value: null },
                ] as { label: string; value: 1 | 2 | 3 | null }[]).map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setViewLimit(opt.value)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-semibold transition-all",
                      viewLimit === opt.value ? "bg-[#d95a2b] text-[#0c0c0c]" : "bg-white/10 text-[#eceae4]/70 hover:bg-white/15"
                    )}
                  >
                    <span className="leading-none">{opt.value === null ? <Infinity className="w-4 h-4" /> : opt.value}</span>
                    <span className="text-[10px] leading-tight text-center">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Friends list */}
            <div className="flex-1 overflow-y-auto py-2">
              {conversations.length === 0 ? (
                <div className="text-center text-[#eceae4]/40 py-10 text-sm">No conversations yet</div>
              ) : (
                conversations.map((conv: any) => (
                  <button
                    key={conv.id}
                    onClick={() => toggleConv(conv.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors"
                  >
                    <div className="relative">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={conv.otherUser?.profilePicture} />
                        <AvatarFallback className="bg-white/10 text-[#eceae4]">
                          {conv.otherUser?.username?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {selectedConvs.includes(conv.id) && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#d95a2b] rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-[#0c0c0c]" />
                        </div>
                      )}
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-[#eceae4] font-semibold text-sm">{conv.otherUser?.username}</p>
                      <p className="text-[#eceae4]/40 text-xs">{conv.otherUser?.fullName}</p>
                    </div>
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      selectedConvs.includes(conv.id) ? "border-[#d95a2b] bg-[#d95a2b]" : "border-white/30"
                    )}>
                      {selectedConvs.includes(conv.id) && <Check className="w-3.5 h-3.5 text-[#0c0c0c]" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Pixlr Roll Modal ─────────────────────────────────────────────── */}
      {showAlbum && (
        <div className="absolute inset-0 z-[70] bg-[#0c0c0c] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
            <button onClick={() => { setShowAlbum(false); setAlbumSelected(null); }}>
              <ArrowLeft className="w-5 h-5 text-[#eceae4]" />
            </button>
            <span className="font-['Playfair_Display'] italic text-[#eceae4] text-lg">My Roll</span>
            <span className="text-[#eceae4]/40 text-sm">{albumItems.length}</span>
          </div>

          {albumSelected ? (
            // Full-screen selected item
            <div className="flex-1 relative flex flex-col">
              <div className="flex-1 flex items-center justify-center bg-[#0c0c0c]">
                {albumSelected.mediaType === "video" ? (
                  <img src={albumSelected.dataUrl} alt="thumb" className="max-w-full max-h-full object-contain" />
                ) : (
                  <img src={albumSelected.dataUrl} alt="snap" className="max-w-full max-h-full object-contain" />
                )}
                {albumSelected.mediaType === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
                      <Play className="w-8 h-8 text-[#eceae4]" />
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-[#161311] ring-1 ring-white/10 px-5 py-4 flex items-center justify-between">
                <button
                  onClick={() => setAlbumSelected(null)}
                  className="text-[#eceae4]/70 text-sm"
                >
                  Back
                </button>
                <span className="text-[#eceae4]/40 text-xs">
                  {new Date(albumSelected.timestamp).toLocaleDateString("en-US")}
                </span>
                <button
                  onClick={() => deleteFromAlbum(albumSelected.id)}
                  className="text-[#d95a2b] flex items-center gap-1 text-sm"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          ) : albumItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#eceae4]/40">
              <BookImage className="w-16 h-16 opacity-30" />
              <p className="font-['Playfair_Display'] italic text-lg">Your roll is empty</p>
              <p className="text-sm">Take a snap and tap "My Roll" to keep it here</p>
            </div>
          ) : (
            // Grid view
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 gap-0.5 p-0.5">
                {albumItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setAlbumSelected(item)}
                    className="aspect-square relative overflow-hidden bg-white/5"
                  >
                    <img src={item.dataUrl} alt="snap" className="w-full h-full object-cover" />
                    {item.mediaType === "video" && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                        <Play className="w-2.5 h-2.5 text-[#eceae4]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function scaleLandmarks(landmarks: faceapi.FaceLandmarks68, sx: number, sy: number): faceapi.FaceLandmarks68 {
  const scaled = landmarks.positions.map(p => new faceapi.Point(p.x * sx, p.y * sy));
  return new faceapi.FaceLandmarks68(scaled, { width: 1, height: 1 });
}

function mirrorLandmarks(landmarks: faceapi.FaceLandmarks68, videoW: number, sx: number, sy: number): faceapi.FaceLandmarks68 {
  // Mirror X around center (video is CSS-mirrored for front camera); scale X and Y independently
  const mirrored = landmarks.positions.map(p =>
    new faceapi.Point((videoW - p.x) * sx, p.y * sy)
  );
  return new faceapi.FaceLandmarks68(mirrored, { width: 1, height: 1 });
}
