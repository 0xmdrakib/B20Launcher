import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";

import { ApiError } from "./errors.js";

export { ApiError } from "./errors.js";

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Logo must be 1 MB or smaller."
        : error.message;
    return res.status(400).json({ error: message });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Request validation failed.",
      details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: error.message,
      details: error.details
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return res.status(500).json({ error: message });
}
