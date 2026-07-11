import { useGetSuggestedUsers, useFollowUser, getGetSuggestedUsersQueryKey } from "@workspace/api-client-react";
import type { UserSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

type SuggestedUser = UserSummary & { mutualCount?: number };

function SuggestedUserRow({ user, onFollowed }: { user: SuggestedUser; onFollowed: (id: string) => void }) {
  const followMutation = useFollowUser();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 py-2">
      <Link href={`/profile/${user.username}`} className="shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarImage src={user.avatarUrl ?? undefined} />
          <AvatarFallback className="text-xs font-semibold">
            {user.username[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/profile/${user.username}`} className="block">
          <p className="text-sm font-semibold truncate hover:underline leading-tight">
            {user.username}
          </p>
          <p className="text-xs text-muted-foreground truncate leading-tight">
            {user.mutualCount && user.mutualCount > 0
              ? `${user.mutualCount} mutual${user.mutualCount > 1 ? "s" : ""}`
              : user.fullName}
          </p>
        </Link>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs font-semibold text-primary"
          disabled={followMutation.isPending}
          onClick={() => {
            followMutation.mutate(
              { username: user.username },
              { onSuccess: () => onFollowed(user.id) }
            );
          }}
        >
          Follow
        </Button>
        <span className="text-muted-foreground/50 text-xs">·</span>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function SuggestedUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: suggestions, isLoading } = useGetSuggestedUsers();

  const handleFollowed = () => {
    queryClient.invalidateQueries({ queryKey: getGetSuggestedUsersQueryKey() });
  };

  if (isLoading || !suggestions || suggestions.length === 0) return null;

  return (
    <div className="w-80 shrink-0 hidden xl:block">
      <div className="sticky top-8 space-y-6">
        {/* Current user */}
        {user && (
          <div className="flex items-center gap-3">
            <Link href={`/profile/${user.username}`}>
              <Avatar className="h-11 w-11">
                <AvatarImage src={user.avatarUrl ?? undefined} />
                <AvatarFallback className="font-semibold">
                  {user.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/profile/${user.username}`}>
                <p className="text-sm font-semibold truncate hover:underline">{user.username}</p>
              </Link>
              <p className="text-xs text-muted-foreground truncate">{user.fullName}</p>
            </div>
          </div>
        )}

        {/* Suggested users */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Suggested for you
            </span>
            <Link href="/explore" className="text-xs font-semibold hover:text-muted-foreground transition-colors">
              See all
            </Link>
          </div>

          <div className="space-y-1">
            {(suggestions as SuggestedUser[]).slice(0, 5).map(u => (
              <SuggestedUserRow key={u.id} user={u} onFollowed={handleFollowed} />
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          © 2025 Pixlr
        </p>
      </div>
    </div>
  );
}
