import { Router, type IRouter } from "express";
import { Notification, User, Post } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { buildUserSummary } from "./users";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const skip = (page - 1) * limit;
  const notifications = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit);
  const result = await Promise.all(notifications.map(async (n) => {
    const actor = await User.findById(n.actorId);
    let postMediaUrl: string | null = null;
    if (n.postId) {
      const post = await Post.findById(n.postId).select("mediaUrl");
      postMediaUrl = post?.mediaUrl ?? null;
    }
    return {
      id: n._id.toString(),
      type: n.type,
      isRead: n.isRead,
      actor: await buildUserSummary(actor, req.userId),
      postId: n.postId?.toString() ?? null,
      postMediaUrl,
      commentText: n.commentText ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.get("/notifications/unread-count", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const count = await Notification.countDocuments({ userId: req.userId, isRead: false });
  res.json({ count });
});

router.post("/notifications/read-all", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  await Notification.updateMany({ userId: req.userId }, { isRead: true });
  res.json({ ok: true });
});

export default router;
