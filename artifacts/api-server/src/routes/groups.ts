import { Router, type IRouter } from "express";
import { Conversation, Message, User, Notification } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { buildUserSummary } from "./users";
import { uploadBase64 } from "../lib/cloudinary";
import mongoose from "mongoose";
import type { Server as SocketServer } from "socket.io";

const router: IRouter = Router();

function getIo(req: AuthRequest): SocketServer | undefined {
  return (req as any).app.get("io");
}

// ── Build a serialised group conversation object ────────────────────────────
export async function buildGroupConversation(conv: any, meId: string) {
  const isArchived = (conv.isArchivedBy ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === meId);
  const isMuted = (conv.isMutedBy ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === meId);
  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === meId);

  const lastMsg: any = await Message.findOne({ conversationId: conv._id, isDeleted: false }).sort({ createdAt: -1 });

  // Unread: messages sent by others that don't have meId in readBy
  const meOid = new mongoose.Types.ObjectId(meId);
  const unreadCount = await Message.countDocuments({
    conversationId: conv._id,
    senderId: { $ne: meOid },
    readBy: { $not: { $elemMatch: { $eq: meOid } } },
    isDeleted: false,
  });

  const memberUsers = await User.find({ _id: { $in: conv.memberIds ?? [] } });
  const members = await Promise.all(memberUsers.map((u: any) => buildUserSummary(u, meId)));

  return {
    id: conv._id.toString(),
    isGroup: true,
    groupName: conv.groupName || "Group",
    groupAvatarUrl: conv.groupAvatarUrl ?? null,
    groupDescription: conv.groupDescription ?? null,
    memberCount: (conv.memberIds ?? []).length,
    members,
    adminIds: (conv.adminIds ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
    isAdmin,
    createdBy: conv.createdBy?.toString() ?? null,
    onlyAdminsCanSend: conv.onlyAdminsCanSend ?? false,
    lastMessage: lastMsg
      ? (lastMsg.isDeleted
          ? "Message deleted"
          : (lastMsg.text ?? (lastMsg.mediaUrl ? `[${lastMsg.mediaType ?? "media"}]` : null)))
      : null,
    lastMessageAt: lastMsg?.createdAt?.toISOString() ?? conv.lastActivityAt?.toISOString() ?? null,
    unreadCount,
    isArchived,
    isMuted,
    disappearAfter: conv.disappearAfter ?? null,
    // Groups don't have 1:1 block/timeout mechanics
    isBlocked: false,
    isBlockedBy: false,
    myTimeoutUntil: null,
    otherTimeoutUntil: null,
    isRequest: false,
    otherUser: null,
  };
}

// ── Search users to add ─────────────────────────────────────────────────────
router.get("/groups/user-search", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.json([]); return; }
  const users = await User.find({
    _id: { $ne: req.userId },
    $or: [
      { username: { $regex: q, $options: "i" } },
      { fullName: { $regex: q, $options: "i" } },
    ],
  }).limit(15);
  const results = await Promise.all(users.map((u: any) => buildUserSummary(u, req.userId!)));
  res.json(results);
});

