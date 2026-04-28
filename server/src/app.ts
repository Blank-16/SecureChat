import express, { type Request, type Response } from "express";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";

const MAX_BODY_SIZE = 65_536; // 64KB

export const app = express();

app.use((req, _res, next) => {
  if (parseInt(req.headers["content-length"] ?? "0", 10) > MAX_BODY_SIZE) {
    next(Object.assign(new Error("Payload too large"), { status: 413 }));
  }
  next();
});

app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(corsMiddleware);

app.options("*", (_req: Request, res: Response) => {
  res.sendStatus(204);
});

app.use("/auth", authRouter);

app.get("/", (_req: Request, res: Response) => {
  res.send("SecureChat Server...");
});

app.use(errorHandler);
