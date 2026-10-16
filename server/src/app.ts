import cors from "cors";
import express from "express";

import { errorHandler } from "./middlewares/error.middleware.js";

import healthRouter from "./routes/health.routes.js";
import vocabularyRouter from "./routes/vocabulary.routes.js";

const app = express();

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
  }),
);
app.use(express.json({ limit: "100kb" }));

app.use("/api/health", healthRouter);
app.use("/api/vocabulary", vocabularyRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "The requested route does not exist",
    },
  });
});

app.use(errorHandler);

export default app;
