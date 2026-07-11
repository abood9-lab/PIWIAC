import { useState } from "react";
import { X, Grid3x3, Pin, Star, Clock, Archive, BellOff, Bell, ExternalLink, ChevronRight, Ban, ShieldOff, Timer } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ChatMessage } from "./MessageBubble";

interface OtherUser {
  id: string;
  username: string;
  fullName: string;
  avatarUrl?: string | null;
}

interface Props {
  otherUser: OtherUser;
  isOnline: boolean;
  disappearAfter: string | null;
  isMuted: boolean;
  isArchived: boolean;
  sharedMedia: ChatMessage[];
  pinnedMessages: ChatMessage[];
  starredMessages: ChatMessage[];
  myId: string;
  isBlocked: boolean;
  isBlockedBy: boolean;
  myTimeoutUntil: string | null;
  otherTimeoutUntil: string | null;
  onClose: () => void;
  onDisappearChange: (value: string | null) => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onNavigateToProfile: () => void;
  onViewMedia: (url: string, type: string) => void;
  onBlock: () => void;
  onUnblock: () => void;
  onTimeout: (duration: string | null) => void;
}

const DISAPPEAR_OPTIONS = [
  { label: "Off", value: null },
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
];

const TIMEOUT_OPTIONS = [
  { label: "Off", value: null },
  { label: "15 minutes", value: "15m" },
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
];

