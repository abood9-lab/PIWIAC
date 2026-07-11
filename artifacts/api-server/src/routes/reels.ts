import { Router, type IRouter } from "express";
import { Post, User, Notification } from "@workspace/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { notifyUserPush } from "../lib/push";
import { buildUserSummary } from "./users";
import mongoose from "mongoose";

const router: IRouter = Router();

async function buildReel(post: any, meId?: string) {
  const author = await User.findById(post.authorId);
  return {
    id: post._id.toString(), caption: post.caption ?? null, mediaUrl: post.mediaUrl, mediaType: post.mediaType,
    likesCount: post.likes.length, commentsCount: post.comments.length,
    isLiked: meId ? post.likes.some((id: mongoose.Types.ObjectId) => id.toString() === meId) : false,
    isSaved: meId ? post.saves.some((id: mongoose.Types.ObjectId) => id.toString() === meId) : false,
    author: await buildUserSummary(author, meId),
    createdAt: post.createdAt.toISOString(),
  };
}

router.get("/reels", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 50);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const posts = await Post.find({ mediaType: "video" }).sort({ createdAt: -1 }).skip(offset).limit(limit);
  res.json({ reels: await Promise.all(posts.map(p => buildReel(p, req.userId))), hasMore: posts.length === limit });
});

router.post("/reels", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { caption, mediaUrl, mediaType } = req.body;
  if (mediaType !== "video") { res.status(400).json({ error: "Reels must be video posts" }); return; }
  if (!mediaUrl) { res.status(400).json({ error: "mediaUrl required" }); return; }
  const post = await Post.create({ authorId: req.userId, caption, mediaUrl, mediaType: "video" });
  res.status(201).json(await buildReel(post, req.userId));
});

router.get("/reels/:reelId", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findOne({ _id: req.params.reelId, mediaType: "video" }).catch(() => null);
  if (!post) { res.status(404).json({ error: "Reel not found" }); return; }
  res.json(await buildReel(post, req.userId));
});

router.post("/reels/:reelId/like", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.reelId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Reel not found" }); return; }
  const meId = new mongoose.Types.ObjectId(req.userId!);
  const isLiked = post.likes.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (isLiked) {
    await Post.findByIdAndUpdate(post._id, { $pull: { likes: meId } });
  } else {
    await Post.findByIdAndUpdate(post._id, { $addToSet: { likes: meId } });
    if (post.authorId.toString() !== req.userId) {
      await Notification.create({ userId: post.authorId, actorId: req.userId, type: "like", postId: post._id });
      notifyUserPush(post.authorId.toString(), req.userId!, "like").catch(() => {});
    }
  }
  const updated = await Post.findById(post._id);
  res.json({ liked: !isLiked, likesCount: updated?.likes.length ?? 0 });
});

router.get("/reels/:reelId/comments", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.reelId).catch(() => null);
  if (!post) { res.json([]); return; }
  const result = await Promise.all(post.comments.slice(0, 50).map(async (c: any) => {
    const author = await User.findById(c.authorId);
    return { id: c._id.toString(), text: c.text, author: author ? await buildUserSummary(author, req.userId) : null, createdAt: c.createdAt.toISOString() };
  }));
  res.json(result);
});

router.post("/reels/:reelId/comments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.reelId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Reel not found" }); return; }
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: "text required" }); return; }
  const comment = { _id: new mongoose.Types.ObjectId(), authorId: new mongoose.Types.ObjectId(req.userId!), text: text.trim(), likes: [], createdAt: new Date() };
  post.comments.push(comment as any);
  await post.save();
  if (post.authorId.toString() !== req.userId) {
    await Notification.create({ userId: post.authorId, actorId: req.userId, type: "comment", postId: post._id });
    notifyUserPush(post.authorId.toString(), req.userId!, "comment", { commentText: text }).catch(() => {});
  }
  const author = await User.findById(req.userId);
  res.status(201).json({ id: comment._id.toString(), text: comment.text, author: author ? await buildUserSummary(author, req.userId) : null, createdAt: comment.createdAt.toISOString() });
});

export default router;
