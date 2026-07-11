import { Router, type IRouter } from "express";
import { User } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { buildUserSummary } from "./users";
import mongoose from "mongoose";

const router: IRouter = Router();

router.get("/users/me/close-friends", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = await User.findById(req.userId).populate("closeFriends");
  if (!me) { res.json([]); return; }
  res.json(await Promise.all((me.closeFriends as any[]).map(u => buildUserSummary(u, req.userId))));
});

router.post("/users/me/close-friends", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { userId: friendId } = req.body as { userId?: string };
  if (!friendId) { res.status(400).json({ error: "userId required" }); return; }
  if (friendId === req.userId) { res.status(400).json({ error: "Cannot add yourself" }); return; }
  const me = await User.findById(req.userId).select("following closeFriends");
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  const isFollowing = me.following.some((id: mongoose.Types.ObjectId) => id.toString() === friendId);
  if (!isFollowing) { res.status(400).json({ error: "You must follow this user first" }); return; }
  const alreadyClose = me.closeFriends.some((id: mongoose.Types.ObjectId) => id.toString() === friendId);
  if (alreadyClose) { res.json({ ok: true, already: true }); return; }
  await User.findByIdAndUpdate(req.userId, { $addToSet: { closeFriends: new mongoose.Types.ObjectId(friendId) } });
  res.json({ ok: true });
});

router.delete("/users/me/close-friends/:friendId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const friendId = new mongoose.Types.ObjectId(req.params.friendId as string);
  await User.findByIdAndUpdate(req.userId, { $pull: { closeFriends: friendId } });
  res.json({ ok: true });
});

export default router;
