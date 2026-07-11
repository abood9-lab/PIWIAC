import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  useGetConversations,
  useSendMessage,
  useCreateConversation,
  getGetConversationsQueryKey,
  useMarkConversationRead,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageCircle, PencilLine, ArrowLeft, Search, X,
  Archive, BellOff, Bell, WifiOff, Lock, Info,
  UserCheck, Inbox, Users,
} from "lucide-react";
import { VaultScreen } from "@/components/chat/VaultScreen";
import { ForwardModal } from "@/components/chat/ForwardModal";
import { ConversationInfoPanel } from "@/components/chat/ConversationInfoPanel";
import { CreateGroupModal } from "@/components/chat/CreateGroupModal";
import { GroupInfoPanel } from "@/components/chat/GroupInfoPanel";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { MessageBubble, type ChatMessage } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

async function apiRequest(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("pixlr_token") ?? "";
  const r = await fetch(`${BASE_URL}api/${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function safeDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatConvTime(dateStr: string | null | undefined) {
  const d = safeDate(dateStr);
  if (!d) return "";
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function generateClientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface QueuedMessage {
  clientId: string;
  conversationId: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  replyToId?: string;
}

type TabType = "inbox" | "requests";

export default function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Conversation state
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherTypingVoice, setOtherTypingVoice] = useState(false);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvUsername, setNewConvUsername] = useState("");
  const [tab, setTab] = useState<TabType>("inbox");

  // Messages feature state
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [starredMessages, setStarredMessages] = useState<ChatMessage[]>([]);
  const [sharedMedia, setSharedMedia] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [isConnected, setIsConnected] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<QueuedMessage[]>([]);

  // Forward
  const [forwardingMsg, setForwardingMsg] = useState<ChatMessage | null>(null);

  // Info panel
  const [showInfo, setShowInfo] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: string } | null>(null);

  // Vault
  const [showVault, setShowVault] = useState(false);
  const [vaultAddConvId, setVaultAddConvId] = useState<string | null>(null);
  const [vaultAddConvUser, setVaultAddConvUser] = useState<string | null>(null);

  // Group chat
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupTypingUsers, setGroupTypingUsers] = useState<Record<string, string>>({});
  const groupTypingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Messages pagination
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Conversation-level disappearAfter state (updated from socket)
  const [disappearAfterMap, setDisappearAfterMap] = useState<Record<string, string | null>>({});

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topObserverRef = useRef<IntersectionObserver | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // API hooks
  const { data: allConversations } = useGetConversations();
  const sendMutation = useSendMessage();
  const markReadMutation = useMarkConversationRead();
  const createConvMutation = useCreateConversation();

  const conversations = useMemo(
    () => (allConversations as any[] ?? []).filter((c: any) =>
      tab === "requests" ? c.isRequest : !c.isRequest
    ),
    [allConversations, tab]
  );

  const activeConv = (allConversations as any[] ?? []).find((c: any) => c.id === activeConvId);
  const activeConvRef = useRef<any>(null);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  // For group chats, build a map of userId → { avatarUrl, username } from group members
  const senderInfoMap = useMemo<Record<string, { avatarUrl?: string; username: string }>>(() => {
    if (!activeConv?.isGroup || !activeConv.members) return {};
    const map: Record<string, { avatarUrl?: string; username: string }> = {};
    for (const m of activeConv.members) map[m.id] = { avatarUrl: m.avatarUrl ?? undefined, username: m.username };
    return map;
  }, [activeConv?.isGroup, activeConv?.members]);

  const otherUserId = activeConv?.otherUser?.id ?? null;
  const isOtherOnline = otherUserId ? onlineUsers.has(otherUserId) : false;
  const disappearAfter = activeConvId ? (disappearAfterMap[activeConvId] ?? activeConv?.disappearAfter ?? null) : null;
  const isBlocked = activeConv?.isBlocked ?? false;
  const isBlockedBy = activeConv?.isBlockedBy ?? false;
  const myTimeoutUntil: string | null = activeConv?.myTimeoutUntil ?? null;
  const otherTimeoutUntil: string | null = activeConv?.otherTimeoutUntil ?? null;
  const isMyTimeoutActive = myTimeoutUntil ? new Date(myTimeoutUntil) > new Date() : false;

  // Load messages
  useEffect(() => {
    if (!activeConvId) { setLocalMessages([]); return; }
    setLocalMessages([]);
    setHasMoreMessages(false);
    apiRequest(`conversations/${activeConvId}/messages?limit=40`)
      .then((res: any) => {
        setLocalMessages(Array.isArray(res.messages) ? res.messages : []);
        setHasMoreMessages(res.hasMore ?? false);
      })
      .catch(() => {});
  }, [activeConvId]);

  // Infinite scroll
  useEffect(() => {
    if (!messagesTopRef.current) return;
    topObserverRef.current?.disconnect();
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMoreMessages && !isLoadingMore && localMessages.length > 0) {
        const oldest = localMessages[0];
        if (!oldest) return;
        setIsLoadingMore(true);
        apiRequest(`conversations/${activeConvId}/messages?limit=30&before=${oldest.id}`)
          .then((res: any) => {
            const older: ChatMessage[] = Array.isArray(res.messages) ? res.messages : [];
            setLocalMessages(prev => [...older, ...prev]);
            setHasMoreMessages(res.hasMore ?? false);
          })
          .catch(() => {})
          .finally(() => setIsLoadingMore(false));
      }
    }, { threshold: 0.1 });
    observer.observe(messagesTopRef.current);
    topObserverRef.current = observer;
    return () => observer.disconnect();
  }, [activeConvId, hasMoreMessages, isLoadingMore, localMessages.length]);

  // Load pinned, starred, media
  const loadPinned = useCallback((convId: string) => {
    apiRequest(`conversations/${convId}/pinned`).then(setPinnedMessages).catch(() => {});
  }, []);
  const loadStarred = useCallback((convId: string) => {
    apiRequest(`conversations/${convId}/starred`).then(setStarredMessages).catch(() => {});
  }, []);
  const loadMedia = useCallback((convId: string) => {
    apiRequest(`conversations/${convId}/media`).then(setSharedMedia).catch(() => {});
  }, []);

  // Mark read + join socket room
  useEffect(() => {
    const socket = getSocket();
    if (!activeConvId) return;
    socket?.emit("join_conversation", { conversationId: activeConvId });
    markReadMutation.mutateAsync({ conversationId: activeConvId }).catch(() => {});
    socket?.emit("mark_read", { conversationId: activeConvId });
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    loadPinned(activeConvId);
    if (otherUserId) {
      socket?.emit("get_presence", { userIds: [otherUserId] }, (res: Record<string, boolean>) => {
        if (res[otherUserId]) setOnlineUsers(prev => new Set([...prev, otherUserId]));
      });
    }
    return () => { socket?.emit("leave_conversation", { conversationId: activeConvId }); };
  }, [activeConvId]);

  // Retry offline queue
  useEffect(() => {
    if (isConnected && offlineQueue.length > 0) {
      const queue = [...offlineQueue];
      setOfflineQueue([]);
      queue.forEach(item => {
        const body: any = { clientId: item.clientId };
        if (item.text) body.text = item.text;
        if (item.mediaUrl) body.mediaUrl = item.mediaUrl;
        if (item.mediaType) body.mediaType = item.mediaType;
        if (item.replyToId) body.replyToId = item.replyToId;
        apiRequest(`conversations/${item.conversationId}/messages`, { method: "POST", body: JSON.stringify(body) })
          .then((msg: ChatMessage) => {
            setLocalMessages(prev => [...prev.filter(m => m.clientId !== item.clientId), msg]);
            queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
          })
          .catch(() => {});
      });
    }
  }, [isConnected]);

  // Socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    const onNewMessage = (msg: ChatMessage) => {
      if (msg.conversationId === activeConvId) {
        setLocalMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          if (msg.clientId && prev.some(m => m.clientId === msg.clientId)) {
            return prev.map(m => m.clientId === msg.clientId ? msg : m);
          }
          return [...prev, msg];
        });
        socket.emit("mark_read", { conversationId: activeConvId });
        markReadMutation.mutateAsync({ conversationId: activeConvId! }).catch(() => {});
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    };

    const onMsgEdited = (msg: ChatMessage) =>
      setLocalMessages(prev => prev.map(m => m.id === msg.id ? msg : m));

    const onMsgDeleted = (msg: ChatMessage) =>
      setLocalMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isDeleted: true, text: null, mediaUrl: null } : m));

    const onMsgReaction = (msg: ChatMessage) =>
      setLocalMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: msg.reactions } : m));

    const onMsgPinned = (msg: ChatMessage) => {
      setLocalMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isPinned: msg.isPinned } : m));
      if (activeConvId) loadPinned(activeConvId);
    };

    const onTyping = (data: { userId: string; conversationId: string; isVoice?: boolean }) => {
      if (data.conversationId === activeConvId && data.userId !== user?.id) {
        if (activeConvRef.current?.isGroup) {
          const member = (activeConvRef.current.members ?? []).find((m: any) => m.id === data.userId);
          const name = member?.username ?? data.userId;
          setGroupTypingUsers(prev => ({ ...prev, [data.userId]: name }));
          if (groupTypingTimeoutsRef.current[data.userId]) clearTimeout(groupTypingTimeoutsRef.current[data.userId]);
          groupTypingTimeoutsRef.current[data.userId] = setTimeout(() => {
            setGroupTypingUsers(prev => { const next = { ...prev }; delete next[data.userId]; return next; });
            delete groupTypingTimeoutsRef.current[data.userId];
          }, 3000);
        } else {
          setOtherTyping(true);
          setOtherTypingVoice(!!data.isVoice);
        }
      }
    };

    const onStopTyping = (data: { conversationId: string; userId?: string }) => {
      if (data.conversationId === activeConvId) {
        if (activeConvRef.current?.isGroup && data.userId) {
          setGroupTypingUsers(prev => { const next = { ...prev }; delete next[data.userId!]; return next; });
          if (groupTypingTimeoutsRef.current[data.userId]) {
            clearTimeout(groupTypingTimeoutsRef.current[data.userId]);
            delete groupTypingTimeoutsRef.current[data.userId];
          }
        } else {
          setOtherTyping(false);
          setOtherTypingVoice(false);
        }
      }
    };

    const onMessageRead = (data: { conversationId: string }) => {
      if (data.conversationId === activeConvId) {
        setLocalMessages(prev => prev.map(m => ({ ...m, isRead: true })));
      }
    };

    const onUserOnline = (data: { userId: string }) =>
      setOnlineUsers(prev => new Set([...prev, data.userId]));

    const onUserOffline = (data: { userId: string; lastSeen: string }) => {
      setOnlineUsers(prev => { const s = new Set(prev); s.delete(data.userId); return s; });
      setLastSeen(prev => ({ ...prev, [data.userId]: data.lastSeen }));
    };

    const onDisappearChanged = (data: { conversationId: string; disappearAfter: string | null }) => {
      setDisappearAfterMap(prev => ({ ...prev, [data.conversationId]: data.disappearAfter }));
    };

    const onBlockChanged = (_data: { conversationId: string; blockerId: string; isBlocked: boolean }) => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    };

    const onTimeoutChanged = (_data: { conversationId: string; restrictedUserId: string; until: string | null }) => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    };

    const onGroupCreated = () => queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    const onGroupUpdated = () => queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    const onGroupMembersChanged = () => queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    const onGroupRemoved = (data: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      if (data.conversationId === activeConvId) setActiveConvId(null);
    };
    const onGroupDeleted = (data: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      if (data.conversationId === activeConvId) setActiveConvId(null);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("new_message", onNewMessage);
    socket.on("message_edited", onMsgEdited);
    socket.on("message_deleted", onMsgDeleted);
    socket.on("message_reaction", onMsgReaction);
    socket.on("message_pinned", onMsgPinned);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);
    socket.on("message_read", onMessageRead);
    socket.on("user_online", onUserOnline);
    socket.on("user_offline", onUserOffline);
    socket.on("disappear_changed", onDisappearChanged);
    socket.on("block_changed", onBlockChanged);
    socket.on("timeout_changed", onTimeoutChanged);
    socket.on("group_created", onGroupCreated);
    socket.on("group_updated", onGroupUpdated);
    socket.on("group_members_changed", onGroupMembersChanged);
    socket.on("group_removed", onGroupRemoved);
    socket.on("group_deleted", onGroupDeleted);

    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      socket.off("new_message", onNewMessage); socket.off("message_edited", onMsgEdited);
      socket.off("message_deleted", onMsgDeleted); socket.off("message_reaction", onMsgReaction);
      socket.off("message_pinned", onMsgPinned); socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping); socket.off("message_read", onMessageRead);
      socket.off("user_online", onUserOnline); socket.off("user_offline", onUserOffline);
      socket.off("disappear_changed", onDisappearChanged);
      socket.off("block_changed", onBlockChanged);
      socket.off("timeout_changed", onTimeoutChanged);
      socket.off("group_created", onGroupCreated);
      socket.off("group_updated", onGroupUpdated);
      socket.off("group_members_changed", onGroupMembersChanged);
      socket.off("group_removed", onGroupRemoved);
      socket.off("group_deleted", onGroupDeleted);
    };
  }, [activeConvId, user?.id, queryClient]);

  // Auto-scroll
  useEffect(() => {
    if (localMessages.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [localMessages.length]);

  // Typing indicator
  const handleTypingStart = useCallback(() => {
    const socket = getSocket();
    if (!socket || !activeConvId) return;
    if (!isTyping) { setIsTyping(true); socket.emit("typing", { conversationId: activeConvId, isVoice: false }); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit("stop_typing", { conversationId: activeConvId });
    }, 1500);
  }, [activeConvId, isTyping]);

  const handleTypingStop = useCallback(() => {
    const socket = getSocket();
    if (!socket || !activeConvId) return;
    setIsTyping(false);
    socket.emit("stop_typing", { conversationId: activeConvId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, [activeConvId]);

  const handleInputChange = (val: string) => {
    setMessageText(val);
    if (val) handleTypingStart(); else handleTypingStop();
  };

  // Send message
  const handleSend = useCallback(async (opts?: { mediaUrl?: string; mediaType?: string; fileName?: string }) => {
    if (!activeConvId) return;
    const text = messageText.trim();
    if (!text && !opts?.mediaUrl) return;
    setMessageText(""); setReplyTo(null); handleTypingStop();
    const clientId = generateClientId();
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`, conversationId: activeConvId, senderId: user!.id,
      text: text || null, mediaUrl: opts?.mediaUrl ?? null, mediaType: opts?.mediaType ?? null,
      fileName: opts?.fileName ?? null,
      isRead: false, isEdited: false, isDeleted: false, isForwarded: false,
      reactions: {}, isPinned: false, starredBy: [], clientId,
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, text: replyTo.text, mediaType: replyTo.mediaType } : null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "sending",
    };
    setLocalMessages(prev => [...prev, optimistic]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    const body: any = { clientId };
    if (text) body.text = text;
    if (opts?.mediaUrl) body.mediaUrl = opts.mediaUrl;
    if (opts?.mediaType) body.mediaType = opts.mediaType;
    if (opts?.fileName) body.fileName = opts.fileName;
    if (replyTo?.id) body.replyToId = replyTo.id;
    try {
      const msg: ChatMessage = await apiRequest(`conversations/${activeConvId}/messages`, { method: "POST", body: JSON.stringify(body) });
      setLocalMessages(prev => prev.map(m => m.clientId === clientId ? msg : m));
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    } catch {
      setLocalMessages(prev => prev.map(m => m.clientId === clientId ? { ...m, status: "failed" } : m));
      if (!isConnected) setOfflineQueue(prev => [...prev, { clientId, conversationId: activeConvId, text: text || undefined, ...opts, replyToId: replyTo?.id }]);
    }
  }, [activeConvId, messageText, replyTo, user, isConnected, handleTypingStop]);

  // Edit
  const handleEditSave = useCallback(async (text: string) => {
    if (!editingMsg) return;
    const oldText = editingMsg.text;
    setEditingMsg(null);
    setLocalMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, text, isEdited: true } : m));
    try { await apiRequest(`messages/${editingMsg.id}`, { method: "PATCH", body: JSON.stringify({ text }) }); }
    catch { setLocalMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, text: oldText, isEdited: false } : m)); }
  }, [editingMsg]);

  const handleDelete = useCallback(async (msgId: string) => {
    setLocalMessages(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true, text: null, mediaUrl: null } : m));
    await apiRequest(`messages/${msgId}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const handleReact = useCallback(async (msgId: string, emoji: string) => {
    const meId = user!.id;
    setLocalMessages(prev => prev.map(m => {
      if (String(m.id) !== String(msgId)) return m;
      const reactions = { ...m.reactions };
      const users = reactions[emoji] ?? [];
      if (users.includes(meId)) {
        reactions[emoji] = users.filter(id => id !== meId);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else { reactions[emoji] = [...users, meId]; }
      return { ...m, reactions };
    }));
    await apiRequest(`messages/${msgId}/react`, { method: "POST", body: JSON.stringify({ emoji }) }).catch(() => {});
  }, [user]);

  const handlePin = useCallback(async (msgId: string) => {
    setLocalMessages(prev => prev.map(m => m.id === msgId ? { ...m, isPinned: !m.isPinned } : m));
    await apiRequest(`messages/${msgId}/pin`, { method: "POST" }).catch(() => {});
    if (activeConvId) loadPinned(activeConvId);
  }, [activeConvId, loadPinned]);

  const handleStar = useCallback(async (msgId: string) => {
    const meId = user!.id;
    setLocalMessages(prev => prev.map(m => {
      if (String(m.id) !== String(msgId)) return m;
      const starredBy = m.starredBy.includes(meId) ? m.starredBy.filter(id => id !== meId) : [...m.starredBy, meId];
      return { ...m, starredBy };
    }));
    await apiRequest(`messages/${msgId}/star`, { method: "POST" }).catch(() => {});
  }, [user]);

  // Forward
  const handleForward = useCallback(async (conversationId: string) => {
    if (!forwardingMsg) return;
    await apiRequest(`messages/${forwardingMsg.id}/forward`, { method: "POST", body: JSON.stringify({ conversationId }) });
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  }, [forwardingMsg, queryClient]);

  // Disappearing messages
  const handleDisappearChange = useCallback(async (value: string | null) => {
    if (!activeConvId) return;
    setDisappearAfterMap(prev => ({ ...prev, [activeConvId]: value }));
    await apiRequest(`conversations/${activeConvId}/disappear`, { method: "PATCH", body: JSON.stringify({ disappearAfter: value }) }).catch(() => {});
  }, [activeConvId]);

  // Archive / Mute
  const handleArchive = useCallback(async (convId: string, isArchived: boolean) => {
    await apiRequest(`conversations/${convId}`, { method: "PATCH", body: JSON.stringify({ action: isArchived ? "unarchive" : "archive" }) }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  }, [queryClient]);

  const handleMute = useCallback(async (convId: string, isMuted: boolean) => {
    await apiRequest(`conversations/${convId}`, { method: "PATCH", body: JSON.stringify({ action: isMuted ? "unmute" : "mute" }) }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  }, [queryClient]);

  // Block / Unblock / Timeout
  const handleBlock = useCallback(async () => {
    if (!activeConvId) return;
    await apiRequest(`conversations/${activeConvId}/block`, { method: "POST" }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  }, [activeConvId, queryClient]);

  const handleUnblock = useCallback(async () => {
    if (!activeConvId) return;
    await apiRequest(`conversations/${activeConvId}/unblock`, { method: "POST" }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  }, [activeConvId, queryClient]);

  const handleTimeout = useCallback(async (duration: string | null) => {
    if (!activeConvId) return;
    await apiRequest(`conversations/${activeConvId}/timeout`, { method: "POST", body: JSON.stringify({ duration }) }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  }, [activeConvId, queryClient]);

  // Search
  useEffect(() => {
    if (!activeConvId || !searchQuery.trim() || searchQuery.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    const timer = setTimeout(() => {
      apiRequest(`conversations/${activeConvId}/search?q=${encodeURIComponent(searchQuery)}`)
        .then((results: ChatMessage[]) => setSearchResults(results))
        .catch(() => {})
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, activeConvId]);

  // New conversation
  const handleNewConv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConvUsername.trim()) return;
    try {
      const conv = await createConvMutation.mutateAsync({ data: { username: newConvUsername.trim() } });
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      setNewConvOpen(false); setNewConvUsername(""); setActiveConvId(conv.id);
    } catch (err: any) {
      alert(err?.message || "User not found");
    }
  };

  const handleSelectConv = (convId: string) => {
    setActiveConvId(convId);
    setOtherTyping(false); setReplyTo(null); setEditingMsg(null);
    setSearchMode(false); setSearchQuery(""); setShowInfo(false);
    setStarredMessages([]); setSharedMedia([]);
    setGroupTypingUsers({});
    Object.values(groupTypingTimeoutsRef.current).forEach(clearTimeout);
    groupTypingTimeoutsRef.current = {};
  };

  const handleCreateGroup = async (groupData: { name: string; description: string; memberUsernames: string[]; avatarData?: string }) => {
    try {
      const conv = await apiRequest("groups", { method: "POST", body: JSON.stringify(groupData) });
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      setCreateGroupOpen(false);
      setActiveConvId(conv.id);
    } catch (err: any) {
      alert(err?.message || "Failed to create group");
    }
  };

  const lastMineIdx = useMemo(() => {
    for (let i = localMessages.length - 1; i >= 0; i--) {
      if (localMessages[i].senderId === user?.id) return i;
    }
    return -1;
  }, [localMessages, user?.id]);

  const otherStatusText = useMemo(() => {
    if (otherTyping) return otherTypingVoice ? "Recording voice…" : "typing…";
    if (isOtherOnline) return "Active now";
    if (otherUserId && lastSeen[otherUserId]) {
      const d = safeDate(lastSeen[otherUserId]);
      return d ? `Last seen ${formatDistanceToNow(d, { addSuffix: true })}` : null;
    }
    return null;
  }, [otherTyping, otherTypingVoice, isOtherOnline, otherUserId, lastSeen]);

  // Info panel open → load media/starred/pinned
  const handleOpenInfo = () => {
    setShowInfo(true);
    if (activeConvId) { loadMedia(activeConvId); loadStarred(activeConvId); loadPinned(activeConvId); }
  };

  const requestCount = useMemo(
    () => (allConversations as any[] ?? []).filter((c: any) => c.isRequest).length,
    [allConversations]
  );

  return (
    <>
    {/* Main layout */}
    <div className="flex h-[calc(100dvh-4rem)] md:h-dvh bg-background overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div className={cn(
        "w-full md:w-[340px] lg:w-[380px] border-r border-border flex flex-col bg-card shrink-0",
        activeConvId ? "hidden md:flex" : "flex"
      )}>
        {/* Header */}
        <div className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">{user?.username}</h2>
            <div className="flex gap-0.5">
              {!isConnected && (
                <div className="flex items-center gap-1 text-xs text-destructive bg-destructive/10 rounded-full px-2 py-1 mr-1">
                  <WifiOff className="w-3 h-3" /> Offline
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={() => { setVaultAddConvId(null); setVaultAddConvUser(null); setShowVault(true); }} className="rounded-full w-9 h-9" title="Secret Vault">
                <Lock className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCreateGroupOpen(true)} className="rounded-full w-9 h-9" title="New Group">
                <Users className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setNewConvOpen(true)} className="rounded-full w-9 h-9" title="New Message">
                <PencilLine className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Tabs: Inbox / Requests */}
          <div className="flex gap-1 bg-secondary rounded-xl p-1">
            <button
              onClick={() => setTab("inbox")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                tab === "inbox" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Inbox className="w-3.5 h-3.5" /> Inbox
            </button>
            <button
              onClick={() => setTab("requests")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative",
                tab === "requests" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Requests
              {requestCount > 0 && tab !== "requests" && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                  {requestCount > 9 ? "9+" : requestCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* New conversation form */}
        {newConvOpen && (
          <div className="p-3 border-b border-border bg-secondary/30 shrink-0">
            <form onSubmit={handleNewConv} className="flex gap-2">
              <Input
                autoFocus
                placeholder="Username…"
                value={newConvUsername}
                onChange={e => setNewConvUsername(e.target.value)}
                className="flex-1 h-9 text-sm rounded-full"
              />
              <Button type="submit" size="sm" className="rounded-full" disabled={createConvMutation.isPending}>
                {createConvMutation.isPending ? "…" : "Start"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="rounded-full px-2"
                onClick={() => { setNewConvOpen(false); setNewConvUsername(""); }}>
                <X className="w-4 h-4" />
              </Button>
            </form>
          </div>
        )}

        {/* Conversations list */}
        <ScrollArea className="flex-1">
          {conversations?.length === 0 && (
            <div className="text-center py-14 text-muted-foreground text-sm px-6">
              {tab === "requests"
                ? "No message requests"
                : "No conversations yet. Tap the pencil icon to start one."}
            </div>
          )}
          {(conversations as any[])?.map((conv: any) => (
            <div
              key={conv.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors group relative",
                activeConvId === conv.id && "bg-secondary",
                conv.isArchived && "opacity-60"
              )}
              onClick={() => handleSelectConv(conv.id)}
            >
              {/* Avatar: group uses gradient icon, 1:1 uses user avatar */}
              <div className="relative shrink-0">
                {conv.isGroup ? (
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 overflow-hidden">
                    {conv.groupAvatarUrl
                      ? <img src={conv.groupAvatarUrl} alt="" className="h-full w-full object-cover" />
                      : <Users className="w-5 h-5 text-white" />}
                  </div>
                ) : (
                  <>
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={conv.otherUser?.avatarUrl || undefined} />
                      <AvatarFallback className="text-base font-bold">
                        {conv.otherUser?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {onlineUsers.has(conv.otherUser?.id) && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
                    )}
                  </>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={cn("text-sm truncate flex items-center gap-1", conv.unreadCount > 0 ? "font-bold" : "font-semibold")}>
                    {conv.isGroup
                      ? <>{conv.groupName ?? "Group"}</>
                      : (conv.otherUser?.fullName || conv.otherUser?.username)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {conv.isMuted && <BellOff className="w-3 h-3 text-muted-foreground" />}
                    {conv.lastMessageAt && (
                      <span className="text-[11px] text-muted-foreground">{formatConvTime(conv.lastMessageAt)}</span>
                    )}
                  </div>
                </div>
                <div className={cn("text-xs truncate", conv.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {conv.isGroup
                    ? (conv.lastMessage || `${(conv.members ?? []).length} members`)
                    : (conv.lastMessage || "Start a conversation")}
                </div>
              </div>

              {conv.unreadCount > 0 && (
                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shrink-0">
                  <span className="text-[9px] text-primary-foreground font-bold">{conv.unreadCount > 9 ? "9+" : conv.unreadCount}</span>
                </div>
              )}

              {/* Quick actions on hover */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5 bg-card shadow-md rounded-full px-1.5 py-1 border border-border z-10">
                {!conv.isGroup && (
                  <button
                    onClick={e => { e.stopPropagation(); setVaultAddConvId(conv.id); setVaultAddConvUser(conv.otherUser?.fullName || conv.otherUser?.username); setShowVault(true); }}
                    className="p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground" title="Hide in Vault"
                  ><Lock className="w-3.5 h-3.5" /></button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleArchive(conv.id, conv.isArchived); }}
                  className="p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground" title={conv.isArchived ? "Unarchive" : "Archive"}
                ><Archive className="w-3.5 h-3.5" /></button>
                <button
                  onClick={e => { e.stopPropagation(); handleMute(conv.id, conv.isMuted); }}
                  className="p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground" title={conv.isMuted ? "Unmute" : "Mute"}
                >{conv.isMuted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}</button>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* ── Chat area ──────────────────────────────────────────────── */}
      <div className={cn(
        "flex-1 flex overflow-hidden",
        !activeConvId ? "hidden md:flex items-center justify-center bg-secondary/10" : "flex"
      )}>
        {!activeConvId ? (
          <div className="text-center text-muted-foreground px-4">
            <div className="w-20 h-20 rounded-full border-2 border-foreground/20 flex items-center justify-center mx-auto mb-5">
              <MessageCircle className="w-10 h-10 text-foreground/40" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">Your Messages</h3>
            <p className="text-sm mb-5">Send private messages to friends.</p>
            <Button onClick={() => setNewConvOpen(true)} size="sm" className="rounded-full">Send message</Button>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden relative">
            {/* Main chat column */}
            <div className={cn(
              "flex flex-col flex-1 overflow-hidden transition-all",
              showInfo ? "hidden lg:flex" : "flex"
            )}>
              {/* Chat header */}
              <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-card shrink-0">
                <Button variant="ghost" size="icon" className="md:hidden rounded-full w-9 h-9 shrink-0" onClick={() => setActiveConvId(null)}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>

                <button
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  onClick={handleOpenInfo}
                >
                  <div className="relative shrink-0">
                    {activeConv?.isGroup ? (
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center overflow-hidden">
                        {activeConv.groupAvatarUrl
                          ? <img src={activeConv.groupAvatarUrl} alt="" className="h-full w-full object-cover" />
                          : <Users className="w-4 h-4 text-white" />}
                      </div>
                    ) : (
                      <>
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={activeConv?.otherUser?.avatarUrl || undefined} />
                          <AvatarFallback className="text-sm font-bold">
                            {activeConv?.otherUser?.username?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {isOtherOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card" />
                        )}
                      </>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-tight truncate">
                      {activeConv?.isGroup
                        ? (activeConv.groupName ?? "Group")
                        : activeConv?.otherUser?.username}
                    </div>
                    {activeConv?.isGroup ? (
                      <div className="text-xs leading-tight truncate text-muted-foreground">
                        {Object.keys(groupTypingUsers).length > 0
                          ? `${Object.values(groupTypingUsers).join(", ")} ${Object.keys(groupTypingUsers).length === 1 ? "is" : "are"} typing…`
                          : `${(activeConv.members ?? []).length} members`}
                      </div>
                    ) : otherStatusText ? (
                      <div className={cn(
                        "text-xs leading-tight truncate",
                        otherTyping ? "text-primary" : isOtherOnline ? "text-green-500" : "text-muted-foreground"
                      )}>
                        {otherStatusText}
                      </div>
                    ) : null}
                  </div>
                </button>

                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={() => setSearchMode(v => !v)}>
                    <Search className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("rounded-full w-9 h-9", showInfo && "bg-secondary")}
                    onClick={() => showInfo ? setShowInfo(false) : handleOpenInfo()}
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Disappearing messages banner */}
              {disappearAfter && (
                <div className="flex items-center justify-center gap-1.5 py-1.5 bg-secondary/50 border-b border-border text-xs text-muted-foreground">
                  <span className="text-base">⏱</span>
                  Messages disappear after {disappearAfter === "1h" ? "1 hour" : disappearAfter === "24h" ? "24 hours" : "7 days"}
                </div>
              )}

              {/* Block / restriction banners */}
              {isBlockedBy && (
                <div className="flex items-center justify-center gap-1.5 py-2 bg-destructive/10 border-b border-border text-xs text-destructive font-medium">
                  You can't reply to this conversation.
                </div>
              )}
              {!isBlockedBy && isBlocked && (
                <div className="flex items-center justify-center gap-1.5 py-2 bg-secondary/50 border-b border-border text-xs text-muted-foreground">
                  You've blocked @{activeConv?.otherUser?.username}.{" "}
                  <button onClick={handleUnblock} className="text-primary font-semibold ml-1">Unblock</button>
                </div>
              )}
              {!isBlockedBy && !isBlocked && isMyTimeoutActive && (
                <div className="flex items-center justify-center gap-1.5 py-2 bg-secondary/50 border-b border-border text-xs text-muted-foreground">
                  @{activeConv?.otherUser?.username} restricted you from sending messages until{" "}
                  {myTimeoutUntil ? format(new Date(myTimeoutUntil), "MMM d, h:mm a") : ""}.
                </div>
              )}

              {/* Search bar */}
              {searchMode && (
                <div className="px-4 py-2 border-b border-border bg-card shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      autoFocus value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search in conversation…"
                      className="pl-9 pr-9 h-9 rounded-full text-sm"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {isSearching && <p className="text-xs text-muted-foreground mt-1 ml-1">Searching…</p>}
                  {!isSearching && searchQuery.length >= 2 && (
                    <p className="text-xs text-muted-foreground mt-1 ml-1">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
                  )}
                </div>
              )}

              {/* Messages area */}
              {searchMode && searchResults.length > 0 ? (
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Search results</p>
                  {searchResults.map(msg => (
                    <div key={msg.id} className="bg-secondary/50 rounded-xl px-4 py-3">
                      <div className="text-[10px] text-muted-foreground mb-1">
                        {msg.senderId === user?.id ? "You" : activeConv?.otherUser?.username} · {safeDate(msg.createdAt) ? format(safeDate(msg.createdAt)!, "MMM d, h:mm a") : ""}
                      </div>
                      <p className="text-sm">{msg.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
                  <div ref={messagesTopRef} className="h-4">
                    {isLoadingMore && <div className="text-center py-2 text-xs text-muted-foreground">Loading older messages…</div>}
                  </div>

                  {localMessages.length === 0 && !isLoadingMore && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Avatar className="h-16 w-16 mb-3">
                        <AvatarImage src={activeConv?.otherUser?.avatarUrl || undefined} />
                        <AvatarFallback className="text-xl font-bold">
                          {activeConv?.otherUser?.username[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-semibold text-foreground">{activeConv?.otherUser?.username}</p>
                      <p className="text-xs mt-1">Say hi! 👋</p>
                    </div>
                  )}

                  <div>
                    {localMessages.map((msg, idx) => {
                      const isMe = msg.senderId === user?.id;
                      const prevMsg = idx > 0 ? localMessages[idx - 1] : null;
                      const nextMsg = idx < localMessages.length - 1 ? localMessages[idx + 1] : null;
                      const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId);
                      const isGroupEnd = !nextMsg || nextMsg.senderId !== msg.senderId;
                      const isLastMine = idx === lastMineIdx;
                      const msgDate = safeDate(msg.createdAt);
                      const prevMsgDate = prevMsg ? safeDate(prevMsg.createdAt) : null;
                      const showDate = msgDate && (!prevMsgDate || msgDate.toDateString() !== prevMsgDate.toDateString());

                      return (
                        <div key={msg.clientId ?? msg.id}>
                          {showDate && msgDate && (
                            <div className="flex items-center gap-3 my-4">
                              <div className="flex-1 h-px bg-border" />
                              <span className="text-[11px] text-muted-foreground">
                                {isToday(msgDate) ? "Today" : isYesterday(msgDate) ? "Yesterday" : format(msgDate, "MMMM d, yyyy")}
                              </span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                          )}
                          <MessageBubble
                            msg={msg} isMe={isMe} isLast={idx === localMessages.length - 1}
                            isLastMine={isLastMine} showAvatar={showAvatar} isGroupEnd={isGroupEnd}
                            otherUserAvatarUrl={
                              activeConv?.isGroup
                                ? (senderInfoMap[msg.senderId]?.avatarUrl)
                                : (activeConv?.otherUser?.avatarUrl || undefined)
                            }
                            otherUserUsername={
                              activeConv?.isGroup
                                ? (senderInfoMap[msg.senderId]?.username ?? "")
                                : (activeConv?.otherUser?.username ?? "")
                            }
                            myId={user!.id}
                            onReact={handleReact} onReply={setReplyTo}
                            onEdit={setEditingMsg} onDelete={handleDelete}
                            onPin={handlePin} onStar={handleStar}
                            onForward={setForwardingMsg}
                          />
                        </div>
                      );
                    })}

                    {/* Typing indicator — 1:1 */}
                    {!activeConv?.isGroup && otherTyping && (
                      <div className="flex items-end gap-2 justify-start mb-3">
                        <div className="w-7 shrink-0">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={activeConv?.otherUser?.avatarUrl || undefined} />
                            <AvatarFallback className="text-xs">{activeConv?.otherUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="bg-secondary rounded-[22px] rounded-bl-md px-4 py-3 flex gap-1 items-center">
                          {otherTypingVoice ? (
                            <span className="text-xs text-muted-foreground">Recording voice…</span>
                          ) : (
                            <>
                              <span className="w-2 h-2 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:0ms]" />
                              <span className="w-2 h-2 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:150ms]" />
                              <span className="w-2 h-2 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:300ms]" />
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Typing indicator — group */}
                    {activeConv?.isGroup && Object.keys(groupTypingUsers).length > 0 && (
                      <div className="flex items-end gap-2 justify-start mb-3">
                        <div className="bg-secondary rounded-[22px] rounded-bl-md px-4 py-3 flex gap-1 items-center">
                          <span className="w-2 h-2 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:0ms]" />
                          <span className="w-2 h-2 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:150ms]" />
                          <span className="w-2 h-2 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:300ms]" />
                          <span className="text-xs text-muted-foreground ml-1">
                            {Object.values(groupTypingUsers).slice(0, 2).join(", ")}
                            {Object.keys(groupTypingUsers).length > 2 && " & others"} typing…
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Message input */}
              <MessageInput
                value={messageText} onChange={handleInputChange}
                onSend={handleSend} onTypingStart={handleTypingStart} onTypingStop={handleTypingStop}
                replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
                editingMsg={editingMsg} onCancelEdit={() => setEditingMsg(null)} onEditSave={handleEditSave}
                otherUserUsername={activeConv?.otherUser?.username ?? ""}
                myId={user?.id ?? ""}
                disabled={isBlocked || isBlockedBy || isMyTimeoutActive}
              />
            </div>

            {/* ── Info panel (slide-in on desktop, fullscreen on mobile) ── */}
            {showInfo && (
              <div className={cn(
                "flex-col bg-card border-l border-border",
                "absolute inset-0 lg:static lg:inset-auto flex w-full lg:w-[320px] lg:shrink-0"
              )}>
                {activeConv?.isGroup ? (
                  <GroupInfoPanel
                    group={{
                      id: activeConv.id,
                      groupName: activeConv.groupName ?? "Group",
                      groupAvatarUrl: activeConv.groupAvatarUrl ?? null,
                      groupDescription: activeConv.groupDescription ?? null,
                      memberCount: activeConv.memberCount ?? (activeConv.members ?? []).length,
                      members: activeConv.members ?? [],
                      adminIds: activeConv.adminIds ?? [],
                      isAdmin: activeConv.isAdmin ?? false,
                      createdBy: activeConv.createdBy ?? "",
                      onlyAdminsCanSend: activeConv.onlyAdminsCanSend ?? false,
                      disappearAfter: disappearAfter,
                      isMuted: activeConv.isMuted ?? false,
                      isArchived: activeConv.isArchived ?? false,
                    }}
                    myId={user?.id ?? ""}
                    sharedMedia={sharedMedia}
                    pinnedMessages={pinnedMessages}
                    starredMessages={starredMessages}
                    onClose={() => setShowInfo(false)}
                    onUpdateGroup={async (data) => {
                      await apiRequest(`groups/${activeConvId}`, { method: "PATCH", body: JSON.stringify(data) });
                      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
                    }}
                    onAddMembers={() => setCreateGroupOpen(true)}
                    onRemoveMember={async (userId) => {
                      await apiRequest(`groups/${activeConvId}/members/${userId}`, { method: "DELETE" });
                      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
                    }}
                    onPromote={async (userId) => {
                      await apiRequest(`groups/${activeConvId}/promote`, { method: "POST", body: JSON.stringify({ userId }) });
                      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
                    }}
                    onDemote={async (userId) => {
                      await apiRequest(`groups/${activeConvId}/demote`, { method: "POST", body: JSON.stringify({ userId }) });
                      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
                    }}
                    onDisappearChange={handleDisappearChange}
                    onLeave={async () => {
                      await apiRequest(`groups/${activeConvId}/leave`, { method: "POST" });
                      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
                      setActiveConvId(null); setShowInfo(false);
                    }}
                    onDelete={async () => {
                      await apiRequest(`groups/${activeConvId}`, { method: "DELETE" });
                      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
                      setActiveConvId(null); setShowInfo(false);
                    }}
                    onToggleMute={() => handleMute(activeConvId, activeConv?.isMuted ?? false)}
                    onToggleArchive={() => handleArchive(activeConvId, activeConv?.isArchived ?? false)}
                    onViewMedia={(url, type) => setMediaViewer({ url, type })}
                  />
                ) : (
                  <ConversationInfoPanel
                    otherUser={activeConv?.otherUser}
                    isOnline={isOtherOnline}
                    disappearAfter={disappearAfter}
                    isMuted={activeConv?.isMuted ?? false}
                    isArchived={activeConv?.isArchived ?? false}
                    sharedMedia={sharedMedia}
                    pinnedMessages={pinnedMessages}
                    starredMessages={starredMessages}
                    myId={user?.id ?? ""}
                    isBlocked={isBlocked}
                    isBlockedBy={isBlockedBy}
                    myTimeoutUntil={myTimeoutUntil}
                    otherTimeoutUntil={otherTimeoutUntil}
                    onBlock={handleBlock}
                    onUnblock={handleUnblock}
                    onTimeout={handleTimeout}
                    onClose={() => setShowInfo(false)}
                    onDisappearChange={handleDisappearChange}
                    onToggleMute={() => handleMute(activeConvId, activeConv?.isMuted ?? false)}
                    onToggleArchive={() => handleArchive(activeConvId, activeConv?.isArchived ?? false)}
                    onNavigateToProfile={() => {
                      setLocation(`/profile/${activeConv?.otherUser?.username}`);
                      setShowInfo(false);
                    }}
                    onViewMedia={(url, type) => setMediaViewer({ url, type })}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* ── Overlays ─────────────────────────────────────────────────────── */}

    {/* Vault */}
    {showVault && (
      <VaultScreen
        onClose={() => { setShowVault(false); setVaultAddConvId(null); setVaultAddConvUser(null); }}
        onOpenConversation={convId => { setShowVault(false); setVaultAddConvId(null); setVaultAddConvUser(null); handleSelectConv(convId); }}
        addConversationId={vaultAddConvId}
        addConversationUser={vaultAddConvUser}
        onAddComplete={() => queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() })}
      />
    )}

    {/* Forward modal */}
    {forwardingMsg && (
      <ForwardModal
        conversations={(allConversations as any[] ?? []).filter((c: any) => c.id !== activeConvId)}
        onForward={handleForward}
        onClose={() => setForwardingMsg(null)}
      />
    )}

    {/* Media viewer */}
    {mediaViewer && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setMediaViewer(null)}>
        <button className="absolute top-4 right-4 text-white p-2" onClick={() => setMediaViewer(null)}>
          <X className="w-6 h-6" />
        </button>
        {mediaViewer.type === "video" ? (
          <video src={mediaViewer.url} controls className="max-w-full max-h-[90vh] rounded-xl" onClick={e => e.stopPropagation()} />
        ) : (
          <img src={mediaViewer.url} alt="" className="max-w-full max-h-[90vh] rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        )}
      </div>
    )}

    {/* Create / Add-to Group modal */}
    {createGroupOpen && (
      <CreateGroupModal
        onClose={() => setCreateGroupOpen(false)}
        onCreate={handleCreateGroup}
        addToGroupId={showInfo && activeConv?.isGroup ? activeConvId ?? undefined : undefined}
        existingMemberIds={showInfo && activeConv?.isGroup ? (activeConv.members ?? []).map((m: any) => m.id) : undefined}
        onAddMembers={showInfo && activeConv?.isGroup ? async (memberUsernames) => {
          await apiRequest(`groups/${activeConvId}/members`, { method: "POST", body: JSON.stringify({ usernames: memberUsernames }) });
          queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
          setCreateGroupOpen(false);
        } : undefined}
      />
    )}
    </>
  );
}
