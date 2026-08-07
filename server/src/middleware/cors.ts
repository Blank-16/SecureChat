import { Request, Response, NextFunction } from "express";

// Factory so CORS and WS origin checks share the same origin list from env.ts.
export function createCorsMiddleware(allowedOrigins: string[]) {
  const ALLOWED_ORIGINS = new Set(allowedOrigins);

  return function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  };
}
