import type {
  ErrorRequestHandler,
} from "express";

import { AppError } from "../utils/app-error.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  void _next;
  if (error?.type === "entity.parse.failed" || error?.type === "entity.too.large") {
    res.status(error.type === "entity.too.large" ? 413 : 400).json({ success: false,
      error: { code: "INVALID_BODY", message: "Request body must be valid JSON within the size limit" } });
    return;
  }
  // Never log bearer tokens, request bodies, database URLs or raw provider errors.
  if (!(error instanceof AppError)) console.error("Unhandled API error");

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });

    return;
  }

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
