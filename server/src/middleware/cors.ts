import { Request, Response, NextFunction } from "express";

const ALLOWED_ORIGINS = new Set(
  (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map(o => o.trim())
);

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
}
