import type { RequestHandler } from "express";
import * as z from "zod";

import { AppError } from "../utils/app-error.js";

type RequestPart = "body" | "query" | "params";

export function validate(
  part: RequestPart,
  schema: z.ZodType,
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed",
          result.error.issues,
        ),
      );

      return;
    }

    if (part === "body") {
      req.body = result.data;
    }

    next();
  };
}