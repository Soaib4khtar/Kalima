import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { authPreflight, readAuthEnvironment } from "../server/scripts/supabase-preflight.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const serverRequire = createRequire(new URL("../server/package.json", import.meta.url));
class AcceptanceFailure extends Error {}
const requireCheck = (condition, message) => { if (!condition) throw new AcceptanceFailure(message); };

/** Outcome-only diagnostics. Never return raw messages, headers or body fields. */
export function redactedOtpFailure(status, body) {
  const codes = new Set(["email_address_not_authorized", "email_address_invalid", "over_email_send_rate_limit",
    "over_request_rate_limit", "email_provider_disabled", "otp_disabled", "signup_disabled", "captcha_failed",
    "unexpected_failure", "request_timeout", "validation_failed", "invalid_credentials"]);
  const code = body && typeof body === "object" ? body.code ?? body.error_code : undefined;
  return { httpStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : null,
    code: codes.has(code) ? code : "unclassified" };
}

export function checkLiveScope(frontend, backend, args) {
  requireCheck(args.includes("--confirm-development"), "Explicit --confirm-development is required. Use a dedicated development Supabase project only.");
  requireCheck((backend.QF_ENV ?? "prelive") === "prelive", "Only Quran Foundation prelive is allowed.");
  try {
    const url = new URL(backend.LEARNING_DATABASE_URL);
    requireCheck(["postgresql:", "postgres:"].includes(url.protocol) && ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === "55439" && url.pathname === "/kalima_learning_dev" && !url.search && !url.hash,
    "Only the isolated loopback kalima_learning_dev store on port 55439 is allowed.");
  } catch { throw new AcceptanceFailure("Only the isolated loopback kalima_learning_dev store on port 55439 is allowed."); }
  requireCheck(Boolean(frontend.VITE_SUPABASE_URL && backend.SUPABASE_URL), "Supabase project configuration is missing.");
}

/** Opt-in, headed acceptance. All email addresses, OTPs, JWTs, response content,
 * and browser session state stay in memory. No screenshots, traces or dumps.
 * Enter codes in the dedicated browser, never in a terminal or chat.
 */
