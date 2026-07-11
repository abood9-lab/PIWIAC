import { Router, type IRouter } from "express";
import { User, Conversation, Message, Notification } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { buildUserSummary } from "./users";
import { buildGroupConversation } from "./groups";
import { uploadBase64 } from "../lib/cloudinary";
import { notifyUserPush } from "../lib/push";
import mongoose from "mongoose";
import type { Server as SocketServer } from "socket.io";

const router: IRouter = Router();

function getIo(req: AuthRequest): SocketServer | undefined {
  return (req as any).app.get("io");
}

function serializeMessage(m: any, replyTo?: any) {
  const reactions: Record<string, string[]> = {};
  if (m.reactions instanceof Map) {
    m.reactions.forEach((ids: mongoose.Types.ObjectId[], emoji: string) => {
      reactions[emoji] = ids.map((id: mongoose.Types.ObjectId) => id.toString());
    });
  }
  return {
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    senderId: m.senderId.toString(),
    text: m.isDeleted ? null : (m.text ?? null),
    mediaUrl: m.isDeleted ? null : (m.isSnap ? null : (m.mediaUrl ?? null)), // hide snap media until opened
    mediaType: m.isDeleted ? null : (m.mediaType ?? null),
    fileName: m.isDeleted ? null : (m.fileName ?? null),
    isRead: m.isRead,
    isEdited: m.isEdited,
    isDeleted: m.isDeleted,
    isForwarded: m.isForwarded ?? false,
    reactions,
    isPinned: m.isPinned,
    starredBy: (m.starredBy ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
    clientId: m.clientId ?? null,
    replyToId: m.replyToId?.toString() ?? null,
    isSnap: m.isSnap ?? false,
    viewOnce: m.viewOnce ?? false,
    viewsLeft: m.viewsLeft ?? null,
    viewedBy: (m.viewedBy ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
    replyTo: replyTo ? {
      id: replyTo._id.toString(),
      senderId: replyTo.senderId.toString(),
      text: replyTo.isDeleted ? null : (replyTo.text ?? null),
      mediaType: replyTo.isDeleted ? null : (replyTo.mediaType ?? null),
    } : null,
    readBy: (m.readBy ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

async function buildConversation(conv: any, meId: string) {
  if (conv.isGroup) return buildGroupConversation(conv, meId);
  const otherId = conv.user1Id.toString() === meId ? conv.user2Id : conv.user1Id;
  const [meUser, otherUser] = await Promise.all([User.findById(meId), User.findById(otherId)]);
  const lastMsg: any = await Message.findOne({ conversationId: conv._id, isDeleted: false }).sort({ createdAt: -1 });
  const unreadCount = await Message.countDocuments({ conversationId: conv._id, senderId: { $ne: meId }, isRead: false, isDeleted: false });
  const isArchived = (conv.isArchivedBy ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === meId);
  const isMuted = (conv.isMutedBy ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === meId);
  // A conversation is a "request" if the other user doesn't follow the current user
  const otherFollowsMe = (otherUser?.following ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === meId);
  const isRequest = !otherFollowsMe;
  // Block status
  const isBlocked = (meUser?.blockedUsers ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === otherId.toString());
  const isBlockedBy = (otherUser?.blockedUsers ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === meId);
  // Timeout status (who is restricted from sending in this conversation)
  const now = new Date();
  const myTimeout = (conv.timeoutEntries ?? []).find((e: any) => e.userId.toString() === meId && new Date(e.until) > now);
  const otherTimeout = (conv.timeoutEntries ?? []).find((e: any) => e.userId.toString() === otherId.toString() && new Date(e.until) > now);
  return {
    id: conv._id.toString(),
    otherUser: await buildUserSummary(otherUser, meId),
    lastMessage: lastMsg ? (lastMsg.isDeleted ? "Message deleted" : (lastMsg.text ?? (lastMsg.mediaUrl ? ("[" + (lastMsg.mediaType ?? "media") + "]") : null))) : null,
    lastMessageAt: lastMsg?.createdAt?.toISOString() ?? conv.lastActivityAt?.toISOString() ?? null,
    unreadCount,
    isArchived,
    isMuted,
    isRequest,
    disappearAfter: conv.disappearAfter ?? null,
    isBlocked,
    isBlockedBy,
    myTimeoutUntil: myTimeout ? new Date(myTimeout.until).toISOString() : null,
    otherTimeoutUntil: otherTimeout ? new Date(otherTimeout.until).toISOString() : null,
  };
}

// ── Conversation membership guard ──────────────────────────────────────────
async function assertParticipant(conversationId: string, userId: string): Promise<boolean> {
  const conv = await Conversation.findById(conversationId).catch(() => null);
  if (!conv) return false;
  if (conv.isGroup) {
    return (conv.memberIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === userId);
  }
  return conv.user1Id?.toString() === userId || conv.user2Id?.toString() === userId;
}

// ── Disappear-aware message time filter ────────────────────────────────────
function disappearFilter(disappearAfter: string | null): Date | null {
  if (!disappearAfter) return null;
  const map: Record<string, number> = { "1h": 60 * 60 * 1000, "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000 };
  const ms = map[disappearAfter];
  return ms ? new Date(Date.now() - ms) : null;
}

router.get("/conversations", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const showArchived = req.query.archived === "true";
  const { VaultConversation } = await import("@workspace/db");
  const vaulted = await VaultConversation.find({ userId: req.userId }).select("conversationId");
  const vaultedIds = vaulted.map((v: any) => v.conversationId.toString());
  const convs = await Conversation.find({
    $or: [
      { user1Id: req.userId, isGroup: { $ne: true } },
      { user2Id: req.userId, isGroup: { $ne: true } },
      { isGroup: true, memberIds: req.userId },
    ],
    _id: { $nin: vaultedIds },
  }).sort({ lastActivityAt: -1 });
  const all = await Promise.all(convs.map(c => buildConversation(c, req.userId!)));
  const filtered = showArchived ? all.filter(c => c.isArchived) : all.filter(c => !c.isArchived);
  res.json(filtered);
});

router.post("/conversations", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  if (!username) { res.status(400).json({ error: "username required" }); return; }
  const otherUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });
  if (!otherUser) { res.status(404).json({ error: "User not found" }); return; }
  if (otherUser._id.toString() === req.userId) { res.status(400).json({ error: "Cannot message yourself" }); return; }
  // Don't reveal that the user is blocked — just silently fail with 404
  const iAmBlockedByThem = (otherUser.blockedUsers ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (iAmBlockedByThem) { res.status(404).json({ error: "User not found" }); return; }
  const existing = await Conversation.findOne({
    $or: [
      { user1Id: req.userId, user2Id: otherUser._id },
      { user1Id: otherUser._id, user2Id: req.userId },
    ],
  });
  if (existing) { res.json(await buildConversation(existing, req.userId!)); return; }
  const conv = await Conversation.create({ user1Id: req.userId, user2Id: otherUser._id });
  res.json(await buildConversation(conv, req.userId!));
});

// ── Mark conversation as read ────────────────────────────────────────────────
router.post("/conversations/:conversationId/read", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conversationId = req.params.conversationId as string;
  const conv = await Conversation.findById(conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  const isMember = conv.isGroup
    ? (conv.memberIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId)
    : (conv.user1Id?.toString() === req.userId || conv.user2Id?.toString() === req.userId);
  if (!isMember) { res.status(403).json({ error: "Not a participant" }); return; }

  if (conv.isGroup) {
    const meOid = new mongoose.Types.ObjectId(req.userId!);
    await Message.updateMany(
      { conversationId, senderId: { $ne: meOid }, isDeleted: false },
      { $addToSet: { readBy: meOid } }
    );
  } else {
    await Message.updateMany(
      { conversationId, senderId: { $ne: req.userId }, isRead: false },
      { isRead: true, updatedAt: new Date() }
    );
  }
  res.json({ ok: true });
});

router.patch("/conversations/:conversationId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { action } = req.body as { action: string };
  const conv = await Conversation.findById(req.params.conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  // IDOR guard: only participants may mutate their own conversation state
  if (conv.user1Id.toString() !== req.userId && conv.user2Id.toString() !== req.userId) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const meId = new mongoose.Types.ObjectId(req.userId!);
  if (action === "archive") await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { isArchivedBy: meId } });
  if (action === "unarchive") await Conversation.findByIdAndUpdate(conv._id, { $pull: { isArchivedBy: meId } });
  if (action === "mute") await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { isMutedBy: meId } });
  if (action === "unmute") await Conversation.findByIdAndUpdate(conv._id, { $pull: { isMutedBy: meId } });
  res.json({ ok: true });
});

