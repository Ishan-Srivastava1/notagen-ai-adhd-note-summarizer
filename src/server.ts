import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./utils/logger";

import health from "./routes/health";
import summarize from "./routes/summarize";
import tts from "./routes/tts";
import notes from "./routes/notes";
import { summarizeText } from "./lib/openai";

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.WEB_ORIGIN?.split(",") || "*",
  credentials: false,
}));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));

app.get("/", (_req, res) => res.redirect("/health"));
app.use("/health", health);
app.use("/summarize", summarize);
app.use("/tts", tts);
app.use("/notes", notes);

// Quick smoke-test for the Gemini key
app.get("/test-ai", async (_req, res) => {
  try {
    const result = await summarizeText("The mitochondria is the powerhouse of the cell.");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Gemini test failed" });
  }
});

app.use((err: any, req: any, res: any, _next: any) => {
  const status = err.status || 500;
  req.log?.error?.(err);
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});
