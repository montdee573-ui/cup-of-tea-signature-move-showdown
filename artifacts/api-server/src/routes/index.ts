import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contestRouter from "./contest";
import moveCardsRouter from "./move-cards";
import studioRouter from "./studio";
import merchRouter from "./merch";
import moveSubmissionsRouter from "./move-submissions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contestRouter);
router.use(moveCardsRouter);
router.use(studioRouter);
router.use(merchRouter);
router.use(moveSubmissionsRouter);

export default router;
