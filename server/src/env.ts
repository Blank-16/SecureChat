// Validates and returns all required environment variables. Exits on misconfiguration.

interface ServerEnv {
  PORT: number;
  DATABASE_URL: string;
  ALLOWED_ORIGINS: string[];
  CLIENT_ORIGIN: string;
  SESSION_TTL_DAYS: number;
  NODE_ENV: string;
}

function fail(message: string): never {
  console.error(`Configuration error: ${message}`);
  process.exit(1);
}

export function loadEnv(): ServerEnv {
  const PORT = parseInt(process.env.PORT ?? "4000", 10);
  if (!Number.isFinite(PORT) || PORT <= 0 || PORT > 65535) {
    fail(`PORT must be a valid port number, got "${process.env.PORT}"`);
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    fail("DATABASE_URL is required (e.g. postgresql://user:pass@host:5432/dbname)");
  }
  if (!DATABASE_URL.startsWith("postgres://") && !DATABASE_URL.startsWith("postgresql://")) {
    fail("DATABASE_URL must be a postgres:// or postgresql:// connection string");
  }

  const allowedOriginsRaw = process.env.ALLOWED_ORIGINS;
  if (!allowedOriginsRaw) {
    fail("ALLOWED_ORIGINS is required (comma-separated list, e.g. https://app.example.com)");
  }
  const ALLOWED_ORIGINS = allowedOriginsRaw.split(",").map((o) => o.trim()).filter(Boolean);
  if (ALLOWED_ORIGINS.length === 0) {
    fail("ALLOWED_ORIGINS must contain at least one origin");
  }

  const NODE_ENV = process.env.NODE_ENV ?? "development";
  if (NODE_ENV === "production") {
    for (const origin of ALLOWED_ORIGINS) {
      if (!origin.startsWith("https://")) {
        fail(`In production, ALLOWED_ORIGINS must use https:// — got "${origin}"`);
      }
    }
  }

  const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? ALLOWED_ORIGINS[0];

  const rawTtl = parseInt(process.env.SESSION_TTL_DAYS ?? "30", 10);
  const SESSION_TTL_DAYS = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 30;

  return { PORT, DATABASE_URL, ALLOWED_ORIGINS, CLIENT_ORIGIN, SESSION_TTL_DAYS, NODE_ENV };
}
