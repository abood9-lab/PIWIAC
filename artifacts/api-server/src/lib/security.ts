import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

export function parseIntParam(val: unknown, fallback?: number): number | null {
  const n = parseInt(String(val ?? ""), 10);
  if (isNaN(n) || n <= 0) return fallback !== undefined ? fallback : null;
  return n;
}

const isProd = process.env.NODE_ENV === "production";

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." },
  skip: () => !isProd,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI caption limit reached. Try again in an hour." },
});

// Strict limiter for vault PIN unlock — 5 attempts per 15 min per IP
export const vaultLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many PIN attempts. Try again in 15 minutes." },
});

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  next();
}
