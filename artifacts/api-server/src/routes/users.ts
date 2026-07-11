import { Router, type IRouter } from "express";
import { User, Post, Notification } from "@workspace/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { uploadBase64 } from "../lib/cloudinary";
import { notifyUserPush } from "../lib/push";
import mongoose from "mongoose";

const router: IRouter = Router();

export async function buildUserSummary(user: any, meId?: string) {
  if (!user) return { id: "", username: "[deleted]", fullName: "[deleted]", avatarUrl: null, isFollowing: false };
  const isFollowing = meId
    ? user.followers?.some((id: mongoose.Types.ObjectId) => id.toString() === meId)
    : false;
  return {
    id: user._id.toString(),
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl ?? null,
    isFollowing,
  };
}

export async function buildUserProfile(user: any, meId?: string) {
  const postsCount = await Post.countDocuments({ authorId: user._id });
  const isFollowing = meId && meId !== user._id.toString()
    ? user.followers?.some((id: mongoose.Types.ObjectId) => id.toString() === meId)
    : false;
  return {
    id: user._id.toString(),
    username: user.username,
    fullName: user.fullName,
    bio: user.bio ?? null,
    avatarUrl: user.avatarUrl ?? null,
    website: user.website ?? null,
    gender: user.gender ?? null,
    pronouns: user.pronouns ?? null,
    dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString() : null,
    interests: user.interests ?? [],
    profileCompleted: user.profileCompleted ?? false,
    postsCount,
    followersCount: user.followers?.length ?? 0,
    followingCount: user.following?.length ?? 0,
    isFollowing,
    isMe: meId === user._id.toString(),
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/auth/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findById(req.userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await buildUserProfile(user, req.userId));
});

router.get("/users/suggestions", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = await User.findById(req.userId).select("following");
  if (!me) { res.json([]); return; }
  const exclude = [new mongoose.Types.ObjectId(req.userId!), ...me.following];
  const users = await User.find({ _id: { $nin: exclude } }).limit(8);
  const result = await Promise.all(users.map(u => buildUserSummary(u, req.userId)));
  res.json(result);
});

router.get("/users/me/saved", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const posts = await Post.find({ saves: req.userId }).sort({ createdAt: -1 });
  const result = await Promise.all(posts.map(async (post) => {
    const author = await User.findById(post.authorId);
    return {
      id: post._id.toString(), caption: post.caption ?? null, mediaUrl: post.mediaUrl, mediaType: post.mediaType,
      likesCount: post.likes.length, commentsCount: post.comments.length,
      isLiked: post.likes.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId),
      isSaved: true,
      author: await buildUserSummary(author, req.userId),
      createdAt: post.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/users/complete-setup", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { bio, website, gender, pronouns, dateOfBirth, interests, avatarUrl } = req.body as {
    bio?: string; website?: string; gender?: string; pronouns?: string;
    dateOfBirth?: string; interests?: string[]; avatarUrl?: string;
  };
  const updates: Record<string, any> = { profileCompleted: true };
  if (bio !== undefined) updates.bio = bio;
  if (website) updates.website = website;
  if (gender) updates.gender = gender;
  if (pronouns) updates.pronouns = pronouns;
  if (dateOfBirth) updates.dateOfBirth = new Date(dateOfBirth);
  if (Array.isArray(interests)) updates.interests = interests;
  if (avatarUrl) updates.avatarUrl = avatarUrl;
  const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await buildUserProfile(user, req.userId));
});

router.patch("/users/me/profile", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { fullName, bio, username, website, gender, pronouns, dateOfBirth, interests } = req.body as {
    fullName?: string; bio?: string; username?: string; website?: string;
    gender?: string; pronouns?: string; dateOfBirth?: string; interests?: string[];
  };
  const updates: Record<string, any> = {};
  if (fullName) updates.fullName = fullName;
  if (bio !== undefined) updates.bio = bio;
  if (username) updates.username = username;
  if (website !== undefined) updates.website = website;
  if (gender !== undefined) updates.gender = gender;
  if (pronouns !== undefined) updates.pronouns = pronouns;
  if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
  if (Array.isArray(interests)) updates.interests = interests;
  const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await buildUserProfile(user, req.userId));
});

router.post("/users/me/avatar", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { data, mimeType } = req.body as { data?: string; mimeType?: string };
  if (!data || !mimeType) { res.status(400).json({ error: "data and mimeType required" }); return; }
  try {
    const { url, publicId, resourceType } = await uploadBase64(data, mimeType, "pixlr/avatars");
    await User.findByIdAndUpdate(req.userId, { avatarUrl: url });
    res.json({ url, publicId, resourceType });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    res.status(500).json({ error: msg });
  }
});

router.get("/users/:username", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await buildUserProfile(user, req.userId));
});

router.get("/users/:username/posts", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "12"), 10);
  const skip = (page - 1) * limit;
  const [posts, total] = await Promise.all([
    Post.find({ authorId: user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Post.countDocuments({ authorId: user._id }),
  ]);
  const result = await Promise.all(posts.map(async (post) => ({
    id: post._id.toString(), caption: post.caption ?? null, mediaUrl: post.mediaUrl, mediaType: post.mediaType,
    likesCount: post.likes.length, commentsCount: post.comments.length,
    isLiked: req.userId ? post.likes.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId) : false,
    isSaved: req.userId ? post.saves.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId) : false,
    author: await buildUserSummary(user, req.userId),
    createdAt: post.createdAt.toISOString(),
  })));
  res.json({ posts: result, hasMore: skip + limit < total, total });
});

router.post("/users/:username/follow", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const target = await User.findOne({ username: req.params.username });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target._id.toString() === req.userId) { res.status(400).json({ error: "Cannot follow yourself" }); return; }
  const meId = new mongoose.Types.ObjectId(req.userId!);
  const alreadyFollowing = target.followers.some((id: mongoose.Types.ObjectId) => id.toString() === req.userId);
  if (!alreadyFollowing) {
    await User.findByIdAndUpdate(target._id, { $addToSet: { followers: meId } });
    await User.findByIdAndUpdate(req.userId, { $addToSet: { following: target._id } });
    await Notification.create({ userId: target._id, actorId: req.userId, type: "follow" });
    notifyUserPush(target._id.toString(), req.userId!, "follow").catch(() => {});
  }
  const updated = await User.findById(target._id);
  res.json({ isFollowing: true, followersCount: updated?.followers.length ?? 0 });
});

router.post("/users/:username/unfollow", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const target = await User.findOne({ username: req.params.username });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const meId = new mongoose.Types.ObjectId(req.userId!);
  await User.findByIdAndUpdate(target._id, { $pull: { followers: meId } });
  await User.findByIdAndUpdate(req.userId, { $pull: { following: target._id } });
  const updated = await User.findById(target._id);
  res.json({ isFollowing: false, followersCount: updated?.followers.length ?? 0 });
});

router.get("/users/:username/followers", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findOne({ username: req.params.username }).populate("followers");
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await Promise.all((user.followers as any[]).map((u) => buildUserSummary(u, req.userId))));
});

router.get("/users/:username/following", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findOne({ username: req.params.username }).populate("following");
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await Promise.all((user.following as any[]).map((u) => buildUserSummary(u, req.userId))));
});

export default router;
