import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MoreHorizontal, Volume2, VolumeX, Send, Smile, ChevronLeft, ChevronRight,
  Eye, Trash2, Share2, BookmarkPlus, Music, Heart, Flame, Star, MapPin, Hash, AtSign, HelpCircle, BarChart2
} from "lucide-react";
import { useViewStory, useReactToStory, useDeleteStory, useCreatePost, useCreateConversation, useSendMessage } from "@workspace/api-client-react";
import type { UserStories, UserSummary, StorySticker } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { CreateHighlightModal } from "@/components/CreateHighlightModal";
import { cn } from "@/lib/utils";

interface StoryViewerProps {
  userStories: UserStories[];
  initialUserIndex: number;
  onClose: () => void;
}

const STORY_DURATION = 5000;

const QUICK_REACTIONS = [
  { emoji: "❤️", icon: Heart },
  { emoji: "🔥", icon: Flame },
  { emoji: "😍", icon: Star },
  { emoji: "👏", icon: Star },
  { emoji: "😮", icon: Star },
  { emoji: "😂", icon: Star },
];

// Gradient set for text-only stories (no real media)
const VIEWER_GRADIENTS = [
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#a18cd1,#fbc2eb)",
  "linear-gradient(135deg,#ff6a00,#ee0979)",
  "linear-gradient(135deg,#30cfd0,#330867)",
];

const isPlaceholderUrl = (url: string) =>
  url.includes("placehold") || url.includes("placeholder") || url.includes("via.placeholder");

