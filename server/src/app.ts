import express,{ type Request, type Response  } from "express";

export const app = express();

app.get("/", (_req : Request, res: Response) => {
    res.send("SecureChat Server...");
})
