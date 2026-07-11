import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import postsRouter from "./posts";
import storiesRouter from "./stories";
import notificationsRouter from "./notifications";
import messagesRouter from "./messages";
import groupsRouter from "./groups";
import exploreRouter from "./explore";
import reelsRouter from "./reels";
import aiRouter from "./ai";
import vaultRouter from "./vault";
import closeFriendsRouter from "./close-friends";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(postsRouter);
router.use(storiesRouter);
router.use(notificationsRouter);
router.use(messagesRouter);
router.use(groupsRouter);
router.use(exploreRouter);
router.use(reelsRouter);
router.use(aiRouter);
router.use(vaultRouter);
router.use(closeFriendsRouter);
router.use(pushRouter);

export default router;