export function StoryViewer({ userStories, initialUserIndex, onClose }: StoryViewerProps) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [userIdx, setUserIdx] = useState(initialUserIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reply, setReply] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);

  // Floating reactions
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const emojiIdRef = useRef(0);

  // Modals
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<UserSummary[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showSharePost, setShowSharePost] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const replyRef = useRef<HTMLInputElement>(null);

  const viewMutation = useViewStory();
  const reactMutation = useReactToStory();
  const deleteMutation = useDeleteStory();
  const createConvMutation = useCreateConversation();
  const sendMessageMutation = useSendMessage();
  const createPostMutation = useCreatePost();

  const currentUser = userStories[userIdx];
  const currentStory = currentUser?.stories[storyIdx];
  const isOwnStory = currentStory?.author.id === me?.id;

  // Detect text-only story (placeholder mediaUrl)
  const isTextOnly = currentStory && isPlaceholderUrl(currentStory.mediaUrl);
  const bgGradient = VIEWER_GRADIENTS[userIdx % VIEWER_GRADIENTS.length];

  // Mark viewed
  useEffect(() => {
    if (currentStory && !currentStory.isViewed) {
      viewMutation.mutate({ storyId: currentStory.id });
    }
  }, [currentStory?.id]);

  // Music
  useEffect(() => {
    musicRef.current?.pause();
    if (currentStory?.musicUrl && !muted) {
      const audio = new Audio(currentStory.musicUrl);
      audio.volume = 0.25;
      audio.loop = true;
      audio.play().catch(() => {});
      musicRef.current = audio;
    } else {
      musicRef.current = null;
    }
    return () => { musicRef.current?.pause(); };
  }, [currentStory?.id, muted]);

  // Mute video
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const goToNext = useCallback(() => {
    if (!currentUser) return;
    if (storyIdx < currentUser.stories.length - 1) { setStoryIdx(s => s + 1); setProgress(0); }
    else if (userIdx < userStories.length - 1) { setUserIdx(u => u + 1); setStoryIdx(0); setProgress(0); }
    else { onClose(); }
  }, [storyIdx, userIdx, currentUser, userStories.length, onClose]);

  const goToPrev = useCallback(() => {
    if (storyIdx > 0) { setStoryIdx(s => s - 1); setProgress(0); }
    else if (userIdx > 0) { setUserIdx(u => u - 1); setStoryIdx(0); setProgress(0); }
  }, [storyIdx, userIdx]);

  // Auto-advance
  useEffect(() => {
    if (paused || currentStory?.mediaType === "video" || replyFocused) return;
    const iv = setInterval(() => {
      setProgress(p => { if (p >= 100) { goToNext(); return 0; } return p + 100 / (STORY_DURATION / 100); });
    }, 100);
    return () => clearInterval(iv);
  }, [paused, goToNext, currentStory?.mediaType, storyIdx, userIdx, replyFocused]);

  useEffect(() => { setProgress(0); setShowMenu(false); }, [storyIdx, userIdx]);

  // Keyboard
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goToNext();
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === " ") setPaused(p => !p);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose, goToNext, goToPrev]);

  const sendEmoji = (emoji: string) => {
    const id = emojiIdRef.current++;
    setFloatingEmojis(prev => [...prev, { id, emoji, x: 40 + Math.random() * 200 }]);
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2200);
    if (currentStory) reactMutation.mutate({ storyId: currentStory.id, data: { emoji } });
    setShowReactions(false);
  };

  const handleReply = async () => {
    if (!reply.trim() || !currentStory) return;
    const text = reply.trim();
    setReply(""); replyRef.current?.blur(); setReplyFocused(false);
    try {
      const conv = await createConvMutation.mutateAsync({ data: { username: currentStory.author.username } });
      await sendMessageMutation.mutateAsync({
        conversationId: conv.id,
        data: { text: `↩ Story reply: ${text}` },
      });
      toast({ title: "Reply sent!", description: `Sent to ${currentUser.user.username}` });
    } catch {
      toast({ title: "Failed to send reply", variant: "destructive" });
    }
  };

  const fetchViewers = async () => {
    if (!currentStory) return;
    try {
      const res = await fetch(`/api/stories/${currentStory.id}/viewers`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("pixlr_token")}` }
      });
      setViewers(await res.json());
    } catch { setViewers([]); }
    setShowViewers(true); setPaused(true);
  };

  const handleDelete = async () => {
    if (!currentStory) return;
    setShowMenu(false);
    try {
      await deleteMutation.mutateAsync({ storyId: currentStory.id });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] });
      toast({ title: "Story deleted" });
      goToNext();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const handleShareAsPost = async () => {
    if (!currentStory) return;
    setShowSharePost(false);
    try {
      await createPostMutation.mutateAsync({ data: { mediaUrl: currentStory.mediaUrl, mediaType: currentStory.mediaType, caption: currentStory.caption ?? "" } });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/feed"] });
      toast({ title: "Shared as post! 🎉" });
    } catch { toast({ title: "Failed to share", variant: "destructive" }); }
  };

  const timeAgo = currentStory ? formatDistanceToNow(new Date(currentStory.createdAt), { addSuffix: true }) : "";

  if (!currentUser || !currentStory) return null;

  const anyModal = showMenu || showViewers || showSharePost || showHighlight || showReactions;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}>
      <div
        className="relative w-full max-w-[420px] h-[100dvh] md:h-[90vh] md:max-h-[900px] overflow-hidden md:rounded-[32px] shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* ── Background ───────────────────────────────────────────────── */}
        <motion.div key={`bg-${userIdx}-${storyIdx}`} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
          className="absolute inset-0" style={{ background: bgGradient }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_55%)]" />

        {/* ── Media ────────────────────────────────────────────────────── */}
        {!isTextOnly && (
          <motion.div key={`media-${currentStory.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
            className="absolute inset-0 z-[1]">
            {currentStory.mediaType === "video" ? (
              <video ref={videoRef} key={currentStory.id} src={currentStory.mediaUrl} autoPlay playsInline muted={muted}
                className="w-full h-full object-cover"
                onTimeUpdate={e => { const el = e.currentTarget; if (el.duration) setProgress((el.currentTime / el.duration) * 100); }}
                onEnded={goToNext} />
            ) : (
              <img key={currentStory.id} src={currentStory.mediaUrl} alt="Story" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
          </motion.div>
        )}

        {/* For text-only stories, show decorative noise overlay */}
        {isTextOnly && (
          <div className="absolute inset-0 z-[1] opacity-10"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")" }} />
        )}

        {/* ── Stickers overlay ─────────────────────────────────────────── */}
        {(currentStory as any).stickers?.length > 0 && (
          <div className="absolute inset-0 z-[6] pointer-events-none">
            {((currentStory as any).stickers as StorySticker[]).map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: "spring", bounce: 0.35 }}
                className="absolute"
                style={{ left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-50%)" }}
              >
                {s.type === "emoji" && (
                  <span className="text-4xl drop-shadow-lg select-none">{s.emoji}</span>
                )}
                {s.type === "poll" && (
                  <div className="bg-white/95 backdrop-blur rounded-2xl px-4 py-3 min-w-[160px] shadow-xl">
                    <p className="text-black font-black text-sm mb-2 text-center">{s.pollQuestion || "Poll"}</p>
                    <div className="flex flex-col gap-1.5">
                      <div className="bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white text-xs font-bold py-1.5 px-3 rounded-xl text-center">{s.pollA || "Yes"}</div>
                      <div className="bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white text-xs font-bold py-1.5 px-3 rounded-xl text-center">{s.pollB || "No"}</div>
                    </div>
                  </div>
                )}
                {s.type === "question" && (
                  <div className="bg-gradient-to-br from-fuchsia-500 to-indigo-600 rounded-2xl px-4 py-3 min-w-[150px] shadow-xl">
                    <div className="flex items-center gap-1.5 mb-1">
                      <HelpCircle size={13} className="text-white/80" />
                      <span className="text-white/80 text-[10px] font-bold uppercase tracking-wider">Ask me anything</span>
                    </div>
                    <p className="text-white font-black text-sm">{s.text || "Ask me a question"}</p>
                  </div>
                )}
                {s.type === "quiz" && (
                  <div className="bg-white/95 backdrop-blur rounded-2xl px-4 py-3 min-w-[160px] shadow-xl">
                    <div className="flex items-center gap-1.5 mb-2">
                      <BarChart2 size={13} className="text-purple-600" />
                      <span className="text-purple-600 text-[10px] font-bold uppercase">Quiz</span>
                    </div>
                    <p className="text-black font-black text-sm mb-2">{s.text || "Quiz"}</p>
                    <div className="flex flex-col gap-1">
                      {(s.quizOptions ?? []).map((opt, i) => (
                        <div key={i} className="bg-purple-100 text-purple-700 text-xs font-semibold py-1 px-3 rounded-xl">{opt}</div>
                      ))}
                    </div>
                  </div>
                )}
                {s.type === "countdown" && (
                  <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl px-4 py-3 shadow-xl text-center min-w-[130px]">
                    <p className="text-white font-black text-sm">{s.countdownLabel || "Event"}</p>
                    <p className="text-white/80 text-xs mt-0.5">⏱ Countdown</p>
                  </div>
                )}
                {s.type === "location" && (
                  <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur rounded-full px-3 py-1.5 shadow-lg">
                    <MapPin size={13} className="text-red-500 shrink-0" />
                    <span className="text-black text-xs font-bold">{s.text || "Location"}</span>
                  </div>
                )}
                {s.type === "hashtag" && (
                  <div className="flex items-center gap-1 bg-white/90 backdrop-blur rounded-full px-3 py-1.5 shadow-lg">
                    <Hash size={13} className="text-blue-500 shrink-0" />
                    <span className="text-blue-600 text-xs font-bold">{s.text || "hashtag"}</span>
                  </div>
                )}
                {s.type === "mention" && (
                  <div className="flex items-center gap-1 bg-white/90 backdrop-blur rounded-full px-3 py-1.5 shadow-lg">
                    <AtSign size={13} className="text-indigo-500 shrink-0" />
                    <span className="text-indigo-600 text-xs font-bold">{s.text || "mention"}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Caption / Text overlay ───────────────────────────────────── */}
        {currentStory.caption && (
          <motion.div key={`caption-${currentStory.id}`}
            initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, type: "spring", bounce: 0.3 }}
            className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none px-8">
            <div className="text-center">
              <p className="text-2xl font-black text-center leading-tight max-w-xs break-words drop-shadow-2xl"
                style={{
                  color: currentStory.textColor ?? "white",
                  textShadow: "0 2px 16px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.5)"
                }}>
                {currentStory.caption}
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Progress bars ─────────────────────────────────────────────── */}
        <div className="absolute top-4 left-3 right-3 z-30 flex gap-[3px]">
          {currentUser.stories.map((_s, i) => (
            <div key={i} className="flex-1 h-[2.5px] bg-white/25 rounded-full overflow-hidden">
              <motion.div className="h-full bg-white rounded-full"
                style={{ width: i < storyIdx ? "100%" : i === storyIdx ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="absolute top-9 left-4 right-4 z-30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-10 w-10 ring-2 ring-white/80 shadow-lg">
              <AvatarImage src={currentUser.user.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-white/20 text-white font-bold text-sm">{currentUser.user.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-white text-[13px] font-bold leading-none drop-shadow-md">{currentUser.user.username}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-white/65 text-[10px] drop-shadow-sm">{timeAgo}</span>
                {isOwnStory && (
                  <button onClick={fetchViewers} className="flex items-center gap-0.5 text-white/70 hover:text-white transition-colors">
                    <Eye size={10} /><span className="text-[10px]">{currentStory.viewsCount}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentStory.musicTrack && (
              <motion.div animate={{ rotate: muted ? 0 : [0, 2, -2, 0] }} transition={{ repeat: Infinity, duration: 2 }}
                className="flex items-center gap-1 bg-black/35 backdrop-blur-md rounded-full px-2 py-1">
                <Music size={10} className="text-white/80" />
                <span className="text-white/80 text-[9px] font-medium max-w-[55px] truncate">{currentStory.musicTrack}</span>
              </motion.div>
            )}
            <button onClick={() => setMuted(!muted)} className="w-8 h-8 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center text-white/90 hover:text-white hover:bg-black/40 transition-all">
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <button onClick={() => { setShowMenu(!showMenu); setPaused(true); }}
              className="w-8 h-8 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center text-white/90 hover:text-white hover:bg-black/40 transition-all">
              <MoreHorizontal size={15} />
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center text-white/90 hover:text-white hover:bg-black/40 transition-all">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Music player bar ──────────────────────────────────────────── */}
        <AnimatePresence>
          {currentStory.musicTrack && !muted && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute z-20 left-4 right-4" style={{ bottom: isOwnStory ? "120px" : "150px" }}>
              <div className="bg-black/40 backdrop-blur-xl border border-white/15 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-indigo-500 flex items-center justify-center shrink-0">
                  <Music size={13} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-xs font-bold truncate">{currentStory.musicTrack}</div>
                  <div className="text-white/55 text-[10px] truncate">{currentStory.musicArtist}</div>
                </div>
                <div className="flex gap-[2px] items-end h-4 shrink-0">
                  {[3, 5, 4, 6, 3, 5].map((h, i) => (
                    <motion.div key={i} className="w-[2px] bg-white/70 rounded-full"
                      animate={{ height: [h * 1.5, h * 3, h * 1.5] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.09 }} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bottom gradient ───────────────────────────────────────────── */}
        <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pointer-events-none" />

        {/* ── Bottom UI ─────────────────────────────────────────────────── */}
        <div className="absolute bottom-5 left-4 right-4 z-30 flex flex-col gap-2">
          {/* Quick reactions row */}
          <div className="flex items-center justify-center gap-2">
            {["❤️", "🔥", "😍", "👏", "😮", "😂"].map(emoji => (
              <motion.button key={emoji} whileTap={{ scale: 1.6 }} onClick={() => sendEmoji(emoji)}
                className="w-11 h-11 bg-white/10 backdrop-blur-lg border border-white/20 rounded-full text-xl flex items-center justify-center hover:bg-white/20 transition-colors shadow-lg">
                {emoji}
              </motion.button>
            ))}
          </div>

          {/* Reply input (non-owner) */}
          {!isOwnStory && (
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex-1 flex items-center gap-2 bg-white/10 backdrop-blur-xl border rounded-full px-4 py-2.5 transition-all",
                replyFocused ? "border-white/60 bg-white/15" : "border-white/25"
              )}>
                <Smile size={14} className="text-white/50 shrink-0" />
                <input
                  ref={replyRef}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleReply()}
                  onFocus={() => { setReplyFocused(true); setPaused(true); }}
                  onBlur={() => { setReplyFocused(false); setPaused(false); }}
                  placeholder={`Reply to ${currentUser.user.username}...`}
                  className="flex-1 bg-transparent text-white text-[13px] placeholder-white/40 outline-none"
                />
              </div>
              <motion.button whileTap={{ scale: 0.85 }} onClick={handleReply}
                className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg shrink-0">
                <Send size={13} className="text-gray-800" />
              </motion.button>
            </div>
          )}

          {/* Owner: view count bar */}
          {isOwnStory && (
            <button onClick={fetchViewers}
              className="flex items-center justify-center gap-2 bg-white/10 backdrop-blur-lg border border-white/20 rounded-full py-2.5 hover:bg-white/15 transition-colors">
              <Eye size={14} className="text-white/80" />
              <span className="text-white text-sm font-semibold">{currentStory.viewsCount} viewers</span>
            </button>
          )}
        </div>

        {/* ── Tap zones (prev / next) ───────────────────────────────────── */}
        {!anyModal && !replyFocused && (
          <>
            <button className="absolute left-0 top-14 bottom-36 w-[35%] z-20"
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => { setPaused(false); goToPrev(); }} />
            <button className="absolute right-0 top-14 bottom-36 w-[35%] z-20"
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => { setPaused(false); goToNext(); }} />
            {/* Hold to pause - center zone */}
            <button className="absolute left-[35%] right-[35%] top-14 bottom-36 z-20"
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)} />
          </>
        )}

        {/* ── Prev / Next user arrows ───────────────────────────────────── */}
        {userIdx > 0 && (
          <button onClick={() => { setUserIdx(u => u - 1); setStoryIdx(0); setProgress(0); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-lg">
            <ChevronLeft size={19} />
          </button>
        )}
        {userIdx < userStories.length - 1 && (
          <button onClick={() => { setUserIdx(u => u + 1); setStoryIdx(0); setProgress(0); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-lg">
            <ChevronRight size={19} />
          </button>
        )}

        {/* ── Floating emoji reactions ──────────────────────────────────── */}
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
          <AnimatePresence>
            {floatingEmojis.map(({ id, emoji, x }) => (
              <motion.span key={id} initial={{ y: 680, x, opacity: 1, scale: 1 }} animate={{ y: 60, opacity: 0, scale: 1.8 }}
                transition={{ duration: 2.2, ease: [0.2, 0.8, 0.4, 1] }} className="absolute text-3xl select-none">{emoji}</motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* ── Pause indicator ───────────────────────────────────────────── */}
        <AnimatePresence>
          {paused && !anyModal && !replyFocused && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 bg-black/45 backdrop-blur-md rounded-full flex items-center justify-center gap-1.5 shadow-xl">
                <div className="w-[5px] h-5 bg-white rounded-full" />
                <div className="w-[5px] h-5 bg-white rounded-full" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Context menu ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {showMenu && (
            <motion.div initial={{ opacity: 0, scale: 0.9, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -8 }}
              className="absolute top-[72px] right-4 z-50 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl py-1 shadow-2xl min-w-[170px]"
              onClick={e => e.stopPropagation()}>
              <button onClick={() => { setShowSharePost(true); setShowMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-white text-sm hover:bg-white/10 transition-colors">
                <Share2 size={14} /> Share as Post
              </button>
              <button onClick={() => { setShowHighlight(true); setShowMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-white text-sm hover:bg-white/10 transition-colors">
                <BookmarkPlus size={14} /> Add to Highlight
              </button>
              {isOwnStory && (
                <button onClick={handleDelete}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-red-400 text-sm hover:bg-red-500/10 transition-colors border-t border-white/10 mt-1">
                  <Trash2 size={14} /> Delete Story
                </button>
              )}
              <button onClick={() => { setShowMenu(false); setPaused(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-white/50 text-sm hover:bg-white/10 transition-colors border-t border-white/10">
                <X size={14} /> Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Share as Post sheet ───────────────────────────────────────── */}
        <AnimatePresence>
          {showSharePost && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-black/80 flex items-end"
              onClick={() => { setShowSharePost(false); setPaused(false); }}>
              <motion.div initial={{ y: 120 }} animate={{ y: 0 }} exit={{ y: 120 }} transition={{ type: "spring", damping: 25 }}
                className="w-full bg-zinc-900 rounded-t-3xl p-6 border-t border-white/10"
                onClick={e => e.stopPropagation()}>
                <h3 className="text-white font-bold text-lg mb-2">Share as Post?</h3>
                <p className="text-white/55 text-sm mb-5">This will be published on your profile.</p>
                <div className="flex gap-3">
                  <button onClick={() => { setShowSharePost(false); setPaused(false); }}
                    className="flex-1 py-3 bg-white/10 rounded-xl text-white font-semibold text-sm">Cancel</button>
                  <button onClick={handleShareAsPost}
                    className="flex-1 py-3 bg-gradient-to-r from-fuchsia-500 to-indigo-500 rounded-xl text-white font-semibold text-sm">Share</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Viewers modal ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {showViewers && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-black/80 flex items-end"
              onClick={() => { setShowViewers(false); setPaused(false); }}>
              <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }} transition={{ type: "spring", damping: 25 }}
                className="w-full bg-zinc-900 rounded-t-3xl border-t border-white/10 max-h-[70vh] flex flex-col"
                onClick={e => e.stopPropagation()}>
                {/* Handle */}
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1" />
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Eye size={15} className="text-white" />
                    <span className="text-white font-bold text-sm">Viewers ({viewers.length})</span>
                  </div>
                  <button onClick={() => { setShowViewers(false); setPaused(false); }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white">
                    <X size={16} />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-3">
                  {viewers.length === 0 ? (
                    <div className="text-center py-10 text-white/40 text-sm">No viewers yet</div>
                  ) : viewers.map(viewer => (
                    <div key={viewer.id} className="flex items-center gap-3 py-2.5">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={viewer.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-white/20 text-white text-sm">{viewer.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-white text-sm font-semibold">{viewer.username}</div>
                        <div className="text-white/50 text-xs">{viewer.fullName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Add to Highlight ──────────────────────────────────────────── */}
        <AnimatePresence>
          {showHighlight && currentStory && (
            <CreateHighlightModal
              storyId={currentStory.id}
              coverUrl={currentStory.mediaUrl}
              onClose={() => { setShowHighlight(false); setPaused(false); }}
            />
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