export function ConversationInfoPanel({
  otherUser, isOnline, disappearAfter, isMuted, isArchived,
  sharedMedia, pinnedMessages, starredMessages, myId,
  isBlocked, isBlockedBy, myTimeoutUntil, otherTimeoutUntil,
  onClose, onDisappearChange, onToggleMute, onToggleArchive,
  onNavigateToProfile, onViewMedia, onBlock, onUnblock, onTimeout,
}: Props) {
  const [section, setSection] = useState<"main" | "media" | "pinned" | "starred" | "disappear" | "restrict">("main");

  if (section === "media") {
    return (
      <PanelShell onBack={() => setSection("main")} onClose={onClose} title="Shared Media">
        {sharedMedia.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">No shared media yet</div>
        )}
        <div className="grid grid-cols-3 gap-1 p-1">
          {sharedMedia.map(m => (
            <button
              key={m.id}
              className="aspect-square rounded-lg overflow-hidden bg-secondary"
              onClick={() => m.mediaUrl && onViewMedia(m.mediaUrl, m.mediaType ?? "image")}
            >
              {m.mediaType === "video" ? (
                <video src={m.mediaUrl ?? ""} className="w-full h-full object-cover" />
              ) : (
                <img src={m.mediaUrl ?? ""} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      </PanelShell>
    );
  }

  if (section === "pinned") {
    return (
      <PanelShell onBack={() => setSection("main")} onClose={onClose} title="Pinned Messages">
        {pinnedMessages.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">No pinned messages</div>
        )}
        <div className="divide-y divide-border">
          {pinnedMessages.map(m => (
            <div key={m.id} className="px-4 py-3">
              <div className="text-[10px] text-muted-foreground mb-1">
                {m.senderId === myId ? "You" : otherUser.username} ·{" "}
                {format(new Date(m.createdAt), "MMM d, h:mm a")}
              </div>
              <p className="text-sm">{m.text ?? (m.mediaType ? `[${m.mediaType}]` : "")}</p>
            </div>
          ))}
        </div>
      </PanelShell>
    );
  }

  if (section === "starred") {
    return (
      <PanelShell onBack={() => setSection("main")} onClose={onClose} title="Starred Messages">
        {starredMessages.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">No starred messages</div>
        )}
        <div className="divide-y divide-border">
          {starredMessages.map(m => (
            <div key={m.id} className="px-4 py-3">
              <div className="text-[10px] text-muted-foreground mb-1">
                {m.senderId === myId ? "You" : otherUser.username} ·{" "}
                {format(new Date(m.createdAt), "MMM d, h:mm a")}
              </div>
              <p className="text-sm">{m.text ?? (m.mediaType ? `[${m.mediaType}]` : "")}</p>
            </div>
          ))}
        </div>
      </PanelShell>
    );
  }

  if (section === "disappear") {
    return (
      <PanelShell onBack={() => setSection("main")} onClose={onClose} title="Disappearing Messages">
        <div className="px-4 py-2 text-xs text-muted-foreground mb-2">
          Messages will automatically disappear after the set time once sent.
        </div>
        <div className="divide-y divide-border">
          {DISAPPEAR_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              className={cn(
                "flex items-center justify-between w-full px-4 py-3.5 text-sm transition-colors",
                disappearAfter === opt.value
                  ? "text-primary font-semibold"
                  : "hover:bg-secondary/60"
              )}
              onClick={() => { onDisappearChange(opt.value); setSection("main"); }}
            >
              <span>{opt.label}</span>
              {disappearAfter === opt.value && (
                <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs">✓</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </PanelShell>
    );
  }

  if (section === "restrict") {
    return (
      <PanelShell onBack={() => setSection("main")} onClose={onClose} title="Restrict Messages">
        <div className="px-4 py-2 text-xs text-muted-foreground mb-2">
          @{otherUser.username} won't be able to send you messages for the selected duration.
        </div>
        <div className="divide-y divide-border">
          {TIMEOUT_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              className={cn(
                "flex items-center justify-between w-full px-4 py-3.5 text-sm transition-colors",
                (otherTimeoutUntil ? true : false) === (opt.value !== null) && opt.value !== null
                  ? "text-primary font-semibold"
                  : opt.value === null && !otherTimeoutUntil
                  ? "text-primary font-semibold"
                  : "hover:bg-secondary/60"
              )}
              onClick={() => { onTimeout(opt.value); setSection("main"); }}
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </PanelShell>
    );
  }

  // Main section
  return (
    <PanelShell onBack={null} onClose={onClose} title="">
      {/* User hero */}
      <div className="flex flex-col items-center py-6 px-4 border-b border-border">
        <div className="relative mb-3">
          <Avatar className="h-20 w-20">
            <AvatarImage src={otherUser.avatarUrl || undefined} />
            <AvatarFallback className="text-2xl font-bold">
              {otherUser.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isOnline && (
            <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-card" />
          )}
        </div>
        <h2 className="font-bold text-lg">{otherUser.fullName || otherUser.username}</h2>
        <p className="text-sm text-muted-foreground">@{otherUser.username}</p>
        {isOnline && (
          <span className="text-xs text-green-500 mt-1 font-medium">Active now</span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-3 rounded-full gap-2 text-xs"
          onClick={onNavigateToProfile}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View Profile
        </Button>
      </div>

      {/* Quick action buttons */}
      <div className="flex gap-2 p-4 border-b border-border">
        <button
          onClick={onToggleMute}
          className={cn(
            "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-colors",
            isMuted ? "bg-primary/10 text-primary" : "bg-secondary hover:bg-secondary/80"
          )}
        >
          {isMuted ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={onToggleArchive}
          className={cn(
            "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-colors",
            isArchived ? "bg-primary/10 text-primary" : "bg-secondary hover:bg-secondary/80"
          )}
        >
          <Archive className="w-5 h-5" />
          {isArchived ? "Unarchive" : "Archive"}
        </button>
      </div>

      {/* Menu items */}
      <div className="divide-y divide-border">
        <InfoRow
          icon={<Grid3x3 className="w-5 h-5" />}
          label="Shared Media"
          badge={sharedMedia.length > 0 ? String(sharedMedia.length) : undefined}
          onClick={() => setSection("media")}
        />
        <InfoRow
          icon={<Pin className="w-5 h-5" />}
          label="Pinned Messages"
          badge={pinnedMessages.length > 0 ? String(pinnedMessages.length) : undefined}
          onClick={() => setSection("pinned")}
        />
        <InfoRow
          icon={<Star className="w-5 h-5" />}
          label="Starred Messages"
          badge={starredMessages.length > 0 ? String(starredMessages.length) : undefined}
          onClick={() => setSection("starred")}
        />
        <InfoRow
          icon={<Clock className="w-5 h-5" />}
          label="Disappearing Messages"
          value={DISAPPEAR_OPTIONS.find(o => o.value === disappearAfter)?.label ?? "Off"}
          onClick={() => setSection("disappear")}
        />
        <InfoRow
          icon={<Timer className="w-5 h-5" />}
          label="Restrict Messages"
          value={otherTimeoutUntil ? "Active" : "Off"}
          onClick={() => setSection("restrict")}
        />
      </div>

      {/* Danger zone */}
      <div className="divide-y divide-border border-t border-border mt-2">
        {isBlocked ? (
          <button
            className="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-secondary/60 transition-colors text-left"
            onClick={onUnblock}
          >
            <ShieldOff className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm font-medium">Unblock @{otherUser.username}</span>
          </button>
        ) : (
          <button
            className="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-destructive/10 transition-colors text-left"
            onClick={onBlock}
          >
            <Ban className="w-5 h-5 text-destructive shrink-0" />
            <span className="flex-1 text-sm font-medium text-destructive">Block @{otherUser.username}</span>
          </button>
        )}
      </div>
      {isBlockedBy && (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          You can't message this user right now.
        </div>
      )}
    </PanelShell>
  );
}

function PanelShell({
  children, title, onBack, onClose,
}: {
  children: React.ReactNode;
  title: string;
  onBack: (() => void) | null;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
        )}
        <h3 className={cn("font-semibold text-sm flex-1", !onBack && "text-center")}>
          {title || "Details"}
        </h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function InfoRow({
  icon, label, badge, value, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-secondary/60 transition-colors"
      onClick={onClick}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium text-left">{label}</span>
      {badge && (
        <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      {value && (
        <span className="text-xs text-muted-foreground">{value}</span>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}
