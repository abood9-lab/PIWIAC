import { useState } from "react";
import { useGetExplorePosts, useSearchUsers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, Heart, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: exploreData, isLoading: exploreLoading } = useGetExplorePosts();
  const { data: searchResults, isLoading: searchLoading } = useSearchUsers(
    { q: searchQuery },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: searchQuery.length > 0 } as any }
  );

  return (
    <div className="max-w-4xl mx-auto w-full pt-4 pb-20 md:pb-8 px-2 sm:px-4">
      <div className="mb-6 relative max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search users..." 
          className="pl-10 bg-secondary border-none h-10 rounded-xl"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {searchQuery ? (
        <div className="space-y-2 max-w-md mx-auto">
          {searchLoading ? (
            <div className="text-center p-4 text-muted-foreground">Searching...</div>
          ) : searchResults && searchResults.length > 0 ? (
            searchResults.map((user) => (
              <Link 
                key={user.id} 
                href={`/profile/${user.username}`}
                className="flex items-center gap-3 p-3 hover:bg-secondary rounded-lg transition-colors"
              >
                <Avatar>
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold text-sm">{user.username}</div>
                  <div className="text-xs text-muted-foreground">{user.fullName}</div>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-center p-4 text-muted-foreground">No users found</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          {exploreLoading ? (
            <div className="col-span-3 text-center p-8 text-muted-foreground">Loading...</div>
          ) : exploreData?.posts?.map((post) => (
            <Link key={post.id} href={`/post/${post.id}`}>
              <div className="relative aspect-square group cursor-pointer bg-secondary overflow-hidden">
                {post.mediaType === "video" ? (
                  <video src={post.mediaUrl} className="w-full h-full object-cover" />
                ) : (
                  <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
                )}
                
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-semibold">
                  <div className="flex items-center gap-2">
                    <Heart className="w-5 h-5 fill-white" />
                    <span>{post.likesCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 fill-white" />
                    <span>{post.commentsCount}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
