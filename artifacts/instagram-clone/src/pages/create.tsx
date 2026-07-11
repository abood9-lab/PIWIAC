import { useState, useRef, useCallback, useEffect } from "react";
import { useUploadPostMedia, useCreatePost, useGenerateCaption } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ImagePlus, X, Sparkles, RefreshCw, ChevronLeft, ChevronRight,
  MapPin, Users, Lock, MessageCircleOff, Info, Check, Upload,
  Image as ImageIcon, Grid3X3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// ─── Filter presets ───────────────────────────────────────────────────────────
const FILTERS = [
  { name: "Normal",    css: "none" },
  { name: "Clarendon", css: "contrast(1.2) saturate(1.35)" },
  { name: "Juno",      css: "saturate(1.4) contrast(1.05) brightness(1.02)" },
  { name: "Lark",      css: "contrast(0.9) brightness(1.1) saturate(1.4)" },
  { name: "Ludwig",    css: "contrast(1.05) brightness(1.05) saturate(1.3)" },
  { name: "Moon",      css: "grayscale(1) contrast(1.1) brightness(1.1)" },
  { name: "Perpetua",  css: "contrast(1.1) brightness(1.05) saturate(1.1)" },
  { name: "Reyes",     css: "sepia(0.4) contrast(0.85) brightness(1.1) saturate(0.75)" },
  { name: "Slumber",   css: "saturate(0.66) brightness(1.05)" },
] as const;

// ─── Aspect ratios ────────────────────────────────────────────────────────────
const RATIOS = [
  { label: "1:1",   icon: "■",  style: { aspectRatio: "1/1" } },
  { label: "4:5",   icon: "▬",  style: { aspectRatio: "4/5" } },
  { label: "16:9",  icon: "▭",  style: { aspectRatio: "16/9" } },
  { label: "Free",  icon: "⊞",  style: { aspectRatio: "auto" } },
] as const;

// ─── Hashtag suggestions ──────────────────────────────────────────────────────
const POPULAR_TAGS = [
  "photography", "photooftheday", "instagood", "travel", "nature",
  "fashion", "food", "art", "lifestyle", "beautiful", "summer",
  "happy", "love", "sunset", "portrait", "street", "minimal",
  "aesthetic", "vibes", "explore",
];

// ─── AI prompts ───────────────────────────────────────────────────────────────
const AI_PROMPTS = [
  { label: "Fun & Engaging",   prompt: "Generate a fun and engaging caption for this photo" },
  { label: "Motivational",     prompt: "Write a motivational and inspiring caption" },
  { label: "Witty",            prompt: "Create a witty and creative caption with a bit of humor" },
  { label: "Heartfelt",        prompt: "Write a heartfelt and sincere caption" },
  { label: "Trendy",           prompt: "Generate a trendy caption with good vibes and emojis" },
  { label: "Minimalist",       prompt: "Write a short, minimal one-liner caption" },
];

type Step = "select" | "edit" | "details";

interface MediaItem {
  file: File;
  preview: string;
  filterIndex: number;
}

