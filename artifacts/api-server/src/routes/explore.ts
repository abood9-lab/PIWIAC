import { Router, type IRouter } from "express";
import { Post, User } from "@workspace/db";
import { optionalAuth, type AuthRequest } from "../lib/auth";
import { buildUserSummary } from "./users";
import mongoose from "mongoose";

const router: IRouter = Router();

router.get("/explore/posts", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const skip = (page - 1) * limit;
  const [posts, total] = await Promise.all([
    Post.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Post.countDocuments(),
  ]);
  const result = await Promise.all(posts.map(async (post) => {
    const author = await User.findById(post.authorId);
    return {
      id: post._id.toString(), caption: post.caption ?? null, mediaUrl: post.mediaUrl, mediaType: post.mediaType,
      likesCount: post.likes.length, commentsCount: post.comments.length,
      isLiked: req.userId ? post.likes.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId) : false,
      isSaved: req.userId ? post.saves.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId) : false,
      author: await buildUserSummary(author, req.userId),
      createdAt: post.createdAt.toISOString(),
    };
  }));
  res.json({ posts: result, hasMore: skip + limit < total, total });
});

router.get("/search/users", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const q = String(req.query.q ?? "");
  const limit = parseInt(String(req.query.limit ?? "10"), 10);
  if (!q) { res.json([]); return; }
  const users = await User.find({ $or: [{ username: { $regex: q, $options: "i" } }, { fullName: { $regex: q, $options: "i" } }] }).limit(limit);
  res.json(await Promise.all(users.map(u => buildUserSummary(u, req.userId))));
});

export default router;
