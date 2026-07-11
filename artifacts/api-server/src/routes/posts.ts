import { Router, type IRouter } from "express";
import { Post, User, Notification } from "@workspace/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { uploadBase64 } from "../lib/cloudinary";
import { notifyUserPush } from "../lib/push";
import { buildUserSummary } from "./users";
import mongoose from "mongoose";

const router: IRouter = Router();

async function buildPost(post: any, meId?: string) {
  const author = await User.findById(post.authorId);
  return {
    id: post._id.toString(),
    caption: post.caption ?? null,
    mediaUrl: post.mediaUrl,
    mediaType: post.mediaType,
    audience: post.audience,
    location: post.location ?? null,
    altText: post.altText ?? null,
    commentsDisabled: post.commentsDisabled,
    additionalMediaUrls: post.additionalMediaUrls ?? [],
    likesCount: post.likes.length,
    commentsCount: post.comments.length,
    isLiked: meId ? post.likes.some((id: mongoose.Types.ObjectId) => id.toString() === meId) : false,
    isSaved: meId ? post.saves.some((id: mongoose.Types.ObjectId) => id.toString() === meId) : false,
    author: await buildUserSummary(author, meId),
    createdAt: post.createdAt.toISOString(),
  };
}

router.get("/posts/feed", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "10"), 10);
  const skip = (page - 1) * limit;
  const me = await User.findById(req.userId).select("following closeFriends");
  const authorIds = [new mongoose.Types.ObjectId(req.userId!), ...(me?.following ?? [])];
  const allPosts = await Post.find({ authorId: { $in: authorIds } }).sort({ createdAt: -1 });
  const closeFriendIds = new Set((me?.closeFriends ?? []).map((id: mongoose.Types.ObjectId) => id.toString()));
  const filtered = allPosts.filter(post => {
    if (post.audience === "everyone") return true;
    if (post.authorId.toString() === req.userId) return true;
    return closeFriendIds.has(post.authorId.toString());
  });
  const paginated = filtered.slice(skip, skip + limit);
  const result = await Promise.all(paginated.map(p => buildPost(p, req.userId)));
  res.json({ posts: result, hasMore: skip + limit < filtered.length, total: filtered.length });
});

router.post("/posts", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { caption, mediaUrl, mediaType, audience, location, altText, commentsDisabled, additionalMediaUrls } = req.body;
  if (!mediaUrl) { res.status(400).json({ error: "mediaUrl is required" }); return; }
  const post = await Post.create({
    authorId: req.userId,
    caption, mediaUrl, mediaType: mediaType ?? "image",
    audience: audience ?? "everyone",
    location: location ?? null, altText: altText ?? null,
    commentsDisabled: commentsDisabled ?? false,
    additionalMediaUrls: additionalMediaUrls ?? [],
  });
  res.status(201).json(await buildPost(post, req.userId));
});

router.post("/posts/upload", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { data, mimeType } = req.body as { data?: string; mimeType?: string };
  if (!data || !mimeType) { res.status(400).json({ error: "data and mimeType required" }); return; }
  try {
    res.json(await uploadBase64(data, mimeType, "pixlr/posts"));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

router.get("/posts/:postId", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.postId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(await buildPost(post, req.userId));
});

router.patch("/posts/:postId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.postId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.authorId.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (req.body.caption !== undefined) post.caption = req.body.caption;
  await post.save();
  res.json(await buildPost(post, req.userId));
});

router.delete("/posts/:postId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.postId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.authorId.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  await post.deleteOne();
  res.sendStatus(204);
});

router.post("/posts/:postId/like", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.postId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
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
  res.json({ isLiked: !isLiked, likesCount: updated?.likes.length ?? 0 });
});

router.post("/posts/:postId/save", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.postId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  const meId = new mongoose.Types.ObjectId(req.userId!);
  const isSaved = post.saves.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (isSaved) {
    await Post.findByIdAndUpdate(post._id, { $pull: { saves: meId } });
    res.json({ isSaved: false });
  } else {
    await Post.findByIdAndUpdate(post._id, { $addToSet: { saves: meId } });
    res.json({ isSaved: true });
  }
});

