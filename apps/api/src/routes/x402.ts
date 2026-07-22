import { Router } from "express";

import { asyncHandler } from "../lib/http.js";
import { buildLaunchPackage } from "../services/b20.js";

export const x402Router = Router();

x402Router.post(
  "/b20/build",
  asyncHandler(async (req, res) => {
    const { tx } = await buildLaunchPackage(req.body, {
      stageId: req.get("x-metadata-stage-id"),
      stageToken: req.get("x-metadata-stage-token")
    });
    res.json(tx);
  })
);
