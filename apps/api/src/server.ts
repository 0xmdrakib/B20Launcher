import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { config } from "./config.js";
import { agentsRouter } from "./routes/agents.js";
import { b20Router } from "./routes/b20.js";
import { metadataRouter } from "./routes/metadata.js";
import { x402Router } from "./routes/x402.js";
import { errorHandler } from "./lib/http.js";
import { createX402Middleware } from "./lib/x402.js";
import { store } from "./services/store.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.WEB_ORIGIN,
    credentials: false
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp());
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    chainId: config.BASE_CHAIN_ID,
    x402: config.X402_ENABLED,
    storage: {
      provider: "Lighthouse",
      configured: Boolean(config.LIGHTHOUSE_API_KEY),
      staging: store.kind
    }
  });
});

app.use("/api/metadata", metadataRouter);
app.use("/api/b20", b20Router);
app.use("/api/agents", agentsRouter);
app.use("/x402", ...createX402Middleware(config), x402Router);
app.use(errorHandler);

async function start() {
  await store.initialize();
  await store.cleanupMetadataStages();

  const cleanupTimer = setInterval(() => {
    void store.cleanupMetadataStages().catch((error) => {
      console.error("Metadata stage cleanup failed", error);
    });
  }, 5 * 60 * 1000);
  cleanupTimer.unref();

  app.listen(config.API_PORT, () => {
    console.log(`B20 API listening on http://localhost:${config.API_PORT}`);
  });
}

void start().catch((error) => {
  console.error("B20 API failed to start", error);
  process.exitCode = 1;
});
