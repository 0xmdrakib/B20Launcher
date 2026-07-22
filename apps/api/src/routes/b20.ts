import { Router } from "express";
import { getAddress, isAddress } from "viem";

import { ApiError, asyncHandler } from "../lib/http.js";
import { buildLaunchPackage, getB20Status, quoteLaunch } from "../services/b20.js";
import { queryRecentB20Creations } from "../services/sql.js";

export const b20Router = Router();

function metadataAuth(req: { get(name: string): string | undefined }) {
  return {
    stageId: req.get("x-metadata-stage-id"),
    stageToken: req.get("x-metadata-stage-token")
  };
}

b20Router.post(
  "/quote",
  asyncHandler(async (req, res) => {
    res.json(await quoteLaunch(req.body, metadataAuth(req)));
  })
);

b20Router.post(
  "/build",
  asyncHandler(async (req, res) => {
    const { tx } = await buildLaunchPackage(req.body, metadataAuth(req));
    res.json(tx);
  })
);

b20Router.get(
  "/recent",
  asyncHandler(async (_req, res) => {
    res.json(await queryRecentB20Creations(25));
  })
);

b20Router.get(
  "/:address/status",
  asyncHandler(async (req, res) => {
    const address = req.params.address;
    if (!address || Array.isArray(address) || !isAddress(address)) {
      throw new ApiError("A valid B20 token address is required.", 400);
    }
    res.json(await getB20Status(getAddress(address)));
  })
);
