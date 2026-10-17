import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "learning.spec.ts", fullyParallel: false, workers: 1,
  globalTeardown: "./e2e/support/learning-teardown.ts",
  forbidOnly: Boolean(process.env.CI), retries: 0, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173", channel: process.env.PLAYWRIGHT_CHANNEL || undefined, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    { command: "npm --prefix server run build && node e2e/support/learning-server.mjs", url: "http://127.0.0.1:4174/api/health", reuseExistingServer: false,
      env: { CORS_ORIGINS: "http://127.0.0.1:4173", QF_CLIENT_ID: "", QF_CLIENT_SECRET: "", SUPABASE_URL: "", DB_HOST: "127.0.0.1", DB_PORT: "1" } },
    { command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173/account", reuseExistingServer: false,
      env: { VITE_API_URL: "http://127.0.0.1:4174", VITE_SUPABASE_URL: "http://127.0.0.1:4175", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only" } },
  ],
});
