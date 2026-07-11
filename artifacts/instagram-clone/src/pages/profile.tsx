import { useState, useRef } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetUserProfile,
  useGetUserPosts,
  useFollowUser,
  useUnfollowUser,
  useGetUserHighlights,
  useDeleteHighlight,
  useGetFollowers,
  useGetFollowing,
  useUploadAvatar,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import type { Highlight, UserSummary } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Heart,
  MessageCircle,
  Settings,
  Grid3X3,
  Bookmark,
  Plus,
  X,
  Sparkles,
  Play,
  Images,
  Clapperboard,
  Tag,
  Camera,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AnimatePresence, motion } from "framer-motion";
import { StoryViewer } from "@/components/StoryViewer";
import { StoryCreator } from "@/components/StoryCreator";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function UserListDialog({
  open,
  onClose,
  title,
  users,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  users: UserSummary[];
  isLoading: boolean;
}) {
  const [, setLocation] = useLocation();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-center text-base">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-11 h-11 rounded-full bg-muted shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-muted rounded w-28" />
                    <div className="h-3 bg-muted rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No users yet</div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => (
                <button
                  key={u.id}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => { onClose(); setLocation(`/profile/${u.username}`); }}
                >
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarImage src={u.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                      {u.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{u.username}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.fullName}</div>
                  </div>
                  {u.isFollowing ? (
                    <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <UserPlus className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function Profile() {
  const [, params] = useRoute("/profile/:username");
  const username = params?.username || "";
  const queryClient = useQueryClient();
  const { user: me, updateUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading: profileLoading } = useGetUserProfile(username);
  const { data: postsData, isLoading: postsLoading } = useGetUserPosts(username);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: highlights = [] } = useGetUserHighlights(username, { query: { enabled: !!username } } as any);
  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();
  const deleteHighlightMutation = useDeleteHighlight();
  const uploadAvatarMutation = useUploadAvatar();

  const [highlightViewer, setHighlightViewer] = useState<Highlight | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: followers = [], isLoading: followersLoading } = useGetFollowers(username, { query: { enabled: followersOpen } } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: following = [], isLoading: followingLoading } = useGetFollowing(username, { query: { enabled: followingOpen } } as any);

  const isMe = profile?.isMe;
  const allPosts = postsData?.posts ?? [];
  const videoPosts = allPosts.filter((p) => p.mediaType === "video");
  const typedHighlights = highlights as Highlight[];

  const handleFollowToggle = async () => {
    if (!profile) return;
    try {
      if (profile.isFollowing) await unfollowMutation.mutateAsync({ username });
      else await followMutation.mutateAsync({ username });
      queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey(username) });
    } catch { /* ignore */ }
  };

  const handleDeleteHighlight = async (id: string) => {
    try {
      await deleteHighlightMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: [`/api/stories/highlights/user/${username}`] });
      toast({ title: "Highlight deleted" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await uploadAvatarMutation.mutateAsync({ data: { data: reader.result as string, mimeType: file.type } });
        if (me) updateUser({ ...me, avatarUrl: res.url });
        queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey(username) });
        toast({ title: "Photo updated" });
      } catch {
        toast({ title: "Failed to update photo", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  if (profileLoading) return (
    <div className="max-w-4xl mx-auto w-full pt-16 flex flex-col items-center gap-4">
      <div className="w-24 h-24 rounded-full bg-muted animate-pulse" />
      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
      <div className="h-3 w-48 bg-muted rounded animate-pulse" />
    </div>
  );
  if (!profile) return <div className="text-center p-8">Profile not found</div>;

  return (
    <div className="max-w-4xl mx-auto w-full pt-4 pb-20 md:pb-8 sm:px-4">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-12 p-4 sm:p-8 border-b border-border">

        {/* Avatar with camera overlay for own profile */}
        <div className="relative group shrink-0">
          <Avatar className="w-24 h-24 sm:w-36 sm:h-36 ring-2 ring-border">
            <AvatarImage src={profile.avatarUrl || undefined} />
            <AvatarFallback className="text-4xl font-bold bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              {profile.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isMe && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAvatarMutation.isPending}
              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {uploadAvatarMutation.isPending
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera className="h-6 w-6 text-white" />}
            </button>
          )}
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col items-center sm:items-start gap-4 w-full">

          {/* Username + Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <h2 className="text-xl font-semibold">{profile.username}</h2>
            {isMe ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" asChild className="h-8 px-4 font-semibold text-sm">
                  <Link href="/settings">Edit Profile</Link>
                </Button>
                <Button variant="ghost" size="icon" asChild>
                  <Link href="/settings"><Settings className="w-5 h-5" /></Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  onClick={handleFollowToggle}
                  variant={profile.isFollowing ? "secondary" : "default"}
                  className="h-8 px-6 font-semibold text-sm flex-1 sm:flex-none"
                  disabled={followMutation.isPending || unfollowMutation.isPending}
                >
                  {profile.isFollowing ? "Following" : "Follow"}
                </Button>
                <Button variant="secondary" asChild className="h-8 px-4 font-semibold text-sm flex-1 sm:flex-none">
                  <Link href="/messages">Message</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 sm:gap-10 text-sm">
            <div><span className="font-semibold">{profile.postsCount}</span> <span className="text-muted-foreground sm:text-foreground">posts</span></div>
            <button
              onClick={() => setFollowersOpen(true)}
              className="hover:opacity-70 transition-opacity text-left"
            >
              <span className="font-semibold">{profile.followersCount.toLocaleString()}</span>{" "}
              <span className="text-muted-foreground sm:text-foreground">followers</span>
            </button>
            <button
              onClick={() => setFollowingOpen(true)}
              className="hover:opacity-70 transition-opacity text-left"
            >
              <span className="font-semibold">{profile.followingCount.toLocaleString()}</span>{" "}
              <span className="text-muted-foreground sm:text-foreground">following</span>
            </button>
          </div>

          {/* Bio */}
          <div className="text-sm text-center sm:text-left max-w-xs sm:max-w-none">
            {profile.fullName && <div className="font-semibold">{profile.fullName}</div>}
            {profile.bio && (
              <div className="whitespace-pre-wrap mt-0.5 text-foreground/90">{profile.bio}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Highlights ──────────────────────────────────────── */}
      {(typedHighlights.length > 0 || isMe) && (
        <div className="px-4 py-4 border-b border-border overflow-x-auto">
          <div className="flex gap-4 w-max">
            {isMe && (
              <button onClick={() => setCreatorOpen(true)} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-border group-hover:border-primary transition-colors flex items-center justify-center">
                  <Plus size={22} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-center">New</span>
              </button>
            )}
            {typedHighlights.map((h) => (
              <div key={h.id} className="flex flex-col items-center gap-1.5 cursor-pointer group relative" onClick={() => setHighlightViewer(h)}>
                {isMe && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteHighlight(h.id); }}
                    className="absolute -top-1 -right-1 z-10 w-5 h-5 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex shadow"
                  >
                    <X size={10} className="text-white" />
                  </button>
                )}
                <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 to-fuchsia-600">
                  <div className="w-full h-full rounded-full overflow-hidden border-2 border-background bg-muted">
                    {h.stories[0]?.mediaUrl ? (
                      <img src={h.stories[0].mediaUrl} alt={h.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 flex items-center justify-center">
                        <Sparkles size={20} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-xs max-w-[70px] truncate text-center">{h.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Highlight viewer ─────────────────────────────────── */}
      <AnimatePresence>
        {highlightViewer && highlightViewer.stories.length > 0 && (
          <StoryViewer
            userStories={[{ user: { id: profile.id, username: profile.username, fullName: profile.fullName, avatarUrl: profile.avatarUrl ?? null, isFollowing: profile.isFollowing }, stories: highlightViewer.stories, hasUnviewed: false }]}
            initialUserIndex={0}
            onClose={() => setHighlightViewer(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {creatorOpen && (
          <StoryCreator onClose={() => setCreatorOpen(false)} onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/stories/highlights/user/${username}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
          }} />
        )}
      </AnimatePresence>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="w-full justify-center h-12 bg-transparent border-b border-border rounded-none p-0 gap-0">
          {[
            { value: "posts", icon: Grid3X3, label: "Posts" },
            { value: "reels", icon: Clapperboard, label: "Reels" },
            ...(isMe ? [{ value: "saved", icon: Bookmark, label: "Saved" }] : []),
            { value: "tagged", icon: Tag, label: "Tagged" },
          ].map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-1 sm:flex-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-t-2 data-[state=active]:border-foreground rounded-none px-4 sm:px-6 h-full font-semibold uppercase tracking-widest text-xs gap-2 text-muted-foreground data-[state=active]:text-foreground"
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Posts grid */}
        <TabsContent value="posts" className="mt-0">
          {postsLoading ? (
            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 mt-0.5">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse" />
              ))}
            </div>
          ) : allPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Grid3X3 className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">No Posts Yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 mt-0.5">
              {allPosts.map((post) => {
                const isCarousel = (post.additionalMediaUrls?.length ?? 0) > 0;
                return (
                  <Link key={post.id} href={`/post/${post.id}`}>
                    <div className="relative aspect-square group cursor-pointer bg-muted overflow-hidden">
                      {post.mediaType === "video" ? (
                        <video src={post.mediaUrl} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-5 text-white font-semibold">
                        <div className="flex items-center gap-1.5">
                          <Heart className="w-5 h-5 fill-white" />
                          <span>{post.likesCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MessageCircle className="w-5 h-5 fill-white" />
                          <span>{post.commentsCount}</span>
                        </div>
                      </div>

                      {/* Indicators */}
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        {post.mediaType === "video" && (
                          <div className="bg-black/60 rounded-full p-1">
                            <Play className="w-3 h-3 text-white fill-white" />
                          </div>
                        )}
                        {isCarousel && (
                          <div className="bg-black/60 rounded-full p-1">
                            <Images className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Reels tab */}
        <TabsContent value="reels" className="mt-0">
          {videoPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Clapperboard className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">No Reels Yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 mt-0.5">
              {videoPosts.map((post) => (
                <Link key={post.id} href={`/post/${post.id}`}>
                  <div className="relative aspect-[9/16] group cursor-pointer bg-muted overflow-hidden">
                    <video src={post.mediaUrl} className="w-full h-full object-cover" muted />
                    <div className="absolute inset-0 bg-black/20 flex items-end p-2">
                      <div className="flex items-center gap-1 text-white text-xs font-semibold">
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>{post.likesCount}</span>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-5 text-white font-semibold">
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-5 h-5 fill-white" />
                        <span>{post.likesCount}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Saved (own profile only) */}
        {isMe && (
          <TabsContent value="saved" className="mt-0">
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Bookmark className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">Only you can see what you've saved</p>
            </div>
          </TabsContent>
        )}

        {/* Tagged */}
        <TabsContent value="tagged" className="mt-0">
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Tag className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">Photos of you</p>
            <p className="text-xs">When people tag you in photos, they'll appear here.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Followers / Following dialogs ─────────────────────── */}
      <UserListDialog
        open={followersOpen}
        onClose={() => setFollowersOpen(false)}
        title="Followers"
        users={followers as UserSummary[]}
        isLoading={followersLoading}
      />
      <UserListDialog
        open={followingOpen}
        onClose={() => setFollowingOpen(false)}
        title="Following"
        users={following as UserSummary[]}
        isLoading={followingLoading}
      />
    </div>
  );
}
