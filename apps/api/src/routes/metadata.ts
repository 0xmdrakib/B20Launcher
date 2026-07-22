import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";

import { asyncHandler } from "../lib/http.js";
import { commitMetadata, MAX_LOGO_BYTES, prepareMetadata } from "../services/ipfs.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 }
});
export const metadataRouter = Router();
const stageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many metadata staging requests. Try again later." }
});
const commitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many metadata publication attempts. Try again later." }
});

metadataRouter.post(
  "/prepare",
  stageLimiter,
  upload.single("logo"),
  asyncHandler(async (req, res) => {
    const prepared = await prepareMetadata(req.body, req.file);
    res.setHeader("Cache-Control", "no-store");
    res.json(prepared);
  })
);

metadataRouter.post(
  "/commit",
  commitLimiter,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await commitMetadata(req.body));
  })
);
