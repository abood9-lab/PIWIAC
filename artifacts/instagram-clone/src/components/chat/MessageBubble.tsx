import { useState, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ReactionPicker } from "./ReactionPicker";
import { MediaViewer } from "./MediaViewer";
import { VoicePlayer } from "./VoicePlayer";
import {
  Check, CheckCheck, Pencil, Trash2, Pin, Star,
  Reply, Smile, Copy, Forward, CornerUpRight, Camera, Eye, EyeOff, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  fileName?: string | null;
  isRead: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  isForwarded?: boolean;
  reactions: Record<string, string[]>;
  isPinned: boolean;
  starredBy: string[];
  clientId: string | null;
  replyToId: string | null;
  replyTo: { id: string; senderId: string; text: string | null; mediaType: string | null } | null;
  createdAt: string;
  updatedAt: string;
  status?: "sending" | "sent" | "failed";
  // Snap fields
  isSnap?: boolean;
  viewOnce?: boolean;
  viewsLeft?: number | null;
  viewedBy?: string[];
}

interface Props {
  msg: ChatMessage;
  isMe: boolean;
  isLast: boolean;
  isLastMine: boolean;
  showAvatar: boolean;
  isGroupEnd: boolean;
  otherUserAvatarUrl?: string;
  otherUserUsername: string;
  myId: string;
  onReact: (msgId: string, emoji: string) => void;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msgId: string) => void;
  onPin: (msgId: string) => void;
  onStar: (msgId: string) => void;
  onForward: (msg: ChatMessage) => void;
}

function fmt(dateStr: string) {
  return format(new Date(dateStr), "h:mm a");
}

const QUICK_REACTIONS = ["❤️", "👍", "😂", "🔥", "😮", "😢"];

