import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { getPublicLogo, getPublicToken, listPublicTokens, publicTokenList, recentPublicTokens } from "../services/public-tokens.js";

export const publicTokensRouter: Router = Router();
publicTokensRouter.use(["/tokens", "/tokenlist", "/b20/recent"], (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") { next(); return; }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  next();
});
publicTokensRouter.get("/tokenlist", asyncHandler(async (_req, res) => { res.json(await publicTokenList()); }));
publicTokensRouter.get("/b20/recent", asyncHandler(async (_req, res) => { res.json(await recentPublicTokens()); }));
publicTokensRouter.get("/tokens", asyncHandler(async (req, res) => {
  res.json(await listPublicTokens({
    ...(req.query.limit === undefined ? {} : { limit: String(req.query.limit) }),
    ...(req.query.after === undefined ? {} : { after: String(req.query.after) })
  }));
}));
publicTokensRouter.get("/tokens/:address", asyncHandler(async (req, res) => { res.json(await getPublicToken(String(req.params.address))); }));
publicTokensRouter.get("/tokens/:address/metadata", asyncHandler(async (req, res) => { res.json((await getPublicToken(String(req.params.address))).metadata); }));
publicTokensRouter.get("/tokens/:address/logo", asyncHandler(async (req, res) => {
  const logo = await getPublicLogo(String(req.params.address));
  res.setHeader("ETag", logo.etag);
  res.type("png").send(logo.body);
}));
