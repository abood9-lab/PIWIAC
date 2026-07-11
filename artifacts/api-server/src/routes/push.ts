import { Router, type IRouter } from "express";
import { PushSubscription } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { getVapidPublicKey } from "../lib/push";

const router: IRouter = Router();

router.get("/push/vapid-public-key", async (_req, res): Promise<void> => {
  const key = getVapidPublicKey();
  if (!key) { res.status(503).json({ error: "Push notifications are not configured" }); return; }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!endpoint || !keys?.p256dh || !keys?.auth) { res.status(400).json({ error: "Invalid subscription" }); return; }
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId: req.userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { upsert: true, new: true }
  );
  res.status(201).json({ ok: true });
});

router.post("/push/unsubscribe", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }
  await PushSubscription.deleteOne({ endpoint, userId: req.userId });
  res.json({ ok: true });
});

export default router;
