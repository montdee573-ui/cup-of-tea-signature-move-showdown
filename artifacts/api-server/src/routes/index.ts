import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contestRouter from "./contest";
import moveCardsRouter from "./move-cards";
import studioMoveCardsRouter from "./studio-move-cards";
import studioReferenceClipsRouter from "./studio-reference-clips";
import studioRouter from "./studio";
import merchRouter from "./merch";
import moveSubmissionsRouter from "./move-submissions";
import communityCardsRouter from "./community-cards";
import showdownsRouter from "./showdowns";
import contestResultsRouter from "./contest-results";
import resendWebhookRouter from "./resend-webhook";
import creatorCardsRouter from "./creator-cards";
import campaignMediaRouter from "./campaign-media";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignMediaRouter);
router.use(contestRouter);
router.use(moveCardsRouter);
router.use(studioMoveCardsRouter);
router.use(studioReferenceClipsRouter);
router.use(studioRouter);
router.use(merchRouter);
router.use(moveSubmissionsRouter);
router.use(communityCardsRouter);
router.use(showdownsRouter);
router.use(contestResultsRouter);
router.use(resendWebhookRouter);
router.use(creatorCardsRouter);

export default router;