export async function runHostedAcceptance(args = process.argv.slice(2)) {
  const report = { status: "blocked", hostedLogin: "not-attempted", jwt: "not-verified", refresh: "not-tested",
    restoration: "not-tested", learning: "not-tested", crossDevice: "not-tested", userIsolation: "not-tested", signOut: "not-tested", publicReading: "not-tested" };
  let api, vite, browser, learningPool, legacyPool;
  let stage = "configuration";
  const pages = [];
  const google = args.includes("--google");
  const manualBrowser = args.includes("--manual-browser");
  try {
    const { frontend, backend } = await readAuthEnvironment();
    // Refuse missing/insecure/mismatched settings before launching a browser or
    // reaching any external service. No environment values enter the report.
    const offline = await authPreflight(frontend, backend, { offline: true, provider: google ? "google" : "email" });
    if (offline.status !== "offline-configuration-valid") { report.blockers = offline.blockers; return report; }
    checkLiveScope(frontend, backend, args);
    requireCheck(!manualBrowser || google, "Regular-browser acceptance is restricted to the Google development flow.");
    stage = "hosted-discovery";
    const preflight = await authPreflight(frontend, backend, { provider: google ? "google" : "email" });
    if (preflight.status !== "ready-for-manual-hosted-login") { report.blockers = preflight.blockers; return report; }
    // Force all runtime configuration to the inspected values; never fall back
    // to the original database or inherit a separate browser auth project.
    for (const [key, value] of Object.entries(backend)) if (value !== undefined) process.env[key] = value;
    process.env.DB_HOST = "127.0.0.1"; process.env.DB_PORT = "1";
    process.env.CORS_ORIGINS = "http://localhost:5173";
    stage = "isolated-store-connection";
    const { createLearningPoolFromEnv } = await import("../server/dist/modules/learning/learning.db.js");
    learningPool = createLearningPoolFromEnv();
    const identity = await learningPool.query("SELECT current_database() AS name");
    requireCheck(identity.rows[0]?.name === "kalima_learning_dev", "Unexpected learning database identity.");
    const { createAuthFromEnv } = await import("../server/dist/modules/auth/auth.js");
    const auth = createAuthFromEnv();
    requireCheck(auth.configured, "Backend auth configuration is invalid.");
    const { createApp } = await import("../server/dist/app.js");
    const { LearningRepository } = await import("../server/dist/modules/learning/learning.repository.js");
    ({ pool: legacyPool } = await import("../server/dist/db.js"));
    legacyPool.query = legacyPool.connect = () => { throw new AcceptanceFailure("Original database access is forbidden."); };
    let monitor, manual;
    if (manualBrowser) {
      manual = await import("./manual-google-acceptance.mjs");
      const { decodeJwt } = await import(pathToFileURL(serverRequire.resolve("jose")).href);
      monitor = manual.createGoogleBrowserMonitor(auth, decodeJwt);
    }
    stage = "local-api-start";
    const app = createApp({ auth: monitor?.auth ?? auth, learningRepository: new LearningRepository(learningPool) });
    api = manualBrowser ? (await import("node:http")).createServer(monitor.handle(app)).listen(0, "127.0.0.1") : app.listen(0, "127.0.0.1");
    await new Promise((done, reject) => { api.once("listening", done); api.once("error", reject); });
    const apiOrigin = `http://127.0.0.1:${api.address().port}`;
    process.env.VITE_API_URL = apiOrigin;
    process.env.VITE_SUPABASE_URL = frontend.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = frontend.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { createServer } = await import("vite");
    stage = "local-frontend-start";
    vite = await createServer({ root, logLevel: "silent", server: { host: "localhost", port: 5173, strictPort: true } });
    await vite.listen();
    if (manualBrowser) {
      await manual.runManualGoogleAcceptance({ monitor, pool: learningPool, apiOrigin, report,
        check: requireCheck, setStage: (value) => { stage = value; }, resumePrimary: args.includes("--resume-primary-review") });
      return report;
    }
    const { chromium } = await import("@playwright/test");
    stage = "private-browser-start";
    browser = await chromium.launch({ headless: false, channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      args: ["--disk-cache-size=0", "--media-cache-size=0"] });
    const base = "http://localhost:5173";
    async function newPage() {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      const page = await context.newPage(); page.setDefaultTimeout(15_000); pages.push(page); return page;
    }
    async function getSession(page) {
      return page.evaluate(() => JSON.parse(localStorage.getItem("kalima-auth") || "null"));
    }
    async function privateApi(page, path, method = "GET", body, tokenOverride) {
      const session = await getSession(page);
      const response = await fetch(`${apiOrigin}/api/learning${path}`, { method,
        headers: { Authorization: `Bearer ${tokenOverride ?? session?.access_token ?? "invalid"}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
      return { status: response.status, body: await response.json() };
    }
    let previousOtpAt = 0;
    async function manualLogin(page, label) {
      // Respect Supabase's per-recipient cooldown; never automatically request mail.
      const remaining = google ? 0 : previousOtpAt + 61_000 - Date.now();
      if (remaining > 0) {
        console.log("Waiting for the development email cooldown before the next manual login.");
        for (let wait = remaining; wait > 0; wait -= 1_000) await new Promise((done) => setTimeout(done, Math.min(1_000, wait)));
      }
      await page.goto(`${base}/account`); await page.bringToFront();
      if (google) {
        console.log(`${label}: sign in privately with the requested GOOGLE account in this browser. Do not share credentials, codes or tokens. You have 20 minutes.`);
        await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
      } else {
        await page.getByText("Use an email code instead", { exact: true }).click();
      }
      page.on("request", (request) => { if (request.url().startsWith(frontend.VITE_SUPABASE_URL) && new URL(request.url()).pathname === "/auth/v1/otp") previousOtpAt = Date.now(); });
      page.on("response", async (response) => {
        if (response.url().startsWith(frontend.VITE_SUPABASE_URL) && new URL(response.url()).pathname === "/auth/v1/otp" &&
          response.request().method() === "POST" && response.status() >= 400) {
          const failure = redactedOtpFailure(response.status(), await response.json().catch(() => null));
          report.emailDeliveryFailure = failure;
          console.log(JSON.stringify({ hostedEmailDeliveryFailure: failure }));
        }
      });
      page.on("requestfailed", (request) => {
        if (request.url().startsWith(frontend.VITE_SUPABASE_URL) && new URL(request.url()).pathname === "/auth/v1/otp" && request.method() === "POST") {
          report.emailDeliveryFailure = { httpStatus: null, code: "network-request-failed" };
          console.log("Hosted email request failed at the browser network boundary. No raw URL, headers or error text are logged.");
        }
      });
      const minutes = google || args.includes("--daily-reviews") ? 20 : 8;
      if (!google) console.log(`${label}: enter the real development email and its emailed code in the browser. Keep them out of the terminal/chat. You have ${minutes} minutes.`);
      await page.getByRole("heading", { name: "You’re signed in", exact: true }).waitFor({ timeout: minutes * 60_000 });
      const session = await getSession(page);
      requireCheck(Boolean(session?.access_token), "Hosted login did not provide a session.");
      if (google) requireCheck(session.user?.identities?.some((identity) => identity.provider === "google"), "Hosted acceptance requires a genuine Google identity.");
      const verified = await auth.verify(session.access_token);
      requireCheck(verified.subject === session.user?.id, "Verified JWT identity differs from the SDK session.");
      const { decodeProtectedHeader, decodeJwt } = await import(pathToFileURL(serverRequire.resolve("jose")).href);
      const header = decodeProtectedHeader(session.access_token), claims = decodeJwt(session.access_token);
      requireCheck(["ES256", "RS256"].includes(header.alg) && typeof header.kid === "string" && claims.exp > Date.now() / 1000 && claims.iss === `${new URL(backend.SUPABASE_URL).origin}/auth/v1`, "Hosted JWT claims are incompatible.");
      const profile = await privateApi(page, "/profile");
      requireCheck(profile.status === 200, "Backend rejected the real authenticated session.");
      return { subject: verified.subject, profile: profile.body.data, algorithm: header.alg };
    }
    const page = await newPage();
    stage = "public-reading";
    const readyResponse = page.waitForResponse((response) => response.url() === `${apiOrigin}/api/quran/surahs/1`);
    await page.goto(`${base}/quran/al-fatihah`);
    const ready = (await (await readyResponse).json()).data;
    requireCheck(ready?.status === "ready" && ready.surah.verses.length > 0, "Public Quran content is unavailable; acceptance cannot use fake content.");
    requireCheck((await fetch(`${apiOrigin}/api/learning/profile`)).status === 401, "Private learner API allowed anonymous access.");
    report.publicReading = "passed-without-sign-in";
    if (args.includes("--daily-reviews")) {
      const { runDailyReviewAcceptance } = await import("./daily-review-acceptance.mjs");
      await runDailyReviewAcceptance({ args, page, ready, base, report, learningPool, newPage, getSession,
        privateApi, manualLogin, google, auth, requireCheck, setStage: (value) => { stage = value; } });
      return report;
    }
    stage = "primary-hosted-login";
    const learner = await manualLogin(page, "First learner");
    report.hostedLogin = "succeeded"; report.jwt = { signature: "verified", algorithm: learner.algorithm, issuer: "verified", audience: "verified", expiration: "verified", identity: "verified" };
    requireCheck((await privateApi(page, "/profile", "GET", undefined, "forged")).status === 401, "Invalid bearer token was accepted.");
    const baseline = (await privateApi(page, "/progress")).body.data;
    const bookmarks = (await privateApi(page, "/bookmarks")).body.data.items;
    const words = ready.surah.verses.flatMap((verse) => verse.words);
    const target = words.find((word) => !bookmarks.some((item) => item.surah === 1 && item.ayah === word.reference.ayah && item.word === word.position)) ?? words[0];
    requireCheck(Boolean(target), "No source word is available to bookmark.");
    await page.goto(`${base}/quran/al-fatihah?word=1:${target.reference.ayah}:${target.position}`);
    const panel = page.locator(".quran-detail-column");
    const wasSaved = bookmarks.some((item) => item.ayah === target.reference.ayah && item.word === target.position);
    if (!wasSaved) await panel.getByRole("button", { name: "Bookmark word", exact: true }).click();
    await panel.getByRole("button", { name: "Remove bookmark", exact: true }).waitFor();
    const recall = page.getByRole("region", { name: "Saved meaning recall" });
    const active = (await privateApi(page, "/sessions/current")).body.data;
    if (!active) await recall.getByRole("button", { name: "Start saved recall", exact: true }).click();
    await recall.getByRole("button", { name: "Reveal meaning", exact: true }).click();
    const savedResponse = page.waitForResponse((response) => response.url() === `${apiOrigin}/api/learning/attempts` && response.request().method() === "POST");
    await recall.getByRole("button", { name: "Good", exact: true }).click();
    const saved = await savedResponse; requireCheck(saved.ok(), "Real authenticated recall was not saved.");
    const attempt = (await saved.json()).data;
    const progress = (await privateApi(page, "/progress")).body.data;
    requireCheck(progress.totalReviews === baseline.totalReviews + 1, "Recall total did not persist exactly once.");
    requireCheck((await privateApi(page, "/history")).body.data.items.some((item) => item.id === attempt.attemptId), "The real recall is absent from history.");
    report.learning = "bookmarks-history-progress-saved";
    stage = "session-restoration";
    const expectedSession = (await privateApi(page, "/sessions/current")).body.data;
    await page.reload(); await recall.waitFor();
    requireCheck((await getSession(page))?.user.id === learner.subject, "Session did not restore after reload.");
    requireCheck(JSON.stringify((await privateApi(page, "/sessions/current")).body.data) === JSON.stringify(expectedSession), "Recall position did not restore.");
    report.restoration = "passed";
    stage = "hosted-refresh";
    const refreshed = await page.evaluate(async () => {
      const path = "/src/features/auth/auth-client.ts";
      const { authClient } = await import(/* @vite-ignore */ path);
      const { data, error } = await authClient.auth.refreshSession();
      return { success: !error && Boolean(data.session), subject: data.session?.user.id };
    });
    requireCheck(refreshed.success && refreshed.subject === learner.subject, "Hosted session refresh failed.");
    await auth.verify((await getSession(page)).access_token);
    requireCheck((await privateApi(page, "/profile")).body.data.id === learner.profile.id, "Refreshed identity changed.");
    report.refresh = "passed";
    if (args.includes("--cross-device")) {
      stage = "independent-device-login";
      const device = await newPage();
      const restored = await manualLogin(device, "Second browser window: sign in to the SAME learner account with a NEW emailed code");
      requireCheck(restored.subject === learner.subject && restored.profile.id === learner.profile.id, "Second device signed in to a different account.");
      const recovered = (await privateApi(device, "/progress")).body.data;
      requireCheck(recovered.totalReviews === progress.totalReviews &&
        (await privateApi(device, "/history")).body.data.items.some((item) => item.id === attempt.attemptId) &&
        (await privateApi(device, "/bookmarks")).body.data.items.some((item) => item.ayah === target.reference.ayah && item.word === target.position), "New device did not recover saved learning.");
      report.crossDevice = "passed-with-independent-email-sign-in";
    }
    if (args.includes("--two-users")) {
      stage = "second-real-user";
      const other = await newPage();
      const second = await manualLogin(other, "Different learner: use a SECOND real development account");
      requireCheck(second.subject !== learner.subject && second.profile.id !== learner.profile.id, "User-isolation check requires two different real users.");
      const history = await privateApi(other, "/history");
      requireCheck(history.status === 200 && !history.body.data.items.some((item) => item.id === attempt.attemptId), "Another learner's review appeared in history.");
      const foreign = await privateApi(other, "/attempts", "POST", { clientAttemptId: crypto.randomUUID(), sessionId: attempt.session.id, vocabularyId: attempt.session.items[0].vocabularyId, rating: "good" });
      requireCheck(foreign.status === 404, "Foreign learning session was not rejected.");
      report.userIsolation = "passed-for-two-real-users";
    }
    stage = "sign-out";
    for (const current of pages) {
      if (!(await getSession(current))) continue;
      await current.goto(`${base}/account`);
      await current.getByRole("button", { name: "Sign out", exact: true }).click();
      await current.getByRole("heading", { name: "Save your learning", exact: true }).waitFor();
      requireCheck(!(await getSession(current)) && await current.getByRole("region", { name: "Your learning progress" }).count() === 0, "Sign-out left private account state visible.");
    }
    report.signOut = "passed";
    report.status = [report.crossDevice, report.userIsolation].includes("not-tested") ? "passed-with-unperformed-checks" : "passed";
    report.note = "Real development activity is retained; no bookmarks, history, users, or databases were deleted. Dashboard templates/redirects/SMTP still require owner confirmation.";
  } catch (error) {
    report.status = "failed"; report.failedStage = stage;
    report.failure = error instanceof AcceptanceFailure ? error.message : "Operation failed; raw exceptions, provider bodies, identities and tokens are suppressed.";
    if (["EACCES", "EPERM", "EADDRINUSE", "ECONNREFUSED", "ENOENT"].includes(error?.code)) report.failureCode = error.code;
  } finally {
    for (const page of pages) {
      await page.evaluate(async () => {
        const path = "/src/features/auth/auth-client.ts";
        const { authClient } = await import(/* @vite-ignore */ path);
        await authClient?.auth.signOut({ scope: "local" });
      }).catch(() => {});
    }
    await browser?.close().catch(() => {}); await vite?.close().catch(() => {});
    if (api) await new Promise((done) => api.close(done));
    await learningPool?.end().catch(() => {}); await legacyPool?.end().catch(() => {});
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runHostedAcceptance();
  console.log(JSON.stringify(result, null, 2));
  if (["failed", "blocked"].includes(result.status)) process.exitCode = 1;
}
