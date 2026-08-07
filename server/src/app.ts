import express, { type Request, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createCorsMiddleware } from "./middleware/cors";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { sql } from "./db";

const MAX_BODY_SIZE = 65_536;

// Factory so CORS and WS origin checks share the same validated origin list.
export function createApp(allowedOrigins: string[]) {
  const authLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too many requests" },
  });

  const app = express();

  // Strict CSP: no inline scripts/styles, no eval. Primary XSS mitigation
  // protecting IndexedDB key material and ratchet state.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
    }),
  );

  app.use((req, _res, next) => {
    if (parseInt(req.headers["content-length"] ?? "0", 10) > MAX_BODY_SIZE) {
      return next(Object.assign(new Error("Payload too large"), { status: 413 }));
    }
    next();
  });

  app.use(express.json({ limit: MAX_BODY_SIZE }));
  app.use(createCorsMiddleware(allowedOrigins));

  app.options(/.*/, (_req: Request, res: Response) => {
    res.sendStatus(204);
  });

  app.use("/auth", authLimiter, authRouter);

  app.get("/", (_req: Request, res: Response) => {
    res.send("Server running");
  });

  // Probes real DB availability, not just process liveness.
  app.get("/healthz", async (_req: Request, res: Response) => {
    try {
      await sql`SELECT 1`;
      res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("Health check failed:", err);
      res.status(503).json({ status: "unhealthy" });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