export default function Create() {
  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("select");

  // ── Media state ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [ratioIdx, setRatioIdx] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Caption & details state ─────────────────────────────────────────────────
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [altText, setAltText] = useState("");
  const [audience, setAudience] = useState<"everyone" | "close_friends">("everyone");
  const [commentsDisabled, setCommentsDisabled] = useState(false);

  // ── Hashtag autocomplete ────────────────────────────────────────────────────
  const [hashtagQuery, setHashtagQuery] = useState("");
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // ── AI state ────────────────────────────────────────────────────────────────
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const { toast } = useToast();
  const [, setLocation_] = useLocation();

  const uploadMutation = useUploadPostMedia();
  const createMutation = useCreatePost();
  const generateCaptionMutation = useGenerateCaption();

  const isPosting = uploadMutation.isPending || createMutation.isPending;
  const activeItem = items[activeIdx] ?? null;

  // ── File processing ─────────────────────────────────────────────────────────
  const processFiles = useCallback((files: File[]) => {
    const valid = files.filter(f => {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
        toast({ title: `${f.name} skipped`, description: "Only images and videos", variant: "destructive" });
        return false;
      }
      if (f.size > 50 * 1024 * 1024) {
        toast({ title: `${f.name} too large`, description: "Max 50 MB per file", variant: "destructive" });
        return false;
      }
      return true;
    });

    const remaining = 10 - items.length;
    const toAdd = valid.slice(0, remaining);
    if (valid.length > remaining) toast({ title: `Max 10 files`, description: `Added ${toAdd.length} of ${valid.length} files` });

    toAdd.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setItems(prev => [...prev, { file, preview: reader.result as string, filterIndex: 0 }]);
      };
      reader.readAsDataURL(file);
    });

    if (toAdd.length > 0 && step === "select") setStep("edit");
  }, [items.length, step, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) processFiles(files);
    e.target.value = "";
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  // ── Filter assignment ────────────────────────────────────────────────────────
  const setFilter = (filterIdx: number) => {
    setItems(prev => prev.map((item, i) => i === activeIdx ? { ...item, filterIndex: filterIdx } : item));
  };

  // ── Remove item ─────────────────────────────────────────────────────────────
  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    setActiveIdx(Math.min(activeIdx, Math.max(0, next.length - 1)));
    if (next.length === 0) { setStep("select"); setActiveIdx(0); }
  };

  // ── Hashtag autocomplete ────────────────────────────────────────────────────
  useEffect(() => {
    const words = caption.split(/\s/);
    const lastWord = words[words.length - 1];
    if (lastWord?.startsWith("#") && lastWord.length > 1) {
      const q = lastWord.slice(1).toLowerCase();
      setHashtagQuery(q);
      setHashtagSuggestions(POPULAR_TAGS.filter(t => t.startsWith(q) && t !== q).slice(0, 6));
    } else {
      setHashtagQuery("");
      setHashtagSuggestions([]);
    }
  }, [caption]);

  const insertHashtag = (tag: string) => {
    const words = caption.split(/\s/);
    words[words.length - 1] = `#${tag} `;
    setCaption(words.join(" "));
    setHashtagSuggestions([]);
    captionRef.current?.focus();
  };

  // ── AI caption ──────────────────────────────────────────────────────────────
  const handleGenerateCaption = async (promptOverride?: string) => {
    const prompt = promptOverride ?? aiPrompt.trim();
    if (!prompt) { toast({ title: "Enter a prompt first", variant: "destructive" }); return; }
    setAiGenerating(true);
    try {
      const result = await generateCaptionMutation.mutateAsync({ data: { prompt } });
      setCaption(result.caption);
      toast({ title: "Caption generated!" });
    } catch (e: any) {
      toast({ title: "AI Error", description: e?.message ?? "Failed", variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (items.length === 0) return;
    try {
      const uploads = await Promise.all(
        items.map(item =>
          uploadMutation.mutateAsync({ data: { data: item.preview, mimeType: item.file.type } })
        )
      );
      const [first, ...rest] = uploads;
      const mediaType = items[0].file.type.startsWith("video/") ? "video" : "image";

      await createMutation.mutateAsync({
        data: {
          caption: caption || undefined,
          mediaUrl: first.url,
          mediaType,
          audience,
          location: location || undefined,
          altText: altText || undefined,
          commentsDisabled,
          additionalMediaUrls: rest.map(u => u.url),
        } as any,
      });

      toast({ title: "Post shared! 🎉" });
      setLocation_("/");
    } catch (e: any) {
      toast({ title: "Failed to share", description: e.message, variant: "destructive" });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center gap-1 text-xs font-medium">
      {(["select", "edit", "details"] as Step[]).map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span
            className={cn(
              "px-2 py-0.5 rounded-full transition-colors",
              step === s ? "bg-primary text-primary-foreground" :
              (step === "details" || (step === "edit" && s === "select")) ? "text-muted-foreground line-through" :
              "text-muted-foreground"
            )}
          >
            {s === "select" ? "Select" : s === "edit" ? "Edit" : "Details"}
          </span>
        </span>
      ))}
    </div>
  );

  // ── STEP 1: SELECT ─────────────────────────────────────────────────────────
  if (step === "select") {
    return (
      <div className="max-w-xl mx-auto pt-6 pb-24 md:pb-8 px-4">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h1 className="font-bold text-lg tracking-tight">Create post</h1>
            <StepIndicator />
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              "m-4 border-2 border-dashed rounded-xl transition-all cursor-pointer",
              "flex flex-col items-center justify-center gap-4 py-16 px-8 text-center",
              isDragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/30"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={cn("rounded-2xl p-5 transition-colors", isDragOver ? "bg-primary/10" : "bg-muted")}>
              <Upload className={cn("w-10 h-10 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <p className="font-semibold text-base mb-1">
                {isDragOver ? "Drop to add files" : "Drag & drop photos or videos"}
              </p>
              <p className="text-sm text-muted-foreground">or tap to browse · up to 10 files · 50 MB each</p>
            </div>
            <div className="flex gap-2">
              <Button variant="default" className="rounded-full px-6" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <ImageIcon className="w-4 h-4 mr-2" /> Browse files
              </Button>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> JPG, PNG, WEBP</span>
              <span>·</span>
              <span className="flex items-center gap-1"><Grid3X3 className="w-3 h-3" /> Up to 10 photos</span>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
          />
        </div>
      </div>
    );
  }

  // ── STEP 2: EDIT ──────────────────────────────────────────────────────────
  if (step === "edit") {
    const currentFilter = FILTERS[activeItem?.filterIndex ?? 0];
    const currentRatio = RATIOS[ratioIdx];

    return (
      <div className="max-w-3xl mx-auto pt-4 pb-24 md:pb-8 px-4">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setStep("select")} className="rounded-full">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <StepIndicator />
            <Button className="rounded-full px-5 font-semibold" onClick={() => setStep("details")}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* Main preview */}
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px]">
              {activeItem && (
                <div className="w-full flex items-center justify-center" style={currentRatio.style as any}>
                  {activeItem.file.type.startsWith("video/") ? (
                    <video
                      src={activeItem.preview}
                      className="w-full h-full object-contain"
                      style={{ filter: currentFilter.css }}
                      controls
                    />
                  ) : (
                    <img
                      src={activeItem.preview}
                      className="w-full h-full object-cover"
                      style={{ filter: currentFilter.css }}
                      alt="Preview"
                    />
                  )}
                </div>
              )}

              {/* Navigation arrows */}
              {items.length > 1 && (
                <>
                  {activeIdx > 0 && (
                    <button
                      onClick={() => setActiveIdx(i => i - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full h-9 w-9 flex items-center justify-center transition-colors z-10"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  {activeIdx < items.length - 1 && (
                    <button
                      onClick={() => setActiveIdx(i => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full h-9 w-9 flex items-center justify-center transition-colors z-10"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                  {/* Dot indicators */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {items.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className={cn("w-2 h-2 rounded-full transition-all", i === activeIdx ? "bg-white scale-125" : "bg-white/50")}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Add more button */}
              {items.length < 10 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full h-9 w-9 flex items-center justify-center transition-colors text-xl font-light z-10"
                  title="Add more"
                >
                  +
                </button>
              )}
            </div>

            {/* Right panel: filters + ratio */}
            <div className="lg:w-64 border-t lg:border-t-0 lg:border-l border-border flex flex-col">
              {/* Aspect ratio selector */}
              <div className="px-4 pt-3 pb-2 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Aspect Ratio</p>
                <div className="flex gap-1.5">
                  {RATIOS.map((r, i) => (
                    <button
                      key={r.label}
                      onClick={() => setRatioIdx(i)}
                      className={cn(
                        "flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all",
                        ratioIdx === i ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                      )}
                    >
                      <span className="text-base block">{r.icon}</span>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters */}
              <div className="px-4 pt-3 pb-2 flex-1 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Filter</p>
                <div className="grid grid-cols-3 gap-2">
                  {FILTERS.map((f, i) => (
                    <button
                      key={f.name}
                      onClick={() => setFilter(i)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl p-1.5 border-2 transition-all",
                        (activeItem?.filterIndex ?? 0) === i
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-transparent hover:border-border"
                      )}
                    >
                      {activeItem && (
                        <div className="w-full aspect-square rounded-lg overflow-hidden">
                          <img
                            src={activeItem.preview}
                            className="w-full h-full object-cover"
                            style={{ filter: f.css }}
                            alt={f.name}
                          />
                        </div>
                      )}
                      <span className="text-[10px] font-medium leading-none">{f.name}</span>
                      {(activeItem?.filterIndex ?? 0) === i && (
                        <Check className="h-3 w-3 text-primary -mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Thumbnail strip */}
          {items.length > 1 && (
            <div className="border-t border-border p-3 flex gap-2 overflow-x-auto">
              {items.map((item, i) => (
                <div key={i} className="relative flex-shrink-0 group">
                  <button onClick={() => setActiveIdx(i)}>
                    <img
                      src={item.preview}
                      className={cn(
                        "w-14 h-14 object-cover rounded-lg border-2 transition-all",
                        i === activeIdx ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                      )}
                      style={{ filter: FILTERS[item.filterIndex].css }}
                      alt={`Photo ${i + 1}`}
                    />
                  </button>
                  <button
                    onClick={() => removeItem(i)}
                    className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {items.length < 10 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-border hover:border-primary flex items-center justify-center transition-colors text-muted-foreground hover:text-primary"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>

        <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" multiple onChange={handleFileSelect} />
      </div>
    );
  }

  // ── STEP 3: DETAILS ──────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto pt-4 pb-24 md:pb-8 px-4">
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <Button variant="ghost" size="sm" onClick={() => setStep("edit")} className="rounded-full">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <StepIndicator />
          <Button
            onClick={handleSubmit}
            disabled={isPosting}
            className="rounded-full px-5 font-semibold"
          >
            {isPosting ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {uploadMutation.isPending ? "Uploading..." : "Sharing..."}
              </span>
            ) : "Share"}
          </Button>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Left: preview strip */}
          <div className="md:w-52 bg-black flex-shrink-0 flex items-start justify-center p-3 gap-2 flex-wrap md:flex-col md:flex-nowrap md:overflow-y-auto md:max-h-[600px]">
            {items.map((item, i) => (
              <div key={i} className="relative">
                <img
                  src={item.preview}
                  className={cn(
                    "w-20 h-20 md:w-full md:h-28 object-cover rounded-xl",
                    i === 0 ? "ring-2 ring-primary" : ""
                  )}
                  style={{ filter: FILTERS[item.filterIndex].css }}
                  alt={`Photo ${i + 1}`}
                />
                {items.length > 1 && i === 0 && (
                  <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    COVER
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Right: form */}
          <div className="flex-1 border-t md:border-t-0 md:border-l border-border overflow-y-auto">
            {/* Caption */}
            <div className="relative">
              <Textarea
                ref={captionRef}
                placeholder="Write a caption... use # for hashtags"
                className="min-h-[120px] border-none focus-visible:ring-0 resize-none text-sm px-5 py-4 bg-transparent"
                value={caption}
                onChange={e => setCaption(e.target.value)}
              />
              {/* Character count */}
              <div className="px-5 pb-1 text-right text-[11px] text-muted-foreground">
                {caption.length} / 2200
              </div>

              {/* Hashtag autocomplete */}
              {hashtagSuggestions.length > 0 && (
                <div className="absolute bottom-8 left-4 right-4 bg-popover border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs text-muted-foreground font-medium">Hashtag suggestions</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2">
                    {hashtagSuggestions.map(tag => (
                      <button
                        key={tag}
                        onClick={() => insertHashtag(tag)}
                        className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Caption */}
            <div className="border-t border-border">
              <button
                onClick={() => setShowAI(!showAI)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <div className="bg-gradient-to-r from-violet-500 to-pink-500 rounded-lg p-1">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
                    AI Caption Generator
                  </span>
                </div>
                <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showAI && "rotate-90")} />
              </button>

              {showAI && (
                <div className="px-5 pb-5 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {AI_PROMPTS.map(({ label, prompt }) => (
                      <button
                        key={label}
                        onClick={() => handleGenerateCaption(prompt)}
                        disabled={aiGenerating}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border transition-all font-medium",
                          "border-border hover:border-primary hover:text-primary hover:bg-primary/5",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        {aiGenerating ? <RefreshCw className="h-3 w-3 animate-spin inline mr-1" /> : null}
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Or describe your photo for a custom caption..."
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleGenerateCaption()}
                      disabled={aiGenerating}
                      className="text-sm"
                    />
                    <Button
                      onClick={() => handleGenerateCaption()}
                      disabled={!aiPrompt.trim() || aiGenerating}
                      size="sm"
                      className="shrink-0"
                    >
                      {aiGenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Powered by GROQ · llama-3.1-8b</p>
                </div>
              )}
            </div>

            {/* Location */}
            <div className="border-t border-border px-5 py-3">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  placeholder="Add location..."
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="border-none focus-visible:ring-0 bg-transparent px-0 text-sm h-7"
                />
              </div>
            </div>

            {/* Alt text */}
            <div className="border-t border-border px-5 py-3">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">Alt text</p>
                  <Input
                    placeholder="Describe photo for accessibility..."
                    value={altText}
                    onChange={e => setAltText(e.target.value)}
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Helps people with visual impairments</p>
                </div>
              </div>
            </div>

            {/* Audience */}
            <div className="border-t border-border px-5 py-3">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" /> Audience
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAudience("everyone")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                    audience === "everyone" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                  )}
                >
                  <Users className="h-4 w-4" /> Everyone
                </button>
                <button
                  onClick={() => setAudience("close_friends")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                    audience === "close_friends" ? "border-green-500 bg-green-500/10 text-green-600" : "border-border hover:border-green-400/40"
                  )}
                >
                  <Lock className="h-4 w-4" /> Close Friends
                </button>
              </div>
              {audience === "close_friends" && (
                <p className="text-[11px] text-muted-foreground mt-1.5">Only your close friends list will see this</p>
              )}
            </div>

            {/* Disable comments */}
            <div className="border-t border-border px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircleOff className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="disable-comments" className="text-sm font-medium cursor-pointer">
                      Turn off comments
                    </Label>
                    <p className="text-[11px] text-muted-foreground">Nobody can comment on this post</p>
                  </div>
                </div>
                <Switch
                  id="disable-comments"
                  checked={commentsDisabled}
                  onCheckedChange={setCommentsDisabled}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