// ── Create group ────────────────────────────────────────────────────────────
router.post("/groups", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { name, description, memberUsernames, avatarData } = req.body as {
    name?: string;
    description?: string;
    memberUsernames?: string[];
    avatarData?: string;
  };

  if (!name?.trim()) { res.status(400).json({ error: "Group name required" }); return; }
  if (!Array.isArray(memberUsernames) || memberUsernames.length === 0) {
    res.status(400).json({ error: "At least one member required" }); return;
  }
  if (memberUsernames.length > 255) { res.status(400).json({ error: "Too many members (max 255)" }); return; }

  const users = await User.find({ username: { $in: memberUsernames } });
  const memberIds: mongoose.Types.ObjectId[] = users.map((u: any) => u._id);
  const creatorOid = new mongoose.Types.ObjectId(req.userId!);

  if (!memberIds.some(id => id.toString() === req.userId)) {
    memberIds.push(creatorOid);
  }

  let groupAvatarUrl: string | null = null;
  if (avatarData) {
    try {
      const result = await uploadBase64(avatarData, "image/jpeg", "group_avatars");
      groupAvatarUrl = result.url;
    } catch { /* continue without avatar */ }
  }

  const conv = await Conversation.create({
    isGroup: true,
    groupName: name.trim(),
    groupDescription: description?.trim() ?? null,
    groupAvatarUrl,
    memberIds,
    adminIds: [creatorOid],
    createdBy: creatorOid,
    onlyAdminsCanSend: false,
  });

  const io = getIo(req);
  if (io) {
    for (const memberId of memberIds) {
      if (memberId.toString() !== req.userId) {
        io.to(`user:${memberId}`).emit("group_created", { groupId: conv._id.toString() });
      }
    }
  }

  res.status(201).json(await buildGroupConversation(conv, req.userId!));
});

// ── Get group info ──────────────────────────────────────────────────────────
router.get("/groups/:groupId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }
  const isMember = (conv.memberIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!isMember) { res.status(403).json({ error: "Not a member" }); return; }
  res.json(await buildGroupConversation(conv, req.userId!));
});

// ── Update group info (admin only) ──────────────────────────────────────────
router.patch("/groups/:groupId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }
  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!isAdmin) { res.status(403).json({ error: "Only admins can update group info" }); return; }

  const { name, description, avatarData, onlyAdminsCanSend } = req.body as any;
  const updates: Record<string, any> = {};

  if (name !== undefined) updates.groupName = String(name).trim().slice(0, 60);
  if (description !== undefined) updates.groupDescription = description ? String(description).trim().slice(0, 200) : null;
  if (onlyAdminsCanSend !== undefined) updates.onlyAdminsCanSend = Boolean(onlyAdminsCanSend);

  if (avatarData) {
    try {
      const result = await uploadBase64(avatarData, "image/jpeg", "group_avatars");
      updates.groupAvatarUrl = result.url;
    } catch { /* ignore upload errors */ }
  }

  const updated = await Conversation.findByIdAndUpdate(conv._id, updates, { new: true });

  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("group_updated", {
      groupId: conv._id.toString(),
      ...updates,
    });
  }

  res.json(await buildGroupConversation(updated, req.userId!));
});

// ── Add members (admin only) ────────────────────────────────────────────────
router.post("/groups/:groupId/members", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }
  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!isAdmin) { res.status(403).json({ error: "Only admins can add members" }); return; }

  const { usernames } = req.body as { usernames?: string[] };
  if (!Array.isArray(usernames) || usernames.length === 0) { res.status(400).json({ error: "usernames required" }); return; }

  const users = await User.find({ username: { $in: usernames } });
  if (users.length === 0) { res.status(404).json({ error: "No users found" }); return; }

  const newMemberIds: mongoose.Types.ObjectId[] = users.map((u: any) => u._id);
  await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { memberIds: { $each: newMemberIds } } });

  const io = getIo(req);
  if (io) {
    for (const memberId of newMemberIds) {
      io.to(`user:${memberId}`).emit("group_created", { groupId: conv._id.toString() });
    }
    io.to(`conversation:${conv._id}`).emit("group_members_changed", {
      groupId: conv._id.toString(),
      action: "added",
      userIds: newMemberIds.map(id => id.toString()),
    });
  }

  const updated = await Conversation.findById(conv._id);
  res.json(await buildGroupConversation(updated, req.userId!));
});

