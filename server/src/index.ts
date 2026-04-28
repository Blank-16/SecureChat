import { createServer } from "http";
import { WebSocketServer } from "ws";
import { app } from "./app";

const PORT = parseInt(process.env.PORT ?? "4000", 10);

const httpServer = createServer(app);

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on("SIGTERM", () => {
  // sigterm -> graceful shutdown
  wss.close();
  httpServer.close();
});
