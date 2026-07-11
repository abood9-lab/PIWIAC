import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Trash2,
  Flag,
  Link2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Lock,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useLikePost,
  useSavePost,
  useDeletePost,
  useUpdatePost,
  useReportPost,
  getGetFeedQueryKey,
  useGetFollowing,
  useCreateConversation,
  useSendMessage,
  useCreateStory,
} from "@workspace/api-client-react";
import type { Post, UserSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function MediaCarousel({
  mediaUrls,
  mediaType,
  altText,
  caption,
  onDoubleTap,
}: {
  mediaUrls: string[];
  mediaType: string;
  altText?: string | null;
  caption?: string | null;
  onDoubleTap: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const total = mediaUrls.length;
  const canPrev = current > 0;
  const canNext = current < total - 1;

  const prev = () => setCurrent((c) => Math.max(0, c - 1));
  const next = () => setCurrent((c) => Math.min(total - 1, c + 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 40 && canNext) next();
    else if (diff < -40 && canPrev) prev();
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div
      className="relative bg-black w-full overflow-hidden select-none"
      onDoubleClick={onDoubleTap}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {mediaUrls.map((url, i) =>
          mediaType === "video" && i === 0 ? (
            <div key={i} className="w-full flex-none">
              <video
                src={url}
                controls
                className="w-full max-h-[585px] object-contain"
              />
            </div>
          ) : (
            <div key={i} className="w-full flex-none">
              <img
                src={url}
                alt={altText ?? caption ?? "Post image"}
                className="w-full max-h-[585px] object-contain"
                draggable={false}
              />
            </div>
          )
        )}
      </div>

      {canPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canNext && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {total > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {mediaUrls.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              className={cn(
                "rounded-full transition-all duration-200",
                i === current
                  ? "w-2 h-2 bg-white"
                  : "w-1.5 h-1.5 bg-white/50 hover:bg-white/75"
              )}
            />
          ))}
        </div>
      )}

      {total > 1 && (
        <div className="absolute top-3 right-3 bg-black/50 text-white text-xs font-medium px-2 py-0.5 rounded-full z-10">
          {current + 1}/{total}
        </div>
      )}
    </div>
  );
}

