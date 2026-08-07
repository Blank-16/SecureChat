import { NextFunction, Request, Response } from "express";

// Errors with a `status` property carry a safe client-facing message.
// All other errors are logged server-side; a generic message is returned.
export function errorHandler(
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status ?? 500;

  if (status >= 500) {
    console.error("Unhandled request error:", err);
    res.status(status).json({ error: "internal server error" });
    return;
  }

  res.status(status).json({ error: err.message || "request error" });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not found" });
}