// ── Remove member (admin only, or self-remove) ──────────────────────────────
router.delete("/groups/:groupId/members/:userId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }

  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  const isSelf = req.params.userId === req.userId;

  if (!isAdmin && !isSelf) { res.status(403).json({ error: "Only admins can remove members" }); return; }

  const targetStr = String(req.params.userId);
  const targetOid = new mongoose.Types.ObjectId(targetStr);

  // Prevent removing the last admin
  const isTargetAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === targetStr);
  if (isTargetAdmin && (conv.adminIds ?? []).length === 1 && (conv.memberIds ?? []).length > 1) {
    res.status(400).json({ error: "Transfer admin role before removing the last admin" }); return;
  }

  await Conversation.findByIdAndUpdate(conv._id, { $pull: { memberIds: targetOid, adminIds: targetOid } });

  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("group_members_changed", {
      groupId: conv._id.toString(),
      action: "removed",
      userIds: [targetStr],
    });
    io.to(`user:${targetStr}`).emit("group_removed", { groupId: conv._id.toString() });
  }

  res.json({ ok: true });
});

// ── Leave group ─────────────────────────────────────────────────────────────
router.post("/groups/:groupId/leave", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }

  const isMember = (conv.memberIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!isMember) { res.status(400).json({ error: "Not a member" }); return; }

  const meOid = new mongoose.Types.ObjectId(req.userId!);
  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  const remainingMembers = (conv.memberIds ?? []).filter((id: mongoose.Types.ObjectId) => id.toString() !== req.userId);

  // Transfer admin if last admin is leaving but others remain
  if (isAdmin && (conv.adminIds ?? []).length === 1 && remainingMembers.length > 0) {
    await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { adminIds: remainingMembers[0] } });
  }

  await Conversation.findByIdAndUpdate(conv._id, { $pull: { memberIds: meOid, adminIds: meOid } });

  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("group_members_changed", {
      groupId: conv._id.toString(),
      action: "left",
      userIds: [req.userId!],
    });
  }

  res.json({ ok: true });
});

// ── Promote member to admin ──────────────────────────────────────────────────
router.post("/groups/:groupId/promote", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }
  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!isAdmin) { res.status(403).json({ error: "Only admins can promote members" }); return; }

  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const isMember = (conv.memberIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === userId);
  if (!isMember) { res.status(400).json({ error: "User is not a member" }); return; }

  const targetOid = new mongoose.Types.ObjectId(userId);
  await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { adminIds: targetOid } });

  const updated = await Conversation.findById(conv._id);
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("group_updated", {
      groupId: conv._id.toString(),
      adminIds: (updated?.adminIds ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
    });
  }

  res.json(await buildGroupConversation(updated, req.userId!));
});

// ── Demote admin to member ───────────────────────────────────────────────────
router.post("/groups/:groupId/demote", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }
  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!isAdmin) { res.status(403).json({ error: "Only admins can demote members" }); return; }

  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  if (userId === req.userId) { res.status(400).json({ error: "Cannot demote yourself" }); return; }
  if ((conv.adminIds ?? []).length <= 1) { res.status(400).json({ error: "Cannot demote the only admin" }); return; }

  const targetOid = new mongoose.Types.ObjectId(userId);
  await Conversation.findByIdAndUpdate(conv._id, { $pull: { adminIds: targetOid } });

  const updated = await Conversation.findById(conv._id);
  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("group_updated", {
      groupId: conv._id.toString(),
      adminIds: (updated?.adminIds ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
    });
  }

  res.json(await buildGroupConversation(updated, req.userId!));
});

// ── Delete group (admin only) ────────────────────────────────────────────────
router.delete("/groups/:groupId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const conv = await Conversation.findOne({ _id: req.params.groupId, isGroup: true }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Group not found" }); return; }
  const isAdmin = (conv.adminIds ?? []).some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!isAdmin) { res.status(403).json({ error: "Only admins can delete the group" }); return; }

  const io = getIo(req);
  if (io) {
    io.to(`conversation:${conv._id}`).emit("group_deleted", { groupId: conv._id.toString() });
  }

  await Message.deleteMany({ conversationId: conv._id });
  await Conversation.findByIdAndDelete(conv._id);

  res.json({ ok: true });
});

export default router;
