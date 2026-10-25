import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contestRouter from "./contest";
import moveCardsRouter from "./move-cards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contestRouter);
router.use(moveCardsRouter);

export default router;
