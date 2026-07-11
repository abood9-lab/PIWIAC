import { useState } from "react";
import { useGetFeed, useGetStoriesFeed } from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PostCard } from "@/components/post-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import { StoryViewer } from "@/components/StoryViewer";
import { StoryCreator } from "@/components/StoryCreator";
import { SuggestedUsers } from "@/components/SuggestedUsers";
import { useAuth } from "@/lib/auth";
import { Plus, Play } from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: feedData, isLoading: feedLoading } = useGetFeed();
  const { data: storiesData, isLoading: storiesLoading } = useGetStoriesFeed();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUserIdx, setViewerUserIdx] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);

  // Separate own stories from others
  const myStories = storiesData?.find(s => s.user.id === user?.id);
  const otherStories = storiesData?.filter(s => s.user.id !== user?.id) ?? [];

  const openViewer = (globalIdx: number) => {
    setViewerUserIdx(globalIdx);
    setViewerOpen(true);
  };

  const openMyStoryViewer = () => {
    if (!storiesData) return;
    const myIdx = storiesData.findIndex(s => s.user.id === user?.id);
    if (myIdx >= 0) { setViewerUserIdx(myIdx); setViewerOpen(true); }
  };

  const getGlobalIdx = (userId: string) => {
    return storiesData?.findIndex(s => s.user.id === userId) ?? 0;
  };

  const handleStorySuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] });
  };

  return (
    <>
      <div className="flex gap-8 xl:gap-12 max-w-5xl mx-auto w-full pt-4 pb-20 md:pb-8 px-0 xl:px-4">
      <div className="flex-1 min-w-0 max-w-2xl mx-auto xl:mx-0 w-full">
        {/* Stories row */}
        {!storiesLoading && (
          <div className="mb-6 bg-card border-b sm:border border-border sm:rounded-lg p-4">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex w-max space-x-4">

                {/* My Story */}
                {myStories ? (
                  <button onClick={openMyStoryViewer} className="flex flex-col items-center gap-1 cursor-pointer group">
                    <div className="relative">
                      <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 to-fuchsia-600">
                        <Avatar className="h-16 w-16 border-2 border-background">
                          <AvatarImage src={user?.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-sm font-semibold">{user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-background">
                        <Play size={9} className="text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                    <span className="text-xs max-w-[70px] truncate text-muted-foreground">Your story</span>
                  </button>
                ) : (
                  <button onClick={() => setCreatorOpen(true)} className="flex flex-col items-center gap-1 cursor-pointer group">
                    <div className="relative">
                      <Avatar className="h-16 w-16 border-2 border-dashed border-border group-hover:border-primary transition-colors">
                        <AvatarImage src={user?.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-sm font-semibold">{user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                        <Plus size={11} className="text-primary-foreground" strokeWidth={3} />
                      </div>
                    </div>
                    <span className="text-xs max-w-[70px] truncate text-muted-foreground">Add story</span>
                  </button>
                )}

                {/* Other users' stories */}
                {otherStories.map((userStory) => (
                  <button key={userStory.user.id} onClick={() => openViewer(getGlobalIdx(userStory.user.id))}
                    className="flex flex-col items-center gap-1 cursor-pointer">
                    <div className={cn("p-[2px] rounded-full", userStory.hasUnviewed ? "bg-gradient-to-tr from-yellow-400 to-fuchsia-600" : "bg-border")}>
                      <Avatar className="h-16 w-16 border-2 border-background">
                        <AvatarImage src={userStory.user.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-sm font-semibold">{userStory.user.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </div>
                    <span className="text-xs max-w-[70px] truncate">{userStory.user.username}</span>
                  </button>
                ))}

                {/* Add story button (also shown if user has a story, to create another) */}
                {myStories && (
                  <button onClick={() => setCreatorOpen(true)} className="flex flex-col items-center gap-1 cursor-pointer group">
                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-border group-hover:border-primary transition-colors flex items-center justify-center">
                      <Plus size={22} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-xs text-muted-foreground">Add more</span>
                  </button>
                )}

              </div>
              <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>
          </div>
        )}

        {/* Feed */}
        <div className="space-y-4">
          {feedLoading ? (
            <div className="flex justify-center p-8 text-muted-foreground">Loading feed...</div>
          ) : feedData?.posts && feedData.posts.length > 0 ? (
            feedData.posts.map((post: Post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="text-center p-12 bg-card sm:rounded-lg border border-border">
              <h3 className="text-xl font-semibold mb-2">Welcome to Pixlr</h3>
              <p className="text-muted-foreground mb-4">Follow some users to see their posts here.</p>
              <Link href="/explore" className="text-primary font-semibold hover:underline">Explore users</Link>
            </div>
          )}
        </div>
      </div>

      {/* Suggested Users sidebar — desktop only */}
      <SuggestedUsers />
      </div>

      <AnimatePresence>
        {viewerOpen && storiesData && storiesData.length > 0 && (
          <StoryViewer userStories={storiesData} initialUserIndex={viewerUserIdx} onClose={() => setViewerOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {creatorOpen && (
          <StoryCreator onClose={() => setCreatorOpen(false)} onSuccess={handleStorySuccess} />
        )}
      </AnimatePresence>
    </>
  );
}
