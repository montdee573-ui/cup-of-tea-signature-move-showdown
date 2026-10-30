import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contestRouter from "./contest";
import moveCardsRouter from "./move-cards";
import studioRouter from "./studio";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contestRouter);
router.use(moveCardsRouter);
router.use(studioRouter);

export default router;
