import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { verifyToken } from "./lib/auth";
import { connectDB } from "@workspace/db";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const httpServer = createServer(app);

// Mirror the same origin allow-list used by the Express CORS middleware
const socketAllowedOrigins: (string | RegExp)[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];
if (process.env.REPLIT_DOMAINS) {
  process.env.REPLIT_DOMAINS.split(",").forEach((d) =>
    socketAllowedOrigins.push(`https://${d.trim()}`)
  );
}
if (process.env.REPLIT_DEV_DOMAIN) {
  socketAllowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN.trim()}`);
}

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // server-to-server / curl
      const ok = socketAllowedOrigins.some((o) =>
        typeof o === "string" ? o === origin : o.test(origin)
      );
      cb(ok ? null : new Error("Socket CORS: origin not allowed"), ok);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/api/socket.io",
});

app.set("io", io);

const onlineUsers = new Map<string, { socketId: string; connectedAt: number }>();

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token as string | undefined;
  let userId: string | undefined;

  if (token) {
    try {
      const payload = verifyToken(token);
      userId = payload.userId;
      socket.join(`user:${userId}`);
      onlineUsers.set(userId, { socketId: socket.id, connectedAt: Date.now() });
      io.emit("user_online", { userId });
      logger.info({ userId }, "Socket authenticated");
    } catch {
      logger.warn({ socketId: socket.id }, "Socket auth failed");
    }
  }

  function resolveConvId(data: string | { conversationId: string }): string {
    return typeof data === "string" ? data : data.conversationId;
  }

  socket.on("join_conversation", (data: string | { conversationId: string }) => {
    if (!userId) { socket.emit("error", { message: "Unauthorized" }); return; }
    socket.join(`conversation:${resolveConvId(data)}`);
  });

  socket.on("leave_conversation", (data: string | { conversationId: string }) => {
    if (!userId) return;
    socket.leave(`conversation:${resolveConvId(data)}`);
  });

  socket.on("typing", (data: { conversationId: string; isVoice?: boolean }) => {
    socket.to(`conversation:${data.conversationId}`).emit("typing", {
      userId,
      conversationId: data.conversationId,
      isVoice: data.isVoice ?? false,
    });
  });

  socket.on("stop_typing", (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit("stop_typing", {
      userId,
      conversationId: data.conversationId,
    });
  });

  socket.on("mark_read", (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit("message_read", {
      userId,
      conversationId: data.conversationId,
    });
  });

  socket.on("get_presence", (data: { userIds: string[] }, callback?: (res: Record<string, boolean>) => void) => {
    const result: Record<string, boolean> = {};
    for (const uid of data.userIds) {
      result[uid] = onlineUsers.has(uid);
    }
    if (typeof callback === "function") callback(result);
    else socket.emit("presence", result);
  });

  socket.on("join_post", (data: string | { postId: string }) => {
    if (!userId) { socket.emit("error", { message: "Unauthorized" }); return; }
    const postId = typeof data === "string" ? data : data.postId;
    socket.join(`post:${postId}`);
  });

  socket.on("leave_post", (data: string | { postId: string }) => {
    if (!userId) return;
    const postId = typeof data === "string" ? data : data.postId;
    socket.leave(`post:${postId}`);
  });

  socket.on("disconnect", () => {
    if (userId) {
      onlineUsers.delete(userId);
      io.emit("user_offline", { userId, lastSeen: new Date().toISOString() });
    }
    logger.info({ socketId: socket.id, userId }, "Socket disconnected");
  });
});

// Connect to MongoDB then start listening
connectDB()
  .then(() => {
    logger.info("MongoDB connected");
    httpServer.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  });
