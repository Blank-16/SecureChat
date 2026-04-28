import { Request, Response, NextFunction } from "express";

export function corsMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.CLIENT_ORIGIN ?? "*",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-ALlow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
}