// ── Block / Unblock ──────────────────────────────────────────────────────────
router.post("/conversations/:conversationId/block", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findById(req.params.conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.user1Id.toString() !== req.userId && conv.user2Id.toString() !== req.userId) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const otherId = conv.user1Id.toString() === req.userId ? conv.user2Id : conv.user1Id;
  await User.findByIdAndUpdate(req.userId, { $addToSet: { blockedUsers: otherId } });
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("block_changed", {
      conversationId: conv._id.toString(),
      blockerId: req.userId,
      isBlocked: true,
    });
  }
  res.json({ ok: true, isBlocked: true });
});

router.post("/conversations/:conversationId/unblock", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findById(req.params.conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.user1Id.toString() !== req.userId && conv.user2Id.toString() !== req.userId) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const otherId = conv.user1Id.toString() === req.userId ? conv.user2Id : conv.user1Id;
  await User.findByIdAndUpdate(req.userId, { $pull: { blockedUsers: otherId } });
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("block_changed", {
      conversationId: conv._id.toString(),
      blockerId: req.userId,
      isBlocked: false,
    });
  }
  res.json({ ok: true, isBlocked: false });
});

// ── Timeout (restrict user from messaging for a period) ───────────────────────
router.post("/conversations/:conversationId/timeout", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { duration } = req.body as { duration?: string | null }; // "15m"|"1h"|"24h"|"7d"|null
  const conv = await Conversation.findById(req.params.conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.user1Id.toString() !== req.userId && conv.user2Id.toString() !== req.userId) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const otherId = conv.user1Id.toString() === req.userId ? conv.user2Id : conv.user1Id;
  // Remove any existing timeout for the other user first
  await Conversation.findByIdAndUpdate(conv._id, { $pull: { timeoutEntries: { userId: otherId } } });
  if (!duration) {
    const io0 = getIo(req);
    if (io0) {
      io0.to(`conversation:${conv._id}`).emit("timeout_changed", {
        conversationId: conv._id.toString(),
        restrictedUserId: otherId.toString(),
        until: null,
      });
    }
    res.json({ ok: true, until: null }); return;
  }
  const durationMap: Record<string, number> = { "15m": 15, "1h": 60, "24h": 1440, "7d": 10080 };
  const minutes = durationMap[duration];
  if (!minutes) { res.status(400).json({ error: "Invalid duration. Use 15m, 1h, 24h, or 7d" }); return; }
  const until = new Date(Date.now() + minutes * 60 * 1000);
  await Conversation.findByIdAndUpdate(conv._id, { $push: { timeoutEntries: { userId: otherId, until } } });
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("timeout_changed", {
      conversationId: conv._id.toString(),
      restrictedUserId: otherId.toString(),
      until: until.toISOString(),
    });
  }
  res.json({ ok: true, until: until.toISOString() });
});

