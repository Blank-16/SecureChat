import {createServer} from "http";
import {WebSocketServer} from "ws";
import {app} from "./app";

const PORT = parseInt(process.env.PORT ?? "4000" , 10);

const httpServer = createServer(app);

httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

