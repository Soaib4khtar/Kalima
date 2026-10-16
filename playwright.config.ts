import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    // An installed Chrome can be used locally without downloading Chromium.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm --prefix server run build && npm --prefix server run start",
      url: "http://127.0.0.1:4174/api/health",
      reuseExistingServer: false,
      env: {
        PORT: "4174",
        CORS_ORIGINS: "http://127.0.0.1:4173",
        QF_ENV: "prelive",
        QF_CLIENT_ID: "",
        QF_CLIENT_SECRET: "",
        QF_TRANSLATION_ID: "",
        QF_RECITATION_ID: "",
        // No test may depend on the original database being reachable.
        DB_HOST: "127.0.0.1",
        DB_PORT: "1",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173/quran/al-fatihah",
      reuseExistingServer: false,
      env: { VITE_API_URL: "http://127.0.0.1:4174" },
    },
  ],
});
