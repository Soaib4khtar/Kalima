import cors from "cors";
import express from "express";
import { createAuthFromEnv, type AuthVerifier } from "./modules/auth/auth.js";
import { createLearningPoolFromEnv } from "./modules/learning/learning.db.js";
import { LearningRepository } from "./modules/learning/learning.repository.js";
import { createLearningRouter } from "./modules/learning/learning.routes.js";

import { errorHandler } from "./middlewares/error.middleware.js";

import type { QuranContentProvider } from "./modules/quran/quran-content-provider.js";
import { createQuranFoundationProviderFromEnv } from "./modules/quran/quran-foundation.provider.js";
import { createQuranRouter } from "./modules/quran/quran.routes.js";

import healthRouter from "./routes/health.routes.js";
import vocabularyRouter from "./routes/vocabulary.routes.js";

export interface AppDependencies {
  quranProvider?: QuranContentProvider;
  auth?: AuthVerifier;
  learningRepository?: LearningRepository;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const quranProvider =
    dependencies.quranProvider ?? createQuranFoundationProviderFromEnv();

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
  app.use("/api/quran", createQuranRouter(quranProvider));
  const learningPool = dependencies.learningRepository ? undefined : createLearningPoolFromEnv();
  app.use("/api/learning", createLearningRouter(dependencies.auth ?? createAuthFromEnv(),
    dependencies.learningRepository ?? (learningPool ? new LearningRepository(learningPool) : undefined), quranProvider));

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

  return app;
}

const app = createApp();
export default app;
