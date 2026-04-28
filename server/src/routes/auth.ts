import { Router, type Request, type Response } from "express";

export const authRouter = Router();

authRouter.post("/register", (req: Request, res: Response) => {});

authRouter.post("/logout", (req: Request, res: Response) => {});