export function PostCard({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isSaved, setIsSaved] = useState(post.isSaved);
  const [editOpen, setEditOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSearch, setShareSearch] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const likeMutation = useLikePost();
  const saveMutation = useSavePost();
  const deleteMutation = useDeletePost();
  const updateMutation = useUpdatePost();
  const reportMutation = useReportPost();
  const createConvMutation = useCreateConversation();
  const sendMessageMutation = useSendMessage();
  const createStoryMutation = useCreateStory();

  const { data: followingData } = useGetFollowing(user?.username ?? "", {
    query: { enabled: !!user?.username && shareOpen } as any,
  });
  const followingList: UserSummary[] = (followingData as any) ?? [];
  const filteredFollowing = followingList.filter(u =>
    u.username.toLowerCase().includes(shareSearch.toLowerCase()) ||
    (u.fullName ?? "").toLowerCase().includes(shareSearch.toLowerCase())
  );

  const isOwner = post.author?.id === user?.id;
  const captionLong = (post.caption?.length ?? 0) > 100;
  const commentsDisabled = post.commentsDisabled === true;
  const isCloseFriends = post.audience === "close_friends";

  const allMediaUrls = [
    post.mediaUrl,
    ...(post.additionalMediaUrls ?? []),
  ].filter(Boolean) as string[];

  const handleLike = async () => {
    setIsLiked(!isLiked);
    setLikesCount(isLiked ? likesCount - 1 : likesCount + 1);
    try {
      await likeMutation.mutateAsync({ postId: post.id });
    } catch {
      setIsLiked(isLiked);
      setLikesCount(likesCount);
    }
  };

  const handleDoubleTapLike = () => {
    if (!isLiked) handleLike();
  };

  const handleSave = async () => {
    setIsSaved(!isSaved);
    try {
      await saveMutation.mutateAsync({ postId: post.id });
    } catch {
      setIsSaved(isSaved);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ postId: post.id });
      queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
      toast({ title: "Post deleted" });
    } catch {
      toast({ title: "Failed to delete post", variant: "destructive" });
    }
  };

  const handleEditCaption = async () => {
    try {
      await updateMutation.mutateAsync({ postId: post.id, data: { caption: editCaption } });
      queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
      setEditOpen(false);
      toast({ title: "Caption updated" });
    } catch {
      toast({ title: "Failed to update caption", variant: "destructive" });
    }
  };

  const handleReport = async () => {
    try {
      await reportMutation.mutateAsync({ postId: post.id, data: { reason: reportReason } });
      setReportOpen(false);
      toast({ title: "Report submitted", description: "Thanks for keeping the community safe." });
    } catch {
      toast({ title: "Failed to submit report", variant: "destructive" });
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
    toast({ title: "Link copied!" });
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleShareToUser = async (user: UserSummary) => {
    setSendingTo(user.id);
    try {
      const conv = await createConvMutation.mutateAsync({ data: { username: user.username } });
      await sendMessageMutation.mutateAsync({
        conversationId: conv.id,
        data: { text: `${window.location.origin}/post/${post.id}` },
      });
      toast({ title: `Sent to @${user.username}!` });
    } catch {
      toast({ title: "Failed to send", variant: "destructive" });
    } finally {
      setSendingTo(null);
    }
  };

  const handleShareToStory = async () => {
    try {
      const mediaUrl = post.mediaUrl || (post.additionalMediaUrls?.[0]);
      if (!mediaUrl) { toast({ title: "No media to share" }); return; }
      await createStoryMutation.mutateAsync({
        data: {
          mediaUrl,
          mediaType: post.mediaType === "video" ? "video" : "image",
          caption: post.caption ?? undefined,
        },
      });
      toast({ title: "Shared to your story!" });
      setShareOpen(false);
    } catch {
      toast({ title: "Failed to share to story", variant: "destructive" });
    }
  };

  return (
    <>
      <div className="bg-card border-b sm:border border-border sm:rounded-xl overflow-hidden max-w-[470px] mx-auto w-full mb-0 sm:mb-4">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <Link href={`/profile/${post.author.username}`} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="relative">
              <Avatar className="h-9 w-9">
                <AvatarImage src={post.author.avatarUrl || undefined} />
                <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                  {post.author.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isCloseFriends && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-card">
                  <Lock className="h-2 w-2 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm leading-tight">{post.author.username}</span>
                {isCloseFriends && (
                  <span className="text-[10px] font-semibold text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full leading-none">
                    Close Friends
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground leading-tight">
                {post.location && (
                  <>
                    <MapPin className="h-2.5 w-2.5" />
                    <span>{post.location}</span>
                    <span className="mx-0.5">·</span>
                  </>
                )}
                <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
              </div>
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isOwner ? (
                <>
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={() => { setEditCaption(post.caption ?? ""); setEditOpen(true); }}
                  >
                    <Pencil className="h-4 w-4" /> Edit caption
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete post
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => setReportOpen(true)}
                >
                  <Flag className="h-4 w-4" /> Report post
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleCopyLink}>
                <Link2 className="h-4 w-4" /> Copy link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Media Carousel */}
        <MediaCarousel
          mediaUrls={allMediaUrls}
          mediaType={post.mediaType}
          altText={post.altText}
          caption={post.caption}
          onDoubleTap={handleDoubleTapLike}
        />

        {/* Actions */}
        <div className="px-3 pt-2.5 pb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleLike}
                className="hover:scale-110 transition-transform active:scale-90"
              >
                <Heart className={cn("h-6 w-6 transition-colors", isLiked ? "fill-red-500 text-red-500" : "hover:text-muted-foreground")} />
              </button>

              {!commentsDisabled && (
                <Link href={`/post/${post.id}`}>
                  <MessageCircle className="h-6 w-6 hover:text-muted-foreground transition-colors cursor-pointer" />
                </Link>
              )}

              <button onClick={handleShare} className="hover:text-muted-foreground transition-colors">
                <Send className="h-6 w-6" />
              </button>
            </div>
            <button
              onClick={handleSave}
              className="hover:scale-110 transition-transform active:scale-90"
            >
              <Bookmark className={cn("h-6 w-6 transition-colors", isSaved ? "fill-foreground text-foreground" : "hover:text-muted-foreground")} />
            </button>
          </div>

          {likesCount > 0 && (
            <div className="font-semibold text-sm mb-1.5">
              {likesCount.toLocaleString()} {likesCount === 1 ? "like" : "likes"}
            </div>
          )}

          {post.caption && (
            <div className="text-sm mb-1.5 leading-snug">
              <Link href={`/profile/${post.author.username}`} className="font-semibold hover:underline mr-1.5">
                {post.author.username}
              </Link>
              <span className="text-foreground/90">
                {captionLong && !captionExpanded
                  ? `${post.caption.slice(0, 100)}...`
                  : post.caption}
              </span>
              {captionLong && (
                <button
                  onClick={() => setCaptionExpanded(!captionExpanded)}
                  className="ml-1 text-muted-foreground text-xs hover:text-foreground transition-colors"
                >
                  {captionExpanded ? "less" : "more"}
                </button>
              )}
            </div>
          )}

          {!commentsDisabled && post.commentsCount > 0 && (
            <Link href={`/post/${post.id}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors block mb-1">
              View all {post.commentsCount} {post.commentsCount === 1 ? "comment" : "comments"}
            </Link>
          )}

          {commentsDisabled && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MessageCircle className="h-3 w-3" />
              Comments are disabled
            </div>
          )}
        </div>
      </div>

      {/* Edit Caption Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit caption</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editCaption}
            onChange={(e) => setEditCaption(e.target.value)}
            placeholder="Write a caption..."
            className="min-h-[100px] resize-none"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditCaption} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your post and all its comments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report Sheet */}
      <Sheet open={reportOpen} onOpenChange={setReportOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Report post</SheetTitle>
          </SheetHeader>
          <div className="space-y-2">
            {["Spam", "Nudity or sexual activity", "Hate speech or symbols", "Violence or dangerous content", "Bullying or harassment", "Other"].map((reason) => (
              <button
                key={reason}
                onClick={() => setReportReason(reason)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl text-sm transition-colors border",
                  reportReason === reason
                    ? "bg-primary/10 border-primary text-primary font-medium"
                    : "border-border hover:bg-muted"
                )}
              >
                {reason}
              </button>
            ))}
          </div>
          <Button
            className="w-full mt-4"
            disabled={!reportReason || reportMutation.isPending}
            onClick={handleReport}
          >
            {reportMutation.isPending ? "Submitting..." : "Submit report"}
          </Button>
        </SheetContent>
      </Sheet>

      {/* ── Share Sheet ────────────────────────────────────────────────── */}
      <Sheet open={shareOpen} onOpenChange={setShareOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] flex flex-col">
          <SheetHeader className="mb-3">
            <SheetTitle>Share</SheetTitle>
          </SheetHeader>

          {/* Quick actions */}
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
                toast({ title: "Link copied!" });
              }}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border bg-muted/30 hover:bg-muted transition-colors"
            >
              <Link2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium">Copy link</span>
            </button>
            <button
              onClick={handleShareToStory}
              disabled={createStoryMutation.isPending}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border bg-muted/30 hover:bg-muted transition-colors disabled:opacity-50"
            >
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 flex items-center justify-center">
                <span className="text-white text-[8px] font-black">+</span>
              </div>
              <span className="text-xs font-medium">Share to story</span>
            </button>
          </div>

          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Send to</div>

          {/* Search */}
          <input
            value={shareSearch}
            onChange={e => setShareSearch(e.target.value)}
            placeholder="Search..."
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none mb-3 focus:ring-2 focus:ring-primary/30"
          />

          {/* Following list */}
          <div className="overflow-y-auto flex-1 space-y-1 pb-4">
            {filteredFollowing.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {shareSearch ? "No results" : "Follow people to share with them"}
              </p>
            )}
            {filteredFollowing.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="relative shrink-0">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
                    {user.avatarUrl
                      ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                      : <span className="text-white text-sm font-bold">{user.username[0].toUpperCase()}</span>
                    }
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user.username}</p>
                  {user.fullName && <p className="text-xs text-muted-foreground truncate">{user.fullName}</p>}
                </div>
                <button
                  onClick={() => handleShareToUser(user)}
                  disabled={sendingTo === user.id}
                  className="shrink-0 px-4 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {sendingTo === user.id ? "Sending…" : "Send"}
                </button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
