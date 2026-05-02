import WebSocket from "ws";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10_000;

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<WebSocket, RateBucket>();

export function checkRateLimit(ws: WebSocket): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(ws);

  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ws, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}

export function clearRateBucket(ws: WebSocket): void {
  rateBuckets.delete(ws);
}
