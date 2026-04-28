import { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status ?? 500;
  res.status(status).json({ error: err.message ?? "internal server error" });
}
