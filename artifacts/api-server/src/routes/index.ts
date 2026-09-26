import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contestRouter from "./contest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contestRouter);

export default router;
