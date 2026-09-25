import cors from "cors";
import express from "express";

import healthRouter from "./routes/health.routes.js";
import vocabularyRouter from "./routes/vocabulary.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/vocabulary", vocabularyRouter);

export default app;