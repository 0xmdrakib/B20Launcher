import { Router } from "express";

import { asyncHandler } from "../lib/http.js";
import { getAgentManifest } from "../services/manifest.js";

export const agentsRouter: Router = Router();

agentsRouter.get(
  "/manifest",
  asyncHandler(async (_req, res) => {
    res.json(getAgentManifest());
  })
);
