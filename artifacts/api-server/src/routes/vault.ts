import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { User, Conversation, Message, VaultConversation } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { vaultLimiter, parseIntParam } from "../lib/security";
import { buildUserSummary } from "./users";
import mongoose from "mongoose";

const router: IRouter = Router();
const SALT_ROUNDS = 10;

async function buildVaultedConversation(convId: string, meId: string) {
  const conv = await Conversation.findById(convId);
  if (!conv) return null;
  const otherId = conv.user1Id.toString() === meId ? conv.user2Id : conv.user1Id;
  const otherUser = await User.findById(otherId);
  const lastMsg = await Message.findOne({ conversationId: convId, isDeleted: false }).sort({ createdAt: -1 });
  const unreadCount = await Message.countDocuments({ conversationId: convId, senderId: { $ne: meId }, isRead: false, isDeleted: false });
  return {
    conversationId: convId,
    otherUser: await buildUserSummary(otherUser, meId),
    lastMessage: lastMsg ? (lastMsg.isDeleted ? "Message deleted" : (lastMsg.text ?? (lastMsg.mediaUrl ? `[${lastMsg.mediaType ?? "media"}]` : null))) : null,
    lastMessageAt: lastMsg?.createdAt?.toISOString() ?? conv.lastActivityAt?.toISOString() ?? null,
    unreadCount,
  };
}

router.get("/vault/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findById(req.userId).select("vaultPin");
  res.json({ hasPin: !!user?.vaultPin });
});

router.post("/vault/pin", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { pin, currentPin } = req.body as { pin?: string; currentPin?: string };
  if (!pin || pin.length < 4) { res.status(400).json({ error: "PIN must be at least 4 digits" }); return; }
  const user = await User.findById(req.userId).select("vaultPin");
  if (user?.vaultPin) {
    if (!currentPin) { res.status(400).json({ error: "Current PIN required to change PIN" }); return; }
    const valid = await bcrypt.compare(currentPin, user.vaultPin);
    if (!valid) { res.status(401).json({ error: "Wrong current PIN" }); return; }
  }
  await User.findByIdAndUpdate(req.userId, { vaultPin: await bcrypt.hash(pin, SALT_ROUNDS) });
  res.json({ ok: true });
});

router.post("/vault/unlock", requireAuth, vaultLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!pin) { res.status(400).json({ error: "PIN required" }); return; }
  const user = await User.findById(req.userId).select("vaultPin");
  if (!user?.vaultPin) { res.status(400).json({ error: "Vault PIN not set" }); return; }
  const valid = await bcrypt.compare(pin, user.vaultPin);
  if (!valid) { res.status(401).json({ error: "Wrong PIN" }); return; }
  const vaulted = await VaultConversation.find({ userId: req.userId }).sort({ addedAt: -1 });
  const conversations = (await Promise.all(vaulted.map(v => buildVaultedConversation(v.conversationId.toString(), req.userId!)))).filter(Boolean);
  res.json(conversations);
});

router.post("/vault/add", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { conversationId, pin } = req.body as { conversationId?: string; pin?: string };
  if (!conversationId || !pin) { res.status(400).json({ error: "conversationId and pin required" }); return; }
  if (pin.length < 4) { res.status(400).json({ error: "PIN must be at least 4 digits" }); return; }
  const conv = await Conversation.findOne({ _id: conversationId, $or: [{ user1Id: req.userId }, { user2Id: req.userId }] }).catch(() => null);
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const existing = await VaultConversation.findOne({ userId: req.userId, conversationId });
  if (existing) { res.status(400).json({ error: "Already in vault" }); return; }
  await VaultConversation.create({ userId: req.userId, conversationId, pinHash: await bcrypt.hash(pin, SALT_ROUNDS) });
  res.json({ ok: true });
});

router.delete("/vault/:conversationId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  await VaultConversation.deleteOne({ userId: req.userId, conversationId: req.params.conversationId });
  res.json({ ok: true });
});

router.post("/vault/:conversationId/unlock", requireAuth, vaultLimiter, async (req: AuthRequest, res): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!pin) { res.status(400).json({ error: "PIN required" }); return; }
  const entry = await VaultConversation.findOne({ userId: req.userId, conversationId: req.params.conversationId });
  if (!entry) { res.status(404).json({ error: "Conversation not in vault" }); return; }
  const valid = await bcrypt.compare(pin, entry.pinHash);
  if (!valid) { res.status(401).json({ error: "Wrong PIN" }); return; }
  res.json(await buildVaultedConversation(req.params.conversationId as string, req.userId!));
});

export default router;
