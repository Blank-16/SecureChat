import { createServer } from "http";
import { WebSocketServer } from "ws";
import { loadEnv } from "./env";
import { createApp } from "./app";
import { setupWebSocketServer } from "./wsHandlers";
import { initDb, migrate } from "./db";

async function main(): Promise<void> {
  // Validate config at boot; a bad value fails loudly before any dependency initialises.
  const env = loadEnv();

  const sql = initDb(env.DATABASE_URL);
  await migrate();

  const app = createApp(env.ALLOWED_ORIGINS);
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  setupWebSocketServer(wss, env.ALLOWED_ORIGINS);

  httpServer.listen(env.PORT, () => {
    console.log(`Server listening on port ${env.PORT}`);
  });

  function shutdown() {
    wss.clients.forEach(client => client.terminate());
    wss.close();
    httpServer.close(() => {
      void sql.end({ timeout: 5 }).then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

// Log unhandled rejections and uncaught exceptions rather than crashing silently.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception, exiting:", err);
  process.exit(1);
});
