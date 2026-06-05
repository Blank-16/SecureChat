import { createServer } from "http";
import { WebSocketServer } from "ws";
import { app } from "./app";
import { setupWebSocketServer } from "./wsHandlers";
import { db } from "./db";

const PORT = parseInt(process.env.PORT ?? "4000", 10);

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

setupWebSocketServer(wss);

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

function shutdown() {
  wss.clients.forEach(client => client.terminate());
  wss.close();
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
