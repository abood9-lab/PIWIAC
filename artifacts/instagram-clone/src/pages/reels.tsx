import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Heart, MessageCircle, Bookmark, Share2, VolumeX, Volume2, Play, X, Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface ReelComment {
  id: number;
  text: string;
  author: {
    id: number;
    username: string;
    avatarUrl: string | null;
  } | null;
  createdAt: string;
}

interface Reel {
  id: number;
  caption: string | null;
  mediaUrl: string;
  mediaType: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved: boolean;
  author: {
    id: number;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
    isFollowing: boolean;
  };
  createdAt: string;
}

function ReelItem({
  reel,
  isActive,
  onLike,
  onSave,
}: {
  reel: Reel;
  isActive: boolean;
  onLike: (id: number) => void;
  onSave: (id: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isActive]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPaused(false);
    } else {
      video.pause();
      setIsPaused(true);
    }
  };

  const fetchComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const token = localStorage.getItem("pixlr_token");
      const res = await fetch(`/api/reels/${reel.id}/comments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setComments(data);
    } catch {}
    setCommentsLoading(false);
  }, [reel.id]);

  const handleOpenComments = () => {
    setShowComments(true);
    fetchComments();
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("pixlr_token");
      const res = await fetch(`/api/reels/${reel.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: commentText.trim() }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [comment, ...prev]);
        setCommentText("");
      }
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {/* Video */}
      <video
        ref={videoRef}
        src={reel.mediaUrl}
        className="w-full h-full object-cover"
        loop
        muted={isMuted}
        playsInline
        onClick={togglePlay}
      />

      {/* Pause overlay */}
      {isPaused && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={togglePlay}
        >
          <div className="bg-black/40 rounded-full p-5">
            <Play className="w-10 h-10 text-white fill-white" />
          </div>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60 pointer-events-none" />

      {/* Top controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-3">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="bg-black/40 rounded-full p-2 text-white backdrop-blur-sm"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Right action bar */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        {/* Like */}
        <button
          onClick={() => onLike(reel.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90",
            reel.isLiked ? "text-red-500" : "text-white"
          )}>
            <Heart className={cn("w-7 h-7", reel.isLiked && "fill-red-500")} />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">{reel.likesCount}</span>
        </button>

        {/* Comments */}
        <button
          onClick={handleOpenComments}
          className="flex flex-col items-center gap-1"
        >
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white">
            <MessageCircle className="w-7 h-7" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">{reel.commentsCount}</span>
        </button>

        {/* Save */}
        <button
          onClick={() => onSave(reel.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center",
            reel.isSaved ? "text-white" : "text-white"
          )}>
            <Bookmark className={cn("w-7 h-7", reel.isSaved && "fill-white")} />
          </div>
        </button>

        {/* Share */}
        <button className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white">
            <Share2 className="w-6 h-6" />
          </div>
        </button>

        {/* Author avatar */}
        <Link href={`/profile/${reel.author.username}`}>
          <div className="relative">
            <Avatar className="w-10 h-10 border-2 border-white">
              <AvatarImage src={reel.author.avatarUrl || undefined} />
              <AvatarFallback className="text-sm font-bold bg-gray-700 text-white">
                {reel.author.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </Link>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-16 p-4 pb-6">
        <Link href={`/profile/${reel.author.username}`} className="flex items-center gap-2 mb-2">
          <span className="text-white font-bold text-sm drop-shadow">@{reel.author.username}</span>
        </Link>
        {reel.caption && (
          <p className="text-white text-sm leading-relaxed line-clamp-2 drop-shadow">
            {reel.caption}
          </p>
        )}
      </div>

      {/* Comments Sheet */}
      {showComments && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowComments(false)}
          />
          <div className="relative bg-card rounded-t-2xl max-h-[70vh] flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">{reel.commentsCount} Comments</span>
              <button onClick={() => setShowComments(false)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {commentsLoading ? (
                <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
              ) : comments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">No comments yet. Be first!</div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={comment.author?.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        {comment.author?.username[0].toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="font-semibold text-sm mr-2">{comment.author?.username}</span>
                      <span className="text-sm">{comment.text}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {user && (
              <form onSubmit={handleSendComment} className="flex items-center gap-2 p-3 border-t border-border">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs">{user.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 h-9 rounded-full bg-secondary border-transparent text-sm"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  disabled={!commentText.trim() || submitting}
                  className="text-primary shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Reels() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const fetchReels = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("pixlr_token");
      const res = await fetch("/api/reels?limit=20", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setReels(data.reels ?? []);
    } catch {}
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  // IntersectionObserver for active reel tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = itemRefs.current.findIndex((el) => el === entry.target);
            if (idx !== -1) setActiveIndex(idx);
          }
        });
      },
      { threshold: 0.6 }
    );

    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [reels]);

  const handleLike = async (reelId: number) => {
    const token = localStorage.getItem("pixlr_token");
    if (!token) return;

    setReels((prev) =>
      prev.map((r) =>
        r.id === reelId
          ? { ...r, isLiked: !r.isLiked, likesCount: r.isLiked ? r.likesCount - 1 : r.likesCount + 1 }
          : r
      )
    );

    try {
      await fetch(`/api/reels/${reelId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Revert on failure
      setReels((prev) =>
        prev.map((r) =>
          r.id === reelId
            ? { ...r, isLiked: !r.isLiked, likesCount: r.isLiked ? r.likesCount - 1 : r.likesCount + 1 }
            : r
        )
      );
    }
  };

  const handleSave = async (reelId: number) => {
    const token = localStorage.getItem("pixlr_token");
    if (!token) return;

    setReels((prev) =>
      prev.map((r) => (r.id === reelId ? { ...r, isSaved: !r.isSaved } : r))
    );

    try {
      await fetch(`/api/posts/${reelId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setReels((prev) =>
        prev.map((r) => (r.id === reelId ? { ...r, isSaved: !r.isSaved } : r))
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-black">
        <div className="text-white text-sm">Loading Reels...</div>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-black text-white gap-4">
        <div className="text-5xl">🎬</div>
        <h2 className="text-xl font-bold">No Reels Yet</h2>
        <p className="text-gray-400 text-sm text-center px-8">
          Upload a video post to have it appear here as a Reel.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[calc(100dvh-8rem)] md:h-[100dvh] overflow-y-scroll snap-y snap-mandatory bg-black scrollbar-hide"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {reels.map((reel, idx) => (
        <div
          key={reel.id}
          ref={(el) => { itemRefs.current[idx] = el; }}
          className="w-full h-[calc(100dvh-8rem)] md:h-[100dvh] snap-start snap-always relative flex-shrink-0"
        >
          <ReelItem
            reel={reel}
            isActive={idx === activeIndex}
            onLike={handleLike}
            onSave={handleSave}
          />
        </div>
      ))}
    </div>
  );
}