router.get("/posts/:postId/comments", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.postId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  async function buildComment(comment: any, allComments: any[]): Promise<unknown> {
    const author = await User.findById(comment.authorId);
    const replies = allComments.filter((c: any) => c.parentId?.toString() === comment._id.toString());
    return {
      id: comment._id.toString(),
      text: comment.text,
      author: await buildUserSummary(author, req.userId),
      parentId: comment.parentId?.toString() ?? null,
      likesCount: comment.likes.length,
      isLiked: req.userId ? comment.likes.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId) : false,
      replies: await Promise.all(replies.map((r: any) => buildComment(r, allComments))),
      createdAt: comment.createdAt.toISOString(),
    };
  }

  const topLevel = post.comments.filter((c: any) => !c.parentId);
  res.json(await Promise.all(topLevel.map((c: any) => buildComment(c, post.comments as any[]))));
});

router.post("/posts/:postId/comments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const post = await Post.findById(req.params.postId).catch(() => null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  const { text, parentId } = req.body as { text?: string; parentId?: string };
  if (!text?.trim()) { res.status(400).json({ error: "text required" }); return; }
  const comment = {
    _id: new mongoose.Types.ObjectId(),
    authorId: new mongoose.Types.ObjectId(req.userId!),
    text: text.trim(),
    parentId: parentId ? new mongoose.Types.ObjectId(parentId) : undefined,
    likes: [],
    createdAt: new Date(),
  };
  post.comments.push(comment as any);
  await post.save();
  if (post.authorId.toString() !== req.userId) {
    await Notification.create({ userId: post.authorId, actorId: req.userId, type: "comment", postId: post._id, commentText: text });
    notifyUserPush(post.authorId.toString(), req.userId!, "comment", { commentText: text }).catch(() => {});
  }
  const author = await User.findById(req.userId);
  const payload = {
    id: comment._id.toString(), text: comment.text,
    author: await buildUserSummary(author, req.userId),
    parentId: comment.parentId?.toString() ?? null, likesCount: 0, isLiked: false, replies: [],
    createdAt: comment.createdAt.toISOString(),
  };
  const io = req.app.get("io");
  if (io) io.to(`post:${post._id}`).emit("new_comment", { postId: post._id.toString(), comment: payload });
  res.status(201).json(payload);
});

router.delete("/comments/:commentId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const commentId = req.params.commentId as string;
  const post = await Post.findOne({ "comments._id": new mongoose.Types.ObjectId(commentId) }).catch(() => null);
  if (!post) { res.status(404).json({ error: "Comment not found" }); return; }
  const comment = post.comments.find((c: any) => c._id.toString() === commentId);
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  if ((comment as any).authorId.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  await Post.findByIdAndUpdate(post._id, { $pull: { comments: { _id: comment._id } } });
  const io = req.app.get("io");
  if (io) io.to(`post:${post._id}`).emit("delete_comment", { postId: post._id.toString(), commentId });
  res.sendStatus(204);
});

router.post("/posts/:postId/report", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  res.json({ success: true });
});

router.post("/comments/:commentId/like", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const commentId = req.params.commentId as string;
  const meId = new mongoose.Types.ObjectId(req.userId!);
  const post = await Post.findOne({ "comments._id": new mongoose.Types.ObjectId(commentId) }).catch(() => null);
  if (!post) { res.status(404).json({ error: "Comment not found" }); return; }
  const comment = post.comments.find((c: any) => c._id.toString() === commentId) as any;
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  const isLiked = comment.likes.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (isLiked) {
    comment.likes = comment.likes.filter((id: mongoose.Types.ObjectId) => id.toString() !== req.userId);
  } else {
    comment.likes.push(meId);
  }
  await post.save();
  res.json({ isLiked: !isLiked, likesCount: comment.likes.length });
});

export default router;