export function MessageBubble({
  msg, isMe, isLast, isLastMine, showAvatar, isGroupEnd,
  otherUserAvatarUrl, otherUserUsername, myId,
  onReact, onReply, onEdit, onDelete, onPin, onStar, onForward,
}: Props) {
  const [showReactions, setShowReactions] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: string } | null>(null);
  // Snap state
  const [snapRevealedUrl, setSnapRevealedUrl] = useState<string | null>(null);
  const [snapOpening, setSnapOpening] = useState(false);
  const [snapViewsLeft, setSnapViewsLeft] = useState<number | null>(msg.viewsLeft ?? null);
  const snapOpened = snapRevealedUrl !== null;

  const BASE_URL = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const openSnap = useCallback(async () => {
    if (snapOpening || snapOpened) return;
    setSnapOpening(true);
    try {
      const token = localStorage.getItem("pixlr_token") ?? "";
      const r = await fetch(`${BASE_URL}/api/messages/${msg.id}/snap-viewed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (r.ok) {
        const data = await r.json();
        setSnapRevealedUrl(data.mediaUrl ?? null);
        setSnapViewsLeft(data.viewsLeft ?? null);
      }
    } catch {}
    setSnapOpening(false);
  }, [msg.id, snapOpening, snapOpened, BASE_URL]);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeTriggered = useRef(false);

  const isStarredByMe = msg.starredBy.includes(myId);
  const reactionEntries = Object.entries(msg.reactions ?? {}).filter(([, users]) => users.length > 0);

  /* ── Touch: long-press → action sheet, swipe → reply ── */
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!swipeTriggered.current) setShowMobileSheet(true);
    }, 480);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dy > 20) return;
    const swipeDir = isMe ? -1 : 1;
    const delta = dx * swipeDir;
    if (delta > 5) { setIsSwiping(true); setSwipeX(Math.min(delta, 80)); }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (swipeX >= 55) { swipeTriggered.current = true; onReply(msg); }
    setIsSwiping(false);
    setSwipeX(0);
  };

  if (msg.isDeleted) {
    return (
      <div className={cn("flex items-end gap-2 mb-1", isMe ? "justify-end" : "justify-start")}>
        {!isMe && <div className="w-7 shrink-0" />}
        <div className="px-4 py-2 text-xs text-muted-foreground italic bg-secondary/50 rounded-2xl border border-border/50">
          Message deleted
        </div>
      </div>
    );
  }

  const isVoice = msg.mediaType === "voice" || msg.mediaType?.startsWith("audio/");

  return (
    <>
      {mediaViewer && (
        <MediaViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />
      )}

      {/* Forwarded badge */}
      {msg.isForwarded && (
        <div className={cn("flex items-center gap-1 mb-0.5 px-1", isMe ? "justify-end" : "justify-start")}>
          {!isMe && <div className="w-7 shrink-0" />}
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Forward className="w-3 h-3" /> Forwarded
          </span>
        </div>
      )}

      {/* Reply context */}
      {msg.replyTo && (
        <div className={cn("flex mb-0.5", isMe ? "justify-end" : "justify-start")}>
          {!isMe && <div className="w-7 shrink-0" />}
          <div className={cn(
            "max-w-[65%] px-3 py-1.5 rounded-xl border-l-2 border-primary bg-secondary/50 text-xs text-muted-foreground",
            isMe ? "mr-2" : "ml-9"
          )}>
            <div className="font-medium text-primary text-[10px] mb-0.5">
              {msg.replyTo.senderId === myId ? "You" : otherUserUsername}
            </div>
            {msg.replyTo.text && <p className="truncate">{msg.replyTo.text}</p>}
            {!msg.replyTo.text && msg.replyTo.mediaType && <p className="italic">[{msg.replyTo.mediaType}]</p>}
          </div>
        </div>
      )}

      {/* Row */}
      <div
        className={cn(
          "flex items-end gap-2 relative",
          isMe ? "justify-end" : "justify-start",
          !isGroupEnd ? "mb-0.5" : "mb-2"
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator */}
        {isSwiping && swipeX > 10 && (
          <div className={cn(
            "absolute flex items-center justify-center w-7 h-7 rounded-full bg-secondary/80",
            isMe ? "left-1" : "right-1",
          )} style={{ transform: `scale(${0.8 + (swipeX / 80) * 0.4})` }}>
            <CornerUpRight className="w-3.5 h-3.5 text-foreground" />
          </div>
        )}

        {/* Avatar (other user) */}
        {!isMe && (
          <div className="w-7 shrink-0 self-end">
            {showAvatar && (
              <Avatar className="h-7 w-7">
                <AvatarImage src={otherUserAvatarUrl} />
                <AvatarFallback className="text-xs">{otherUserUsername[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            )}
          </div>
        )}

        {/*
          ┌─────────────────────────────────────────────┐
          │  group/bub — hover zone that wraps BOTH     │
          │  the action bar AND the bubble so moving    │
          │  the mouse between them doesn't close it    │
          └─────────────────────────────────────────────┘
        */}
        <div
          className={cn(
            "group/bub relative flex flex-col gap-0.5 max-w-[72%] sm:max-w-[65%] transition-transform",
            isMe ? "items-end" : "items-start",
          )}
          style={isSwiping ? {
            transform: `translateX(${isMe ? -swipeX * 0.4 : swipeX * 0.4}px)`,
            transition: "none",
          } : { transition: "transform 0.2s ease" }}
        >
          {/* ── Desktop action bar — floats above bubble, stays inside group/bub ── */}
          <div className={cn(
            "absolute bottom-full mb-1 z-20 hidden sm:flex items-center gap-0.5",
            "bg-card border border-border shadow-lg rounded-full px-1.5 py-1",
            // Invisible until group-hover; stays mounted so mouse can move to it freely
            "opacity-0 pointer-events-none group-hover/bub:opacity-100 group-hover/bub:pointer-events-auto",
            "transition-opacity duration-100",
            isMe ? "right-0" : "left-0",
          )}>
            {/* Emoji react */}
            <div className="relative">
              <button
                onClick={() => setShowReactions(v => !v)}
                className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
              {showReactions && (
                <ReactionPicker
                  align={isMe ? "right" : "left"}
                  onSelect={emoji => { onReact(msg.id, emoji); setShowReactions(false); }}
                  onClose={() => setShowReactions(false)}
                />
              )}
            </div>

            <ActionBtn title="Reply" onClick={() => onReply(msg)}><Reply className="w-3.5 h-3.5" /></ActionBtn>
            <ActionBtn title="Forward" onClick={() => onForward(msg)}><Forward className="w-3.5 h-3.5" /></ActionBtn>
            {msg.text && (
              <ActionBtn title="Copy" onClick={() => navigator.clipboard.writeText(msg.text!)}>
                <Copy className="w-3.5 h-3.5" />
              </ActionBtn>
            )}
            <ActionBtn
              title={isStarredByMe ? "Unstar" : "Star"}
              onClick={() => onStar(msg.id)}
              className={isStarredByMe ? "text-yellow-500" : ""}
            >
              <Star className={cn("w-3.5 h-3.5", isStarredByMe && "fill-yellow-500")} />
            </ActionBtn>
            <ActionBtn
              title={msg.isPinned ? "Unpin" : "Pin"}
              onClick={() => onPin(msg.id)}
              className={msg.isPinned ? "text-primary" : ""}
            >
              <Pin className={cn("w-3.5 h-3.5", msg.isPinned && "fill-primary")} />
            </ActionBtn>
            {isMe && msg.text && !msg.mediaUrl && (
              <ActionBtn title="Edit" onClick={() => onEdit(msg)}><Pencil className="w-3.5 h-3.5" /></ActionBtn>
            )}
            {isMe && (
              <ActionBtn title="Delete" onClick={() => onDelete(msg.id)} className="text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </ActionBtn>
            )}
          </div>

          {/* ── Bubble content ── */}

          {/* Voice */}
          {isVoice && msg.mediaUrl && <VoicePlayer url={msg.mediaUrl} isMe={isMe} />}

          {/* Snap bubble */}
          {msg.isSnap && !isVoice && (
            <>
              {isMe ? (
                // Sender sees a compact "sent snap" indicator
                <div className="rounded-2xl overflow-hidden max-w-[200px] bg-gradient-to-br from-yellow-400/20 to-yellow-600/10 border border-yellow-400/30 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-yellow-400/20 flex items-center justify-center shrink-0">
                    <Camera className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-yellow-400">سناب أُرسل</p>
                    <p className="text-[10px] text-white/50 mt-0.5">
                      {msg.viewsLeft === 0 ? "انتهت مرات الفتح" :
                       msg.viewsLeft !== null ? `${msg.viewsLeft} مرة متبقية` :
                       msg.viewOnce ? "مرة واحدة فقط" : "غير محدود"}
                    </p>
                  </div>
                </div>
              ) : snapOpened && snapRevealedUrl ? (
                // Opened snap — show media
                <div className="rounded-2xl overflow-hidden max-w-[260px]">
                  <div
                    className="relative cursor-pointer"
                    onClick={() => setMediaViewer({ url: snapRevealedUrl, type: msg.mediaType ?? "image" })}
                  >
                    {msg.mediaType === "video" || msg.mediaType?.startsWith("video/") ? (
                      <video src={snapRevealedUrl} className="w-full max-h-[220px] object-cover" />
                    ) : (
                      <img src={snapRevealedUrl} alt="snap" className="w-full max-h-[220px] object-cover" />
                    )}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5">
                      <Eye className="w-3 h-3 text-white/70" />
                      <span className="text-[10px] text-white/70">
                        {snapViewsLeft === 0 ? "لا يمكن إعادة الفتح" :
                         snapViewsLeft !== null ? `${snapViewsLeft} مرة متبقية` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                // Unopened snap — tap to open
                <button
                  onClick={openSnap}
                  disabled={snapOpening}
                  className="rounded-2xl overflow-hidden max-w-[200px] w-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/30 px-4 py-4 flex items-center gap-3 hover:from-purple-500/30 hover:to-pink-500/30 transition-all active:scale-95"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    {snapOpening ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white">سناب 📸</p>
                    <p className="text-[10px] text-white/60 mt-0.5">
                      {snapOpening ? "جارٍ الفتح..." : "اضغط للفتح"}
                    </p>
                    {msg.viewsLeft !== null && (
                      <p className="text-[10px] text-purple-300 mt-0.5">
                        {msg.viewOnce ? "مرة واحدة فقط" : `${msg.viewsLeft} مرة`}
                      </p>
                    )}
                  </div>
                </button>
              )}
            </>
          )}

          {/* File / Document attachment */}
          {!msg.isSnap && !isVoice && msg.mediaType === "file" && msg.mediaUrl && (
            <a
              href={msg.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[260px] transition-opacity hover:opacity-80",
                isMe ? "bg-primary/20" : "bg-secondary"
              )}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", isMe ? "bg-primary/30" : "bg-muted")}>
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate max-w-[160px]">
                  {msg.fileName || "Attachment"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Tap to open</p>
              </div>
            </a>
          )}

          {/* Image / Video (regular, non-snap) */}
          {!msg.isSnap && !isVoice && msg.mediaType !== "file" && msg.mediaUrl && (
            <div
              className="rounded-2xl overflow-hidden max-w-[260px] cursor-pointer"
              onClick={() => setMediaViewer({ url: msg.mediaUrl!, type: msg.mediaType ?? "image" })}
            >
              {msg.mediaType === "video" || msg.mediaType?.startsWith("video/") ? (
                <video src={msg.mediaUrl} className="w-full max-h-[220px] object-cover" />
              ) : (
                <img src={msg.mediaUrl} alt="media" className="w-full max-h-[220px] object-cover" />
              )}
            </div>
          )}

          {/* Text */}
          {msg.text && (
            <div className={cn(
              "px-4 py-2.5 text-sm leading-relaxed relative break-words",
              isMe
                ? "bg-primary text-primary-foreground rounded-[22px] rounded-br-[6px]"
                : "bg-secondary text-foreground rounded-[22px] rounded-bl-[6px]",
              isGroupEnd && isMe && "rounded-br-[22px]",
              isGroupEnd && !isMe && "rounded-bl-[22px]",
              msg.isPinned && "ring-1 ring-primary/40",
            )}>
              {msg.isPinned && (
                <Pin className="w-2.5 h-2.5 absolute -top-1 -right-1 text-primary fill-primary" />
              )}
              {msg.text}
              {msg.isEdited && (
                <span className={cn(
                  "text-[9px] ml-1.5 opacity-60",
                  isMe ? "text-primary-foreground" : "text-muted-foreground"
                )}>edited</span>
              )}
            </div>
          )}

          {/* Reactions */}
          {reactionEntries.length > 0 && (
            <div className={cn("flex flex-wrap gap-1 mt-0.5", isMe ? "justify-end" : "justify-start")}>
              {reactionEntries.map(([emoji, users]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(msg.id, emoji)}
                  className={cn(
                    "text-xs flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all",
                    users.includes(myId)
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-secondary border-border hover:border-primary/40"
                  )}
                >
                  {emoji} <span className="text-[10px] font-medium">{users.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Read receipt */}
          {isMe && isLastMine && (
            <div className="flex items-center gap-1 px-1">
              {msg.status === "sending" ? (
                <span className="text-[10px] text-muted-foreground">Sending…</span>
              ) : msg.status === "failed" ? (
                <span className="text-[10px] text-destructive">Failed</span>
              ) : (
                <>
                  <span className="text-[10px] text-muted-foreground">{fmt(msg.createdAt)}</span>
                  {msg.isRead
                    ? <CheckCheck className="w-3.5 h-3.5 text-primary" />
                    : <Check className="w-3.5 h-3.5 text-muted-foreground" />}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile action sheet ── */}
      {showMobileSheet && (
        <div
          className="fixed inset-0 z-40 sm:hidden flex items-end bg-black/40"
          onClick={() => setShowMobileSheet(false)}
        >
          <div
            className="w-full bg-card rounded-t-2xl p-4 space-y-0.5"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Quick reactions */}
            <div className="flex justify-around py-3 border-b border-border mb-1">
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  className="text-2xl active:scale-125 transition-transform"
                  onClick={() => { onReact(msg.id, emoji); setShowMobileSheet(false); }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <SheetRow icon={<Reply className="w-5 h-5" />} label="Reply" onClick={() => { onReply(msg); setShowMobileSheet(false); }} />
            <SheetRow icon={<Forward className="w-5 h-5" />} label="Forward" onClick={() => { onForward(msg); setShowMobileSheet(false); }} />
            {msg.text && (
              <SheetRow icon={<Copy className="w-5 h-5" />} label="Copy" onClick={() => { navigator.clipboard.writeText(msg.text!); setShowMobileSheet(false); }} />
            )}
            <SheetRow
              icon={<Star className={cn("w-5 h-5", isStarredByMe && "fill-yellow-500 text-yellow-500")} />}
              label={isStarredByMe ? "Unstar" : "Star"}
              onClick={() => { onStar(msg.id); setShowMobileSheet(false); }}
            />
            <SheetRow
              icon={<Pin className={cn("w-5 h-5", msg.isPinned && "fill-primary text-primary")} />}
              label={msg.isPinned ? "Unpin" : "Pin"}
              onClick={() => { onPin(msg.id); setShowMobileSheet(false); }}
            />
            {isMe && msg.text && !msg.mediaUrl && (
              <SheetRow icon={<Pencil className="w-5 h-5" />} label="Edit" onClick={() => { onEdit(msg); setShowMobileSheet(false); }} />
            )}
            {isMe && (
              <SheetRow
                icon={<Trash2 className="w-5 h-5 text-destructive" />}
                label="Delete"
                labelClass="text-destructive"
                onClick={() => { onDelete(msg.id); setShowMobileSheet(false); }}
              />
            )}
            <button
              className="w-full py-3 text-sm text-muted-foreground font-medium text-center mt-1"
              onClick={() => setShowMobileSheet(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ActionBtn({
  children, title, onClick, className,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SheetRow({ icon, label, labelClass, onClick }: {
  icon: React.ReactNode;
  label: string;
  labelClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-4 w-full px-2 py-3 rounded-xl hover:bg-secondary/60 transition-colors active:bg-secondary"
      onClick={onClick}
    >
      <span className="text-foreground">{icon}</span>
      <span className={cn("text-sm font-medium", labelClass)}>{label}</span>
    </button>
  );
}
