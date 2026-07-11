import { Router, type IRouter } from "express";
import { Story, Highlight, User } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { uploadBase64 } from "../lib/cloudinary";
import { buildUserSummary } from "./users";
import mongoose from "mongoose";

const router: IRouter = Router();

function expiresAt24h() {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d;
}

async function buildStory(story: any, meId?: string) {
  const author = await User.findById(story.authorId);
  return {
    id: story._id.toString(),
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    audience: story.audience,
    viewsCount: story.views.length,
    isViewed: meId ? story.views.some((id: mongoose.Types.ObjectId) => id.toString() === meId) : false,
    author: await buildUserSummary(author, meId),
    expiresAt: story.expiresAt.toISOString(),
    createdAt: story.createdAt.toISOString(),
    caption: story.caption ?? null,
    textColor: story.textColor ?? null,
    musicTrack: story.musicTrack ?? null,
    musicUrl: story.musicUrl ?? null,
    musicArtist: story.musicArtist ?? null,
    stickers: (story.stickers ?? []).map((s: any) => ({
      id: s.id,
      type: s.type,
      x: s.x,
      y: s.y,
      emoji: s.emoji ?? null,
      text: s.text ?? null,
      pollQuestion: s.pollQuestion ?? null,
      pollA: s.pollA ?? null,
      pollB: s.pollB ?? null,
      quizOptions: s.quizOptions ?? [],
      quizAnswer: s.quizAnswer ?? null,
      countdownLabel: s.countdownLabel ?? null,
    })),
  };
}

router.get("/stories/feed", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = await User.findById(req.userId).select("following closeFriends");
  const authorIds = [new mongoose.Types.ObjectId(req.userId!), ...(me?.following ?? [])];
  const now = new Date();
  const stories = await Story.find({ authorId: { $in: authorIds }, expiresAt: { $gt: now } }).sort({ createdAt: -1 });
  const closeFriendIds = new Set((me?.closeFriends ?? []).map((id: mongoose.Types.ObjectId) => id.toString()));

  const byUser = new Map<string, any[]>();
  for (const story of stories) {
    const aid = story.authorId.toString();
    if (!byUser.has(aid)) byUser.set(aid, []);
    byUser.get(aid)!.push(story);
  }

  const result = await Promise.all(Array.from(byUser.entries()).map(async ([authorId, userStories]) => {
    const user = await User.findById(authorId);
    const visible = userStories.filter(s => {
      if (s.audience === "everyone") return true;
      if (s.authorId.toString() === req.userId) return true;
      return closeFriendIds.has(s.authorId.toString());
    });
    if (!visible.length) return null;
    const built = await Promise.all(visible.map(s => buildStory(s, req.userId)));
    return { user: await buildUserSummary(user, req.userId), stories: built, hasUnviewed: built.some(s => !s.isViewed) };
  }));
  res.json(result.filter(Boolean));
});

router.get("/stories/mine", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const stories = await Story.find({ authorId: req.userId, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  res.json(await Promise.all(stories.map(s => buildStory(s, req.userId))));
});

router.post("/stories", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { mediaUrl, mediaType, caption, textColor, musicTrack, musicUrl, musicArtist, audience, stickers } = req.body;
  if (!mediaUrl) { res.status(400).json({ error: "mediaUrl required" }); return; }
  const story = await Story.create({
    authorId: req.userId, mediaUrl, mediaType: mediaType ?? "image",
    caption: caption ?? null, textColor: textColor ?? null,
    musicTrack: musicTrack ?? null, musicUrl: musicUrl ?? null, musicArtist: musicArtist ?? null,
    audience: audience ?? "everyone", expiresAt: expiresAt24h(),
    stickers: Array.isArray(stickers) ? stickers : [],
  });
  res.status(201).json(await buildStory(story, req.userId));
});

router.post("/stories/upload", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { data, mimeType } = req.body as { data?: string; mimeType?: string };
  if (!data || !mimeType) { res.status(400).json({ error: "data and mimeType required" }); return; }
  try {
    res.json(await uploadBase64(data, mimeType, "pixlr/stories"));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

router.delete("/stories/:storyId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const story = await Story.findById(req.params.storyId).catch(() => null);
  if (!story) { res.status(404).json({ error: "Story not found" }); return; }
  if (story.authorId.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  await story.deleteOne();
  res.json({ ok: true });
});

router.post("/stories/:storyId/view", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const meId = new mongoose.Types.ObjectId(req.userId!);
  await Story.findByIdAndUpdate(req.params.storyId, { $addToSet: { views: meId } });
  res.json({ ok: true });
});

router.get("/stories/:storyId/viewers", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const story = await Story.findById(req.params.storyId).catch(() => null);
  if (!story) { res.json([]); return; }
  const users = await User.find({ _id: { $in: story.views } });
  res.json(await Promise.all(users.map(u => buildUserSummary(u, req.userId))));
});

router.post("/stories/:storyId/react", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { emoji } = req.body as { emoji?: string };
  if (!emoji) { res.status(400).json({ error: "emoji required" }); return; }
  await Story.findByIdAndUpdate(req.params.storyId, { $push: { reactions: { userId: req.userId, emoji } } });
  res.json({ ok: true });
});

router.post("/stories/highlights", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { name, coverUrl, storyIds } = req.body as { name?: string; coverUrl?: string; storyIds?: string[] };
  if (!name?.trim()) { res.status(400).json({ error: "Name required" }); return; }
  const highlight = await Highlight.create({ userId: req.userId, name: name.trim(), coverUrl: coverUrl ?? null, storyIds: storyIds ?? [] });
  const stories = await Story.find({ _id: { $in: highlight.storyIds } });
  const builtStories = await Promise.all(stories.map(s => buildStory(s, req.userId)));
  res.status(201).json({ id: highlight._id.toString(), name: highlight.name, coverUrl: highlight.coverUrl, createdAt: highlight.createdAt.toISOString(), stories: builtStories });
});

router.get("/stories/highlights/user/:username", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const highlights = await Highlight.find({ userId: user._id }).sort({ createdAt: -1 });
  const result = await Promise.all(highlights.map(async (h) => {
    const stories = await Story.find({ _id: { $in: h.storyIds } });
    return { id: h._id.toString(), name: h.name, coverUrl: h.coverUrl, createdAt: h.createdAt.toISOString(), stories: await Promise.all(stories.map(s => buildStory(s, req.userId))) };
  }));
  res.json(result);
});

router.delete("/stories/highlights/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const h = await Highlight.findById(req.params.id).catch(() => null);
  if (!h) { res.status(404).json({ error: "Highlight not found" }); return; }
  if (h.userId.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  await h.deleteOne();
  res.json({ ok: true });
});

router.post("/stories/highlights/:id/stories", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { storyId } = req.body as { storyId?: string };
  if (!storyId) { res.status(400).json({ error: "storyId required" }); return; }
  const h = await Highlight.findById(req.params.id).catch(() => null);
  if (!h) { res.status(404).json({ error: "Highlight not found" }); return; }
  if (h.userId.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  await Highlight.findByIdAndUpdate(h._id, { $addToSet: { storyIds: new mongoose.Types.ObjectId(storyId) } });
  res.json({ ok: true });
});

export default router;