// ── Disappearing messages toggle ────────────────────────────────────────────
router.patch("/conversations/:conversationId/disappear", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { disappearAfter } = req.body as { disappearAfter?: string | null };
  const valid = [null, "1h", "24h", "7d"];
  if (!valid.includes(disappearAfter ?? null)) { res.status(400).json({ error: "Invalid disappearAfter value" }); return; }
  const conv = await Conversation.findById(req.params.conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.user1Id.toString() !== req.userId && conv.user2Id.toString() !== req.userId) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  await Conversation.findByIdAndUpdate(conv._id, { disappearAfter: disappearAfter ?? null });
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("disappear_changed", {
      conversationId: conv._id.toString(),
      disappearAfter: disappearAfter ?? null,
    });
  }
  res.json({ ok: true, disappearAfter: disappearAfter ?? null });
});

router.get("/conversations/:conversationId/messages", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conversationId = req.params.conversationId as string;
  if (!(await assertParticipant(conversationId, req.userId!))) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const limit = Math.min(parseInt(String(req.query.limit ?? "40"), 10), 100);
  const before = req.query.before ? new mongoose.Types.ObjectId(String(req.query.before)) : undefined;
  const after = req.query.after ? new mongoose.Types.ObjectId(String(req.query.after)) : undefined;
  const filter: any = { conversationId };
  if (before) filter._id = { $lt: before };
  if (after) filter._id = { ...(filter._id ?? {}), $gt: after };
  // Apply disappearing filter
  const conv = await Conversation.findById(conversationId).catch(() => null);
  if (conv?.disappearAfter) {
    const cutoff = disappearFilter(conv.disappearAfter);
    if (cutoff) filter.createdAt = { $gt: cutoff };
  }
  const msgs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit);
  const replyIds = msgs.map(m => m.replyToId).filter(Boolean);
  const replyMsgs = replyIds.length ? await Message.find({ _id: { $in: replyIds } }) : [];
  const replyMap = new Map(replyMsgs.map(m => [m._id.toString(), m]));
  res.json({ messages: msgs.reverse().map(m => serializeMessage(m, replyMap.get(m.replyToId?.toString() ?? "") ?? null)), hasMore: msgs.length === limit });
});

