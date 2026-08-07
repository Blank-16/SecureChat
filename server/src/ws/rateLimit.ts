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
  const bucket = rateBuckets.get(ws);

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

// Sweeps buckets whose window has elapsed. Normally clearRateBucket() handles
// cleanup on socket close, but abrupt disconnects can leave stale entries.
export function sweepStaleRateBuckets(): void {
  const now = Date.now();
  for (const [ws, bucket] of rateBuckets) {
    if (now - bucket.resetAt > RATE_WINDOW_MS) {
      rateBuckets.delete(ws);
    }
  }
}
