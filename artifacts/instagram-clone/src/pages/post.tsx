import { useRoute, Link, useLocation } from "wouter";
import {
  useGetPost,
  useGetPostComments,
  useCreateComment,
  useDeleteComment,
  useLikeComment,
  useLikePost,
  useSavePost,
  useUpdatePost,
  useDeletePost,
  useReportPost,
  getGetPostCommentsQueryKey,
  getGetPostQueryKey,
  getGetFeedQueryKey,
} from "@workspace/api-client-react";
import type { Comment } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Trash2,
  Flag,
  Link2,
  Pencil,
  Send,
  ChevronLeft,
  ChevronRight,
  Smile,
  MapPin,
  Lock,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getSocket, initSocket } from "@/lib/socket";
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
import { ScrollArea } from "@/components/ui/scroll-area";

type CommentWithOptimistic = Comment & { pending?: boolean };

export default function PostDetail() {
  const [, params] = useRoute("/post/:id");
  const [, setLocation] = useLocation();
  const postId = params?.id ?? "";
  const queryClient = useQueryClient();
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState<CommentWithOptimistic[]>([]);
  const [initialized, setInitialized] = useState(false);

  const [editCaptionOpen, setEditCaptionOpen] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [deletePostOpen, setDeletePostOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const [localIsLiked, setLocalIsLiked] = useState(false);
  const [localLikesCount, setLocalLikesCount] = useState(0);
  const [localIsSaved, setLocalIsSaved] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: post, isLoading: postLoading } = useGetPost(postId, { query: { enabled: !!postId } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: commentsData, isLoading: commentsLoading } = useGetPostComments(postId, { query: { enabled: !!postId } as any });

  const createCommentMutation = useCreateComment();
  const deleteCommentMutation = useDeleteComment();
  const likeCommentMutation = useLikeComment();
  const likePostMutation = useLikePost();
  const savePostMutation = useSavePost();
  const updatePostMutation = useUpdatePost();
  const deletePostMutation = useDeletePost();
  const reportPostMutation = useReportPost();

  const isOwner = post?.author?.id === user?.id;
  const commentsDisabled = post?.commentsDisabled === true;
  const isCloseFriends = post?.audience === "close_friends";
  const allMediaUrls = post ? [post.mediaUrl, ...(post.additionalMediaUrls ?? [])].filter(Boolean) as string[] : [];

  const [mediaIndex, setMediaIndex] = useState(0);
  const mediaTouchStartX = useRef<number | null>(null);
  const mediaTouchEndX = useRef<number | null>(null);

  useEffect(() => {
    if (commentsData && !initialized) {
      const arr = Array.isArray(commentsData) ? commentsData : [];
      setLocalComments(arr);
      setInitialized(true);
    }
  }, [commentsData, initialized]);

  useEffect(() => {
    if (post) {
      setLocalIsLiked(post.isLiked);
      setLocalLikesCount(post.likesCount);
      setLocalIsSaved(post.isSaved);
    }
  }, [post]);

  useEffect(() => {
    if (!postId || !token) return;
    const socket = getSocket() ?? initSocket(token);
    socket.emit("join_post", { postId });

    socket.on("new_comment", (data: { postId: string; comment: Comment }) => {
      if (data.postId !== postId) return;
      setLocalComments((prev) => {
        if (prev.some((c) => c.id === data.comment.id)) return prev;
        return [...prev, data.comment];
      });
    });

    socket.on("delete_comment", (data: { postId: string; commentId: string }) => {
      if (data.postId !== postId) return;
      setLocalComments((prev) => prev.filter((c) => String(c.id) !== String(data.commentId)));
    });

    return () => {
      socket.emit("leave_post", { postId });
      socket.off("new_comment");
      socket.off("delete_comment");
    };
  }, [postId, token]);

  useEffect(() => {
    if (localComments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [localComments.length]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: CommentWithOptimistic = {
      id: tempId,
      text: commentText,
      author: {
        id: user!.id,
        username: user!.username,
        avatarUrl: user!.avatarUrl ?? null,
        fullName: user!.fullName ?? null,
        isFollowing: false,
      },
      parentId: null,
      likesCount: 0,
      isLiked: false,
      replies: [],
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setLocalComments((prev) => [...prev, optimistic]);
    setCommentText("");

    try {
      const newComment = await createCommentMutation.mutateAsync({ postId, data: { text: optimistic.text } });
      setLocalComments((prev) => prev.map((c) => (String(c.id) === tempId ? { ...newComment, pending: false } : c)));
      queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
    } catch {
      setLocalComments((prev) => prev.filter((c) => String(c.id) !== tempId));
      toast({ title: "Failed to post comment", variant: "destructive" });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setLocalComments((prev) => prev.filter((c) => String(c.id) !== commentId));
    try {
      await deleteCommentMutation.mutateAsync({ commentId });
      queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
    } catch {
      queryClient.invalidateQueries({ queryKey: getGetPostCommentsQueryKey(postId) });
      toast({ title: "Failed to delete comment", variant: "destructive" });
    }
  };

  const handleLikeComment = useCallback(
    async (commentId: string, currentIsLiked: boolean) => {
      setLocalComments((prev) =>
        prev.map((c) =>
          String(c.id) === commentId
            ? { ...c, isLiked: !currentIsLiked, likesCount: currentIsLiked ? c.likesCount - 1 : c.likesCount + 1 }
            : c
        )
      );
      try {
        await likeCommentMutation.mutateAsync({ commentId });
      } catch {
        setLocalComments((prev) =>
          prev.map((c) =>
            String(c.id) === commentId
              ? { ...c, isLiked: currentIsLiked, likesCount: currentIsLiked ? c.likesCount + 1 : c.likesCount - 1 }
              : c
          )
        );
      }
    },
    [likeCommentMutation]
  );

  const handleLikePost = async () => {
    setLocalIsLiked(!localIsLiked);
    setLocalLikesCount(localIsLiked ? localLikesCount - 1 : localLikesCount + 1);
    try {
      await likePostMutation.mutateAsync({ postId: postId });
      queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
    } catch {
      setLocalIsLiked(localIsLiked);
      setLocalLikesCount(localLikesCount);
    }
  };

  const handleSavePost = async () => {
    setLocalIsSaved(!localIsSaved);
    try {
      await savePostMutation.mutateAsync({ postId: postId });
    } catch {
      setLocalIsSaved(localIsSaved);
    }
  };

  const handleEditCaption = async () => {
    try {
      await updatePostMutation.mutateAsync({ postId, data: { caption: editCaption } });
      queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
      queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
      setEditCaptionOpen(false);
      toast({ title: "Caption updated" });
    } catch {
      toast({ title: "Failed to update caption", variant: "destructive" });
    }
  };

  const handleDeletePost = async () => {
    try {
      await deletePostMutation.mutateAsync({ postId });
      queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
      toast({ title: "Post deleted" });
      setLocation("/");
    } catch {
      toast({ title: "Failed to delete post", variant: "destructive" });
    }
  };

  const handleReport = async () => {
    try {
      await reportPostMutation.mutateAsync({ postId, data: { reason: reportReason } });
      setReportOpen(false);
      toast({ title: "Report submitted", description: "Thanks for keeping the community safe." });
    } catch {
      toast({ title: "Failed to submit report", variant: "destructive" });
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied!" });
  };

  if (postLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!post) return <div className="p-8 text-center text-muted-foreground">Post not found</div>;

  return (
    <>
      <div className="max-w-5xl mx-auto w-full pt-0 pb-20 md:pt-4 md:pb-8 sm:px-4">
        {/* Mobile back button */}
        <div className="flex items-center gap-2 p-3 md:hidden">
          <button onClick={() => setLocation("/")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        <div className="bg-card sm:border border-border sm:rounded-xl overflow-hidden flex flex-col md:flex-row md:min-h-[600px] md:max-h-[85vh]">
          {/* Media Carousel */}
          <div
            className="relative w-full md:w-[60%] bg-black flex items-center justify-center md:min-h-[500px] overflow-hidden"
            onTouchStart={(e) => { mediaTouchStartX.current = e.touches[0].clientX; mediaTouchEndX.current = null; }}
            onTouchMove={(e) => { mediaTouchEndX.current = e.touches[0].clientX; }}
            onTouchEnd={() => {
              if (mediaTouchStartX.current === null || mediaTouchEndX.current === null) return;
              const diff = mediaTouchStartX.current - mediaTouchEndX.current;
              if (diff > 40 && mediaIndex < allMediaUrls.length - 1) setMediaIndex(i => i + 1);
              else if (diff < -40 && mediaIndex > 0) setMediaIndex(i => i - 1);
              mediaTouchStartX.current = null; mediaTouchEndX.current = null;
            }}
          >
            <div
              className="flex w-full h-full transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${mediaIndex * 100}%)` }}
            >
              {allMediaUrls.map((url, i) => (
                <div key={i} className="w-full flex-none flex items-center justify-center">
                  {post.mediaType === "video" && i === 0 ? (
                    <video src={url} controls className="w-full h-full object-contain max-h-[60vw] md:max-h-full" />
                  ) : (
                    <img src={url} alt={post.altText ?? post.caption ?? ""} className="w-full h-full object-contain max-h-[100vw] md:max-h-full" draggable={false} />
                  )}
                </div>
              ))}
            </div>
            {mediaIndex > 0 && (
              <button onClick={() => setMediaIndex(i => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 z-10">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {mediaIndex < allMediaUrls.length - 1 && (
              <button onClick={() => setMediaIndex(i => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 z-10">
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
            {allMediaUrls.length > 1 && (
              <>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {allMediaUrls.map((_, i) => (
                    <button key={i} onClick={() => setMediaIndex(i)} className={cn("rounded-full transition-all duration-200", i === mediaIndex ? "w-2 h-2 bg-white" : "w-1.5 h-1.5 bg-white/50 hover:bg-white/75")} />
                  ))}
                </div>
                <div className="absolute top-3 right-3 bg-black/50 text-white text-xs font-medium px-2 py-0.5 rounded-full z-10">
                  {mediaIndex + 1}/{allMediaUrls.length}
                </div>
              </>
            )}
          </div>

          {/* Right panel */}
          <div className="w-full md:w-[40%] flex flex-col border-t md:border-t-0 md:border-l border-border bg-card">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <Link href={`/profile/${post.author.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
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
                  {post.location ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground leading-tight">
                      <MapPin className="h-2.5 w-2.5" />
                      <span>{post.location}</span>
                    </div>
                  ) : post.author.fullName ? (
                    <div className="text-xs text-muted-foreground leading-tight">{post.author.fullName}</div>
                  ) : null}
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
                        onClick={() => { setEditCaption(post.caption ?? ""); setEditCaptionOpen(true); }}
                      >
                        <Pencil className="h-4 w-4" /> Edit caption
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                        onClick={() => setDeletePostOpen(true)}
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

            {/* Comments list */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 py-3 space-y-4">
                {/* Caption as first comment */}
                {post.caption && (
                  <div className="flex gap-3">
                    <Link href={`/profile/${post.author.username}`} className="shrink-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={post.author.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                          {post.author.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 text-sm leading-snug">
                      <Link href={`/profile/${post.author.username}`} className="font-semibold hover:underline mr-1.5">
                        {post.author.username}
                      </Link>
                      <span className="text-foreground/90">{post.caption}</span>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Comments */}
                {commentsLoading && !initialized ? (
                  <div className="space-y-3 py-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3 animate-pulse">
                        <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-muted rounded w-24" />
                          <div className="h-3 bg-muted rounded w-40" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : localComments.length === 0 ? (
                  <div className="py-6 text-center">
                    <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No comments yet</p>
                    <p className="text-xs text-muted-foreground/60">Be the first to comment!</p>
                  </div>
                ) : (
                  localComments.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      currentUserId={user?.id}
                      onDelete={handleDeleteComment}
                      onLike={handleLikeComment}
                      onReply={() => { inputRef.current?.focus(); }}
                    />
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>
            </ScrollArea>

            {/* Actions + Add Comment */}
            <div className="border-t border-border shrink-0">
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleLikePost}
                      className="hover:scale-110 transition-transform active:scale-95"
                    >
                      <Heart className={cn("h-6 w-6 transition-colors", localIsLiked ? "fill-red-500 text-red-500" : "text-foreground hover:text-muted-foreground")} />
                    </button>
                    {!commentsDisabled && (
                      <button
                        onClick={() => inputRef.current?.focus()}
                        className="hover:text-muted-foreground transition-colors"
                      >
                        <MessageCircle className="h-6 w-6" />
                      </button>
                    )}
                    <button className="hover:text-muted-foreground transition-colors">
                      <Send className="h-6 w-6" />
                    </button>
                  </div>
                  <button onClick={handleSavePost} className="hover:scale-110 transition-transform active:scale-95">
                    <Bookmark className={cn("h-6 w-6 transition-colors", localIsSaved ? "fill-foreground text-foreground" : "hover:text-muted-foreground")} />
                  </button>
                </div>

                {localLikesCount > 0 && (
                  <div className="font-semibold text-sm mb-1">
                    {localLikesCount.toLocaleString()} {localLikesCount === 1 ? "like" : "likes"}
                  </div>
                )}
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                </div>
              </div>

              {commentsDisabled ? (
                <div className="flex items-center gap-1.5 px-4 py-3 border-t border-border text-xs text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Comments are disabled
                </div>
              ) : (
                <form onSubmit={handleAddComment} className="flex items-center gap-2 px-4 py-2 border-t border-border">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={user?.avatarUrl || undefined} />
                    <AvatarFallback className="text-xs bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                      {user?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Input
                    ref={inputRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 border-none focus-visible:ring-0 shadow-none px-0 h-9 text-sm bg-transparent placeholder:text-muted-foreground/60"
                  />
                  {commentText.trim() && (
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={createCommentMutation.isPending}
                      className="text-primary font-semibold hover:bg-transparent hover:text-primary/80 px-0 shrink-0"
                    >
                      Post
                    </Button>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Caption Dialog */}
      <Dialog open={editCaptionOpen} onOpenChange={setEditCaptionOpen}>
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
            <Button variant="ghost" onClick={() => setEditCaptionOpen(false)}>Cancel</Button>
            <Button onClick={handleEditCaption} disabled={updatePostMutation.isPending}>
              {updatePostMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Post Confirm */}
      <AlertDialog open={deletePostOpen} onOpenChange={setDeletePostOpen}>
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
              onClick={handleDeletePost}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePostMutation.isPending ? "Deleting..." : "Delete"}
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
            disabled={!reportReason || reportPostMutation.isPending}
            onClick={handleReport}
          >
            {reportPostMutation.isPending ? "Submitting..." : "Submit report"}
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

function CommentRow({
  comment,
  currentUserId,
  onDelete,
  onLike,
  onReply,
}: {
  comment: CommentWithOptimistic;
  currentUserId?: string;
  onDelete: (id: string) => void;
  onLike: (id: string, isLiked: boolean) => void;
  onReply: () => void;
}) {
  const isOwn = comment.author?.id === currentUserId;

  return (
    <div className={cn("flex gap-3 group", comment.pending && "opacity-60")}>
      <Link href={`/profile/${comment.author?.username}`} className="shrink-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author?.avatarUrl || undefined} />
          <AvatarFallback className="text-xs bg-gradient-to-br from-violet-400 to-indigo-400 text-white">
            {comment.author?.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0 text-sm leading-snug">
        <div>
          <Link href={`/profile/${comment.author?.username}`} className="font-semibold hover:underline mr-1.5">
            {comment.author?.username}
          </Link>
          <span className="text-foreground/90 break-words">{comment.text}</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
          {comment.likesCount > 0 && (
            <span>{comment.likesCount} {comment.likesCount === 1 ? "like" : "likes"}</span>
          )}
          <button
            onClick={onReply}
            className="font-semibold hover:text-foreground transition-colors"
          >
            Reply
          </button>
          {isOwn && !comment.pending && (
            <button
              onClick={() => onDelete(comment.id)}
              className="font-semibold text-destructive/70 hover:text-destructive transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => onLike(comment.id, comment.isLiked)}
        className="shrink-0 self-start mt-1 hover:scale-110 transition-transform"
      >
        <Heart className={cn("h-3.5 w-3.5 transition-colors", comment.isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-foreground")} />
      </button>
    </div>
  );
}
