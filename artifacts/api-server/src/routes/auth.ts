import { Router, type IRouter } from "express";
import { User, RefreshToken } from "@workspace/db";
import {
  hashPassword, comparePassword, signToken,
  generateRefreshToken, hashRefreshToken, refreshTokenExpiresAt,
  requireAuth, type AuthRequest,
} from "../lib/auth";
import { authLimiter } from "../lib/security";
import type mongoose from "mongoose";

const router: IRouter = Router();

function userToProfile(user: any, meId?: string) {
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
    postsCount: 0,
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
    isMe: meId === user._id.toString(),
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueTokenPair(userId: string, username: string) {
  const accessToken = signToken({ userId, username });
  const rawRefresh = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefresh);
  await RefreshToken.create({ userId, tokenHash, expiresAt: refreshTokenExpiresAt() });
  return { token: accessToken, refreshToken: rawRefresh };
}

router.post("/auth/register", authLimiter, async (req, res): Promise<void> => {
  const raw = req.body as Record<string, unknown>;
  // Cast all fields to string to prevent NoSQL operator injection
  const username = typeof raw.username === "string" ? raw.username.trim() : "";
  const email    = typeof raw.email    === "string" ? raw.email.trim()    : "";
  const password = typeof raw.password === "string" ? raw.password        : "";
  const fullName = typeof raw.fullName === "string" ? raw.fullName.trim() : "";
  if (!username || !email || !password || !fullName) { res.status(400).json({ error: "Invalid input" }); return; }
  if (username.length > 30) { res.status(400).json({ error: "Username too long" }); return; }
  if (fullName.length > 60) { res.status(400).json({ error: "Full name too long" }); return; }
  if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

  const existing = await User.findOne({ $or: [{ username }, { email }] });
  if (existing) { res.status(409).json({ error: "Username or email already taken" }); return; }

  const passwordHash = await hashPassword(password);
  const user = await User.create({ username, email: email.toLowerCase(), fullName, passwordHash });

  const { token, refreshToken } = await issueTokenPair(user._id.toString(), user.username);
  res.status(201).json({ token, refreshToken, user: userToProfile(user, user._id.toString()) });
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const raw = req.body as { identifier?: unknown; password?: unknown };
  // Cast to string to prevent NoSQL injection (object operators like {$gt:""})
  const identifier = typeof raw.identifier === "string" ? raw.identifier.trim() : "";
  const password   = typeof raw.password  === "string" ? raw.password          : "";
  if (!identifier || !password) { res.status(400).json({ error: "Invalid input" }); return; }

  const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier.toLowerCase() }] }).select("+passwordHash");
  if (!user) {
    await comparePassword(password, "$2b$10$invalidhashpaddingtopreventinenumeration000000000000000");
    res.status(401).json({ error: "Invalid credentials" }); return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const { token, refreshToken } = await issueTokenPair(user._id.toString(), user.username);
  res.json({ token, refreshToken, user: userToProfile(user, user._id.toString()) });
});

router.post("/auth/refresh", authLimiter, async (req, res): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) { res.status(401).json({ error: "Refresh token required" }); return; }

  const tokenHash = hashRefreshToken(refreshToken);
  const entry = await RefreshToken.findOne({ tokenHash, revoked: false, expiresAt: { $gt: new Date() } });
  if (!entry) { res.status(401).json({ error: "Invalid or expired refresh token" }); return; }

  const user = await User.findById(entry.userId).select("_id username");
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  await RefreshToken.updateOne({ _id: entry._id }, { revoked: true });
  const { token, refreshToken: newRefreshToken } = await issueTokenPair(user._id.toString(), user.username);
  res.json({ token, refreshToken: newRefreshToken });
});

router.post("/auth/logout", authLimiter, async (req, res): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await RefreshToken.updateOne({ tokenHash }, { revoked: true });
  }
  res.sendStatus(204);
});

router.post("/auth/change-password", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) { res.status(400).json({ error: "currentPassword and newPassword are required" }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: "New password must be at least 6 characters" }); return; }
  const user = await User.findById(req.userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  res.sendStatus(204);
});

export default router;
