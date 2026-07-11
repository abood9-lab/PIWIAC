import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter, securityHeaders } from "./lib/security";

const app: Express = express();

// Trust the Replit / reverse-proxy X-Forwarded-For header
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(securityHeaders);

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow the Replit preview domain(s) + localhost in dev.
const allowedOrigins: (string | RegExp)[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];
if (process.env.REPLIT_DOMAINS) {
  process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
    allowedOrigins.push(`https://${d.trim()}`);
  });
}
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN.trim()}`);
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const ok = allowedOrigins.some((o) =>
        typeof o === "string" ? o === origin : o.test(origin)
      );
      cb(ok ? null : new Error("CORS: origin not allowed"), ok);
    },
    credentials: true,
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────
// Default limit is 100 kb for regular API requests (auth, profile updates, etc.).
// Upload routes (media, avatar, voice) override this with 15 mb via per-route
// middleware so we don't expose the large limit to the entire API surface.
app.use((req, res, next) => {
  const isUploadRoute =
    req.path.includes("/upload") ||
    req.path.includes("/avatar") ||
    req.path.includes("/complete-setup") ||
    req.path.includes("/stories") ||
    req.path.includes("/groups");
  const limit = isUploadRoute ? "15mb" : "100kb";
  express.json({ limit })(req, res, (err) => {
    if (err) { res.status(413).json({ error: "Request body too large" }); return; }
    next();
  });
});
app.use((req, res, next) => {
  const isUploadRoute =
    req.path.includes("/upload") ||
    req.path.includes("/avatar") ||
    req.path.includes("/complete-setup") ||
    req.path.includes("/stories") ||
    req.path.includes("/groups");
  const limit = isUploadRoute ? "15mb" : "100kb";
  express.urlencoded({ extended: true, limit })(req, res, (err) => {
    if (err) { res.status(413).json({ error: "Request body too large" }); return; }
    next();
  });
});

// ── Global rate limiter ───────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  if (res.headersSent) return;
  // Never leak internal error details to clients in production
  const isProd = process.env.NODE_ENV === "production";
  const message = isProd
    ? "Internal server error"
    : err instanceof Error
      ? err.message
      : String(err);
  res.status(500).json({ error: message });
});

export default app;
