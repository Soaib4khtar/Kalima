import cors from "cors";
import express from "express";

import { errorHandler } from "./middlewares/error.middleware.js";

import healthRouter from "./routes/health.routes.js";
import vocabularyRouter from "./routes/vocabulary.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

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