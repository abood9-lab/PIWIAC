import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGetConversations, useMarkConversationRead } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  MessageCircle, X, ArrowLeft, Send, Search,
  CheckCheck, Wifi, WifiOff,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

// ── helpers ──────────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.BASE_URL ?? "/";

async function apiReq<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("pixlr_token") ?? "";
  const r = await fetch(`${BASE_URL}api/${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

function fmtTime(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function initials(name?: string) {
  return (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── types ────────────────────────────────────────────────────────────────────
interface Msg {
  id: string;
  senderId: string;
  text: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  isDeleted?: boolean;
  createdAt: string;
}

// ── sub-component: single message bubble ─────────────────────────────────────
function MsgBubble({ msg, isMe }: { msg: Msg; isMe: boolean }) {
  const body = msg.isDeleted
    ? <span className="italic text-muted-foreground text-xs">Message deleted</span>
    : msg.mediaUrl
      ? <span className="italic text-xs text-muted-foreground">[{msg.mediaType ?? "media"}]</span>
      : <span className="text-sm leading-snug whitespace-pre-wrap break-words">{msg.text}</span>;

  return (
    <div className={cn("flex mb-1", isMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] px-3 py-1.5 rounded-2xl",
          isMe
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {body}
        <div className={cn("text-[10px] mt-0.5 opacity-60 text-right")}>
          {fmtTime(msg.createdAt)}
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export function FloatingChat() {
  const { user } = useAuth();
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConvRef = useRef<string | null>(null);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
  }, []);

  const { data: conversations } = useGetConversations();
  const markRead = useMarkConversationRead();
  // Show all conversations (inbox + requests) — no tab split in the bubble
  const convList = (conversations as any[] ?? []).filter((c: any) => !c.isVault);

  // total unread badge
  useEffect(() => {
    const n = convList.reduce((acc: number, c: any) => acc + (c.unreadCount ?? 0), 0);
    setTotalUnread(n);
  }, [convList]);

  // active conv object
  const activeConv = convList.find((c: any) => c.id === activeConvId) as any | undefined;

  // filtered list
  const filtered = search.trim()
    ? convList.filter((c: any) =>
        c.otherUser?.username?.toLowerCase().includes(search.toLowerCase()) ||
        c.otherUser?.fullName?.toLowerCase().includes(search.toLowerCase()),
      )
    : convList;

  // ── Socket wiring ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onOnline = ({ userId }: { userId: string }) =>
      setOnline((prev) => new Set([...prev, userId]));
    const onOffline = ({ userId }: { userId: string }) =>
      setOnline((prev) => { const s = new Set(prev); s.delete(userId); return s; });
    const onTyping = ({ userId, conversationId }: any) => {
      if (conversationId === activeConvId && userId !== user?.id) setTyping(true);
    };
    const onStopTyping = ({ conversationId }: any) => {
      if (conversationId === activeConvId) setTyping(false);
    };
    const onNewMsg = (msg: Msg & { conversationId: string; clientId?: string }) => {
      // always refresh conversation list
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (msg.conversationId === activeConvId) {
        setMessages((prev) => {
          // already have server copy by id → skip
          if (prev.some((m) => m.id === msg.id)) return prev;
          // replace optimistic copy by clientId (prevents duplicates when socket
          // arrives before the POST response resolves)
          if (msg.clientId && prev.some((m) => m.id === msg.clientId)) {
            return prev.map((m) => (m.id === msg.clientId ? { ...msg } : m));
          }
          return [...prev, msg];
        });
        setTyping(false);
        markRead.mutate({ conversationId: msg.conversationId });
      }
    };
    const onMsgDeleted = (msg: Msg & { conversationId: string }) => {
      if (msg.conversationId === activeConvId) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isDeleted: true, text: null } : m)));
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("user_online", onOnline);
    socket.on("user_offline", onOffline);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);
    socket.on("new_message", onNewMsg);
    socket.on("message_deleted", onMsgDeleted);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("user_online", onOnline);
      socket.off("user_offline", onOffline);
      socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping);
      socket.off("new_message", onNewMsg);
      socket.off("message_deleted", onMsgDeleted);
    };
  }, [activeConvId, user?.id, queryClient]);

  // ── Open conversation ─────────────────────────────────────────────────────
  const openConv = useCallback(async (convId: string) => {
    const socket = getSocket();
    // leave previous room
    if (prevConvRef.current && prevConvRef.current !== convId) {
      socket?.emit("leave_conversation", { conversationId: prevConvRef.current });
    }
    prevConvRef.current = convId;
    setActiveConvId(convId);
    setMessages([]);
    setTyping(false);
    setText("");

    socket?.emit("join_conversation", { conversationId: convId });

    try {
      const res = await apiReq<{ messages: Msg[] }>(`conversations/${convId}/messages?limit=30`);
      setMessages(res.messages ?? []);
      markRead.mutate({ conversationId: convId });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch { /* silent */ }
  }, [queryClient]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    if (activeConvId) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeConvId]);

  // ── Focus input when chat opens ───────────────────────────────────────────
  useEffect(() => {
    if (activeConvId) {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      focusTimer.current = setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [activeConvId]);

  // ── Typing indicator ──────────────────────────────────────────────────────
  function handleTextChange(val: string) {
    setText(val);
    const socket = getSocket();
    if (!socket || !activeConvId) return;
    socket.emit("typing", { conversationId: activeConvId });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("stop_typing", { conversationId: activeConvId });
    }, 2000);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!text.trim() || !activeConvId || sending) return;
    const msgText = text.trim();
    setText("");
    setSending(true);
    const clientId = `fc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // optimistic
    const optimistic: Msg = {
      id: clientId,
      senderId: user!.id,
      text: msgText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const sent = await apiReq<Msg>(`conversations/${activeConvId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: msgText, clientId }),
      });
      setMessages((prev) => prev.map((m) => (m.id === clientId ? sent : m)));
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      setText(msgText);
    } finally {
      setSending(false);
    }
  }

  // ── Back to list ──────────────────────────────────────────────────────────
  function backToList() {
    const socket = getSocket();
    if (activeConvId) socket?.emit("leave_conversation", { conversationId: activeConvId });
    prevConvRef.current = null;
    setActiveConvId(null);
    setMessages([]);
    setTyping(false);
  }

  // ── Don't render on /messages or /snap ───────────────────────────────────
  if (!user || location === "/messages" || location === "/snap") return null;

  const otherUser = activeConv?.otherUser;
  const isOtherOnline = otherUser?.id ? online.has(otherUser.id) : false;

  return (
    <>
      {/* ── Floating bubble ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-[100] flex items-center justify-center w-14 h-14 rounded-full shadow-xl",
          "bg-primary text-primary-foreground",
          "transition-transform hover:scale-105 active:scale-95",
          // hidden on mobile, visible on md+ only
          "hidden md:flex bottom-6 right-6",
        )}
        aria-label="Toggle chat"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-6 h-6" />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle className="w-6 h-6" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Unread badge */}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* ── Mini chat panel ─────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={cn(
              "fixed z-[99] flex flex-col overflow-hidden",
              "bg-card border border-border rounded-2xl shadow-2xl",
              // position — sits above the bubble
              "bottom-36 right-4 md:bottom-24 md:right-6",
              // size
              "w-[300px] h-[420px]",
            )}
          >
            {/* ── HEADER ────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
              {activeConvId ? (
                <>
                  <button onClick={backToList} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="relative">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={otherUser?.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">{initials(otherUser?.fullName)}</AvatarFallback>
                    </Avatar>
                    {isOtherOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-card" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{otherUser?.fullName ?? otherUser?.username}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {typing ? (
                        <span className="text-primary animate-pulse">typing…</span>
                      ) : isOtherOnline ? (
                        "Active now"
                      ) : (
                        `@${otherUser?.username}`
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <MessageCircle className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-sm flex-1">Messages</span>
                  {!connected && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <WifiOff className="w-3.5 h-3.5" /> Offline
                    </span>
                  )}
                  {connected && (
                    <span className="text-green-500">
                      <Wifi className="w-3.5 h-3.5" />
                    </span>
                  )}
                </>
              )}
            </div>

            {/* ── BODY ──────────────────────────────────────────────── */}
            <AnimatePresence mode="wait" initial={false}>
              {!activeConvId ? (
                /* ── Conversation list ───────────────────────────── */
                <motion.div
                  key="list"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col flex-1 min-h-0"
                >
                  {/* Search */}
                  <div className="px-3 py-2 border-b border-border shrink-0">
                    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        placeholder="Search conversations…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
                      />
                      {search && (
                        <button onClick={() => setSearch("")}>
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* List */}
                  <ScrollArea className="flex-1">
                    {filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-center px-6">
                        <MessageCircle className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {search ? "No results" : "No conversations yet"}
                        </p>
                      </div>
                    ) : (
                      filtered.map((conv: any) => {
                        const other = conv.otherUser;
                        const isOn = other?.id ? online.has(other.id) : false;
                        return (
                          <button
                            key={conv.id}
                            onClick={() => openConv(conv.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left"
                          >
                            <div className="relative shrink-0">
                              <Avatar className="w-10 h-10">
                                <AvatarImage src={other?.avatarUrl ?? undefined} />
                                <AvatarFallback className="text-xs">{initials(other?.fullName)}</AvatarFallback>
                              </Avatar>
                              {isOn && (
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-card" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold" : "font-medium")}>
                                  {other?.fullName ?? other?.username}
                                </p>
                                <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                                  {fmtTime(conv.lastMessageAt)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <p className={cn("text-xs truncate", conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                                  {conv.lastMessage ?? "Start a conversation"}
                                </p>
                                {conv.unreadCount > 0 && (
                                  <span className="ml-2 shrink-0 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </ScrollArea>
                </motion.div>
              ) : (
                /* ── Chat view ───────────────────────────────────── */
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col flex-1 min-h-0"
                >
                  {/* Messages */}
                  <ScrollArea className="flex-1 px-3 py-2">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-center">
                        <p className="text-sm text-muted-foreground">Say hi 👋</p>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <MsgBubble key={msg.id} msg={msg} isMe={msg.senderId === user?.id} />
                      ))
                    )}

                    {/* Typing indicator */}
                    {typing && (
                      <div className="flex justify-start mb-1">
                        <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </ScrollArea>

                  {/* Input */}
                  <div className="px-3 py-2 border-t border-border shrink-0 flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={text}
                      onChange={(e) => handleTextChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                      }}
                      placeholder="Message…"
                      disabled={sending || activeConv?.isBlocked || activeConv?.isBlockedBy}
                      className={cn(
                        "flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none",
                        "placeholder:text-muted-foreground text-foreground",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!text.trim() || sending || activeConv?.isBlocked || activeConv?.isBlockedBy}
                      className={cn(
                        "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        "bg-primary text-primary-foreground",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                        "transition-transform hover:scale-105 active:scale-95",
                      )}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Blocked notice */}
                  {(activeConv?.isBlocked || activeConv?.isBlockedBy) && (
                    <p className="text-center text-xs text-muted-foreground pb-2">
                      You can't send messages in this conversation
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