router.post("/conversations/:conversationId/messages", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conversationId = req.params.conversationId as string;
  const conv = await Conversation.findById(conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const { text, mediaUrl, mediaType, fileName, clientId, replyToId, isSnap, viewOnce, maxViews } = req.body as any;

  // ── Group conversation checks ─────────────────────────────────────────────
  if (conv.isGroup) {
    const isMember = (conv.memberIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
    if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }
    if (conv.onlyAdminsCanSend) {
      const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
      if (!isAdmin) { res.status(403).json({ error: "Only admins can send messages in this group" }); return; }
    }
    if (clientId) {
      const existing = await Message.findOne({ conversationId, clientId });
      if (existing) { res.status(200).json(serializeMessage(existing)); return; }
    }
    const msg = await Message.create({ conversationId, senderId: req.userId, text, mediaUrl, mediaType, fileName: fileName ?? null, replyToId: replyToId ?? null, clientId: clientId ?? null });
    await Conversation.findByIdAndUpdate(conversationId, { lastActivityAt: new Date() });
    // Notify all members except sender
    const recipientIds = (conv.memberIds ?? []).filter((id: mongoose.Types.ObjectId) => id.toString() !== req.userId);
    await Promise.all(recipientIds.map((id: mongoose.Types.ObjectId) =>
      Notification.create({ userId: id, actorId: req.userId, type: "message" }).catch(() => {})
    ));
    for (const id of recipientIds) {
      notifyUserPush(id.toString(), req.userId!, "message").catch(() => {});
    }
    let replyMsg = null;
    if (replyToId) replyMsg = await Message.findById(replyToId).catch(() => null);
    const msgData = serializeMessage(msg, replyMsg);
    const io = getIo(req);
    if (io) {
      io.to(`conversation:${conversationId}`).emit("new_message", msgData);
      for (const rid of recipientIds) {
        io.to(`user:${rid}`).emit("new_message", msgData);
      }
    }
    return res.status(201).json(msgData);
  }

  // ── 1:1 conversation checks ───────────────────────────────────────────────
  if (conv.user1Id?.toString() !== req.userId && conv.user2Id?.toString() !== req.userId) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const recipientId = conv.user1Id?.toString() === req.userId ? conv.user2Id : conv.user1Id;
  const [meUser, recipientUser] = await Promise.all([User.findById(req.userId), User.findById(recipientId)]);
  const iBlocked = (meUser?.blockedUsers ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === recipientId?.toString());
  const theyBlocked = (recipientUser?.blockedUsers ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (iBlocked || theyBlocked) { res.status(403).json({ error: "blocked" }); return; }
  const now = new Date();
  const myTimeout = (conv.timeoutEntries ?? []).find((e: any) => e.userId.toString() === req.userId && new Date(e.until) > now);
  if (myTimeout) { res.status(403).json({ error: "restricted", until: new Date(myTimeout.until).toISOString() }); return; }
  if (clientId) {
    const existing = await Message.findOne({ conversationId, clientId });
    if (existing) { res.status(200).json(serializeMessage(existing)); return; }
  }
  const snapFields = isSnap ? { isSnap: true, viewOnce: viewOnce ?? false, viewsLeft: maxViews ?? null, viewedBy: [] } : {};
  const msg = await Message.create({ conversationId, senderId: req.userId, text, mediaUrl, mediaType, fileName: fileName ?? null, replyToId: replyToId ?? null, clientId: clientId ?? null, ...snapFields });
  await Conversation.findByIdAndUpdate(conversationId, { lastActivityAt: new Date() });
  await Notification.create({ userId: recipientId, actorId: req.userId, type: "message" });
  notifyUserPush(recipientId!.toString(), req.userId!, "message").catch(() => {});
  let replyMsg = null;
  if (replyToId) replyMsg = await Message.findById(replyToId);
  const msgData = serializeMessage(msg, replyMsg);
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conversationId}`).emit("new_message", msgData);
    io.to(`user:${recipientId}`).emit("new_message", msgData);
  }
  res.status(201).json(msgData);
});

// ── Forward message ──────────────────────────────────────────────────────────
router.post("/messages/:messageId/forward", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { conversationId } = req.body as { conversationId: string };
  if (!conversationId) { res.status(400).json({ error: "conversationId required" }); return; }
  const originalMsg = await Message.findById(req.params.messageId).catch(() => null);
  if (!originalMsg || originalMsg.isDeleted) { res.status(404).json({ error: "Message not found" }); return; }
  // Verify requester is a participant in the source conversation
  if (!(await assertParticipant(originalMsg.conversationId.toString(), req.userId!))) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const targetConv = await Conversation.findById(conversationId).catch(() => null);
  if (!targetConv) { res.status(404).json({ error: "Conversation not found" }); return; }
  // Verify requester is a participant in the target conversation
  if (targetConv.user1Id.toString() !== req.userId && targetConv.user2Id.toString() !== req.userId) {
    res.status(403).json({ error: "Not a participant in target conversation" }); return;
  }
  // ── Block check (target conversation) ───────────────────────────────────
  const fwdRecipientId = targetConv.user1Id.toString() === req.userId ? targetConv.user2Id : targetConv.user1Id;
  const [fwdMeUser, fwdRecipientUser] = await Promise.all([User.findById(req.userId), User.findById(fwdRecipientId)]);
  const fwdIBlocked = (fwdMeUser?.blockedUsers ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === fwdRecipientId.toString());
  const fwdTheyBlocked = (fwdRecipientUser?.blockedUsers ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (fwdIBlocked || fwdTheyBlocked) { res.status(403).json({ error: "blocked" }); return; }
  // ── Timeout check (target conversation) ─────────────────────────────────
  const fwdNow = new Date();
  const fwdMyTimeout = (targetConv.timeoutEntries ?? []).find((e: any) => e.userId.toString() === req.userId && new Date(e.until) > fwdNow);
  if (fwdMyTimeout) { res.status(403).json({ error: "restricted", until: new Date(fwdMyTimeout.until).toISOString() }); return; }
  const clientId = `fwd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const newMsg = await Message.create({
    conversationId,
    senderId: req.userId,
    text: originalMsg.text,
    mediaUrl: originalMsg.mediaUrl,
    mediaType: originalMsg.mediaType,
    isForwarded: true,
    clientId,
  });
  await Conversation.findByIdAndUpdate(conversationId, { lastActivityAt: new Date() });
  await Notification.create({ userId: fwdRecipientId, actorId: req.userId, type: "message" });
  notifyUserPush(fwdRecipientId.toString(), req.userId!, "message").catch(() => {});
  const msgData = serializeMessage(newMsg);
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conversationId}`).emit("new_message", msgData);
    io.to(`user:${fwdRecipientId}`).emit("new_message", msgData);
  }
  res.status(201).json(msgData);
});

router.patch("/messages/:messageId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { text } = req.body as { text: string };
  if (!text?.trim()) { res.status(400).json({ error: "Text required" }); return; }
  if (text.length > 4000) { res.status(400).json({ error: "Message too long" }); return; }
  const msg = await Message.findById(req.params.messageId).catch(() => null);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  if (msg.senderId.toString() !== req.userId) { res.status(403).json({ error: "Not your message" }); return; }
  if (msg.isDeleted) { res.status(400).json({ error: "Deleted message" }); return; }
  const updated = await Message.findByIdAndUpdate(msg._id, { text: text.trim(), isEdited: true, updatedAt: new Date() }, { new: true });
  const msgData = serializeMessage(updated);
  const io = getIo(req);
  if (io) io.to(`conversation:${msg.conversationId}`).emit("message_edited", msgData);
  res.json(msgData);
});

router.delete("/messages/:messageId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const msg = await Message.findById(req.params.messageId).catch(() => null);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  if (msg.senderId.toString() !== req.userId) { res.status(403).json({ error: "Not your message" }); return; }
  const updated = await Message.findByIdAndUpdate(msg._id, { isDeleted: true, text: null, mediaUrl: null, updatedAt: new Date() }, { new: true });
  const msgData = serializeMessage(updated);
  const io = getIo(req);
  if (io) io.to(`conversation:${msg.conversationId}`).emit("message_deleted", msgData);
  res.json(msgData);
});

router.post("/messages/:messageId/react", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { emoji } = req.body as { emoji: string };
  const ALLOWED = ["❤️", "👍", "😂", "🔥", "😮", "😢", "👎", "🎉"];
  if (!emoji || !ALLOWED.includes(emoji)) { res.status(400).json({ error: "Invalid emoji" }); return; }
  const msg = await Message.findById(req.params.messageId).catch(() => null);
  if (!msg || msg.isDeleted) { res.status(404).json({ error: "Not found" }); return; }
  const meId = new mongoose.Types.ObjectId(req.userId!);
  const reactions: Map<string, mongoose.Types.ObjectId[]> = msg.reactions instanceof Map ? msg.reactions : new Map(Object.entries(msg.reactions ?? {}));
  const users = reactions.get(emoji) ?? [];
  const hasReacted = users.some(id => id.toString() === req.userId);
  if (hasReacted) {
    const filtered = users.filter(id => id.toString() !== req.userId);
    if (filtered.length === 0) reactions.delete(emoji);
    else reactions.set(emoji, filtered);
  } else {
    reactions.set(emoji, [...users, meId]);
  }
  const updated = await Message.findByIdAndUpdate(msg._id, { reactions, updatedAt: new Date() }, { new: true });
  const msgData = serializeMessage(updated);
  const io = getIo(req);
  if (io) io.to(`conversation:${msg.conversationId}`).emit("message_reaction", msgData);
  res.json(msgData);
});

router.post("/messages/:messageId/pin", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const msg = await Message.findById(req.params.messageId).catch(() => null);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  const updated = await Message.findByIdAndUpdate(msg._id, { isPinned: !msg.isPinned }, { new: true });
  const msgData = serializeMessage(updated);
  const io = getIo(req);
  if (io) io.to(`conversation:${msg.conversationId}`).emit("message_pinned", msgData);
  res.json(msgData);
});

router.post("/messages/:messageId/star", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const meId = new mongoose.Types.ObjectId(req.userId!);
  const msg = await Message.findById(req.params.messageId).catch(() => null);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  const isStarred = (msg.starredBy ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  const updated = isStarred
    ? await Message.findByIdAndUpdate(msg._id, { $pull: { starredBy: meId } }, { new: true })
    : await Message.findByIdAndUpdate(msg._id, { $addToSet: { starredBy: meId } }, { new: true });
  res.json(serializeMessage(updated));
});

router.get("/conversations/:conversationId/pinned", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const msgs = await Message.find({ conversationId: req.params.conversationId, isPinned: true, isDeleted: false }).sort({ createdAt: -1 });
  res.json(msgs.map(m => serializeMessage(m)));
});

router.get("/conversations/:conversationId/starred", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const msgs = await Message.find({ conversationId: req.params.conversationId, isDeleted: false, starredBy: req.userId }).sort({ createdAt: -1 });
  res.json(msgs.map(m => serializeMessage(m)));
});

router.get("/conversations/:conversationId/media", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!(await assertParticipant(req.params.conversationId as string, req.userId!))) {
    res.status(403).json({ error: "Not a participant" }); return;
  }
  const msgs = await Message.find({ conversationId: req.params.conversationId, isDeleted: false, mediaUrl: { $ne: null } }).sort({ createdAt: -1 }).limit(50);
  res.json(msgs.map(m => serializeMessage(m)));
});

router.get("/conversations/:conversationId/search", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json([]); return; }
  const msgs = await Message.find({ conversationId: req.params.conversationId, isDeleted: false, text: { $regex: q, $options: "i" } }).sort({ createdAt: -1 }).limit(30);
  res.json(msgs.map(m => serializeMessage(m)));
});

// ── Media uploads ────────────────────────────────────────────────────────────
router.post("/messages/upload", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { data, mimeType } = req.body as { data?: string; mimeType?: string };
  if (!data || !mimeType) { res.status(400).json({ error: "data and mimeType required" }); return; }
  const folder = mimeType.startsWith("audio/") ? "voice_messages" : "messages";
  const result = await uploadBase64(data, mimeType, folder);
  res.json({ url: result.url, publicId: result.publicId, resourceType: result.resourceType });
});

router.post("/messages/upload-voice", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { data, mimeType } = req.body as { data?: string; mimeType?: string };
  if (!data || !mimeType) { res.status(400).json({ error: "data and mimeType required" }); return; }
  const result = await uploadBase64(data, mimeType ?? "audio/webm", "voice_messages");
  res.json({ url: result.url, publicId: result.publicId, resourceType: result.resourceType });
});

router.post("/messages/upload-file", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { data, mimeType } = req.body as { data?: string; mimeType?: string };
  if (!data || !mimeType) { res.status(400).json({ error: "data and mimeType required" }); return; }
  const result = await uploadBase64(data, mimeType, "documents");
  res.json({ url: result.url, publicId: result.publicId, resourceType: result.resourceType });
});

// ── Snap viewed ──────────────────────────────────────────────────────────────
router.post("/messages/:messageId/snap-viewed", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const msg = await Message.findById(req.params.messageId as string).catch(() => null);
  if (!msg || msg.isDeleted) { res.status(404).json({ error: "Message not found" }); return; }
  if (!msg.isSnap) { res.status(400).json({ error: "Not a snap message" }); return; }

  // Verify requester is a participant in the conversation
  const conv = await Conversation.findById(msg.conversationId).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const isParticipant = conv.user1Id.toString() === req.userId || conv.user2Id.toString() === req.userId;
  if (!isParticipant) { res.status(403).json({ error: "Not a participant" }); return; }

  const viewerId = new mongoose.Types.ObjectId(req.userId!);
  const isSender = msg.senderId.toString() === req.userId;
  const alreadyViewed = (msg.viewedBy ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);

  // Sender can always see their own snap
  if (!isSender) {
    // Enforce view limits for recipients
    if (!alreadyViewed) {
      // First time this user opens snap — check if views are exhausted
      if (msg.viewsLeft !== null && msg.viewsLeft <= 0) {
        res.status(403).json({ error: "انتهت مرات الفتح لهذا السناب", viewsLeft: 0 });
        return;
      }
      // Atomically decrement and add to viewedBy
      const update: any = { $addToSet: { viewedBy: viewerId }, isRead: true };
      if (msg.viewsLeft !== null) update.$inc = { viewsLeft: -1 };
      await Message.findByIdAndUpdate(msg._id, update);
    } else {
      // Already viewed by this user — only allow if views still unlimited or > 0 at the message level
      const remainingViews = msg.viewsLeft;
      if (remainingViews !== null && remainingViews <= 0) {
        res.status(403).json({ error: "انتهت مرات الفتح لهذا السناب", viewsLeft: 0 });
        return;
      }
    }
  }

  // Re-fetch updated message to get accurate viewsLeft
  const updated = await Message.findById(msg._id);
  const currentViewsLeft = updated?.viewsLeft ?? null;

  // Return with media URL revealed
  res.json({ ...serializeMessage(updated ?? msg), mediaUrl: msg.mediaUrl ?? null, viewsLeft: currentViewsLeft });
});

export default router;
