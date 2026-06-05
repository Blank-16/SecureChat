import express, { type Request, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";

const MAX_BODY_SIZE = 65_536;

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many requests" },
});

export const app = express();

app.use(helmet());

app.use((req, _res, next) => {
  if (parseInt(req.headers["content-length"] ?? "0", 10) > MAX_BODY_SIZE) {
    return next(Object.assign(new Error("Payload too large"), { status: 413 }));
  }
  next();
});

app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(corsMiddleware);

app.options(/.*/, (_req: Request, res: Response) => {
  res.sendStatus(204);
});

app.use("/auth", authLimiter, authRouter);

app.get("/", (_req: Request, res: Response) => {
  res.send("Server running");
});

app.use(errorHandler);
