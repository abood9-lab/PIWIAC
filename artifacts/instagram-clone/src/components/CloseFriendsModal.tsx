import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, UserCheck, UserPlus, Search, Loader2 } from "lucide-react";
import {
  useGetCloseFriends,
  useAddCloseFriend,
  useRemoveCloseFriend,
  useGetUserProfile,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useGetMe, useSearchUsers } from "@workspace/api-client-react";

interface CloseFriendsModalProps {
  onClose: () => void;
}

export function CloseFriendsModal({ onClose }: CloseFriendsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");

  const { data: closeFriends = [], isLoading: cfLoading } = useGetCloseFriends();
  const addMutation = useAddCloseFriend();
  const removeMutation = useRemoveCloseFriend();

  const closeFriendIds = new Set((closeFriends as any[]).map((f: any) => f.id));

  const handleAdd = async (userId: string) => {
    try {
      await addMutation.mutateAsync({ data: { userId } });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/close-friends"] });
      toast({ title: "Added to Close Friends ⭐" });
    } catch (e: any) {
      toast({ title: "Failed to add", description: e.message, variant: "destructive" });
    }
  };

  const handleRemove = async (friendId: string) => {
    try {
      await removeMutation.mutateAsync({ friendId });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/close-friends"] });
      toast({ title: "Removed from Close Friends" });
    } catch (e: any) {
      toast({ title: "Failed to remove", description: e.message, variant: "destructive" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", damping: 25 }}
        className="bg-background border border-border rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-500/15 flex items-center justify-center">
              <Star size={18} className="text-green-500 fill-green-500" />
            </div>
            <div>
              <h2 className="font-bold text-base">Close Friends</h2>
              <p className="text-xs text-muted-foreground">{(closeFriends as any[]).length} people</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-4 mt-3 mb-1 px-4 py-3 bg-green-500/8 border border-green-500/20 rounded-2xl shrink-0">
          <p className="text-xs text-green-700 dark:text-green-400 leading-relaxed">
            Only people on your close friends list can see your <strong>Close Friends</strong> stories and posts. They won't be notified when you add or remove them.
          </p>
        </div>

        {/* Current close friends */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {cfLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (closeFriends as any[]).length === 0 ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <Star size={28} className="text-green-500" />
              </div>
              <p className="font-semibold text-sm mb-1">No close friends yet</p>
              <p className="text-xs text-muted-foreground">Add people you follow to your close friends list below</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">Your close friends</p>
              {(closeFriends as any[]).map((friend: any) => (
                <div key={friend.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={friend.avatarUrl || undefined} />
                    <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-green-400 to-emerald-600 text-white">
                      {friend.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{friend.username}</div>
                    <div className="text-xs text-muted-foreground truncate">{friend.fullName}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Star size={14} className="text-green-500 fill-green-500" />
                    <button
                      onClick={() => handleRemove(friend.id)}
                      disabled={removeMutation.isPending}
                      className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Add from following - search */}
        <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
          <AddFromFollowing
            closeFriendIds={closeFriendIds}
            onAdd={handleAdd}
            isPending={addMutation.isPending}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddFromFollowing({
  closeFriendIds,
  onAdd,
  isPending,
}: {
  closeFriendIds: Set<number>;
  onAdd: (id: string) => void;
  isPending: boolean;
}) {
  const [query, setQuery] = useState("");
  const { data: searchResults } = (useGetMe as any)();

  return (
    <SearchFollowing
      closeFriendIds={closeFriendIds}
      onAdd={onAdd}
      isPending={isPending}
    />
  );
}

function SearchFollowing({
  closeFriendIds,
  onAdd,
  isPending,
}: {
  closeFriendIds: Set<number>;
  onAdd: (id: string) => void;
  isPending: boolean;
}) {
  const [query, setQuery] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results = [] } = useSearchUsers({ q: query }, { query: { enabled: query.length >= 1 } } as any);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Add people you follow</p>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm bg-muted rounded-xl border border-border focus:outline-none focus:ring-1 focus:ring-green-500 transition"
        />
      </div>
      {query.length >= 1 && (results as any[]).length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {(results as any[])
            .filter((u: any) => u.isFollowing)
            .map((user: any) => (
              <div key={user.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted/60 transition-colors">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs font-bold">{user.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium truncate">{user.username}</span>
                {closeFriendIds.has(user.id) ? (
                  <div className="flex items-center gap-1 text-green-500">
                    <UserCheck size={14} />
                    <span className="text-xs font-medium">Added</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onAdd(user.id)}
                    disabled={isPending}
                    className="flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700 disabled:opacity-50 transition-colors"
                  >
                    <UserPlus size={14} />
                    Add
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
