import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = new URL("../../", import.meta.url);
export async function readAuthEnvironment(environment = process.env) {
  async function read(paths) {
    const result = {};
    for (const path of paths) {
      try { Object.assign(result, parse(await readFile(new URL(path, root)))); }
      catch (error) { if (error.code !== "ENOENT") throw new Error("Environment files could not be read"); }
    }
    return { ...result, ...environment };
  }
  const frontend = await read([".env", ".env.local", ".env.development", ".env.development.local"]);
  const backend = await read(["server/.env"]);
  const local = await read(["server/.env.learning.local"]);
  if (!backend.LEARNING_DATABASE_URL?.trim()) backend.LEARNING_DATABASE_URL = local.LEARNING_DATABASE_URL;
  return { frontend, backend };
}

function hostedOrigin(value) {
  const url = new URL(value);
  // This development acceptance helper deliberately excludes local test identity
  // hosts and custom domains. Application auth still supports trusted HTTPS origins.
  if (url.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
    url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
  return url.origin;
}

/** Read-only checks. No OTP requests, tokens, writes, admin keys or raw errors. */
export async function authPreflight(frontend, backend, { offline = false, fetchImplementation = fetch } = {}) {
  const report = { status: "blocked", hostedLogin: "not-attempted", configuration: {}, blockers: [],
    dashboardChecks: ["dedicated-development-project", "email-OTP-templates", "site-and-redirect-URLs", "SMTP-recipients-and-quota", "active-signing-key", "CAPTCHA-policy"] };
  for (const [name, env] of [["VITE_SUPABASE_URL", frontend], ["VITE_SUPABASE_PUBLISHABLE_KEY", frontend], ["SUPABASE_URL", backend]]) {
    report.configuration[name] = Boolean(env[name]?.trim());
    if (!report.configuration[name]) report.blockers.push(`MISSING_${name}`);
  }
  if (report.blockers.length) return report;
  let origin;
  try {
    origin = hostedOrigin(frontend.VITE_SUPABASE_URL.trim());
    if (origin !== hostedOrigin(backend.SUPABASE_URL.trim())) { report.blockers.push("PROJECT_URL_MISMATCH"); return report; }
  } catch { report.blockers.push("STANDARD_HOSTED_PROJECT_URL_REQUIRED"); return report; }
  const key = frontend.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) { report.blockers.push("PUBLISHABLE_KEY_REQUIRED"); return report; }
  report.configuration.matchingProject = true;
  report.configuration.publishableKeyFormat = true;
  if (offline) { report.status = "offline-configuration-valid"; return report; }
  for (const kind of ["settings", "jwks"]) {
    try {
      const response = await fetchImplementation(`${origin}/auth/v1/${kind === "settings" ? "settings" : ".well-known/jwks.json"}`, {
        method: "GET", headers: { apikey: key, Accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(8_000), cache: "no-store",
      });
      if (!response.ok) { report.blockers.push(`${kind.toUpperCase()}_HTTP_${response.status}`); continue; }
      const body = await response.json();
      if (kind === "settings") {
        if (typeof body.external?.email !== "boolean" || typeof body.disable_signup !== "boolean" || typeof body.mailer_autoconfirm !== "boolean") throw new Error();
        report.settings = { emailEnabled: body.external.email, signupsEnabled: !body.disable_signup,
          emailConfirmationRequired: !body.mailer_autoconfirm, anonymousEnabled: body.external.anonymous_users === true };
        if (!report.settings.emailEnabled) report.blockers.push("EMAIL_PROVIDER_DISABLED");
        if (!report.settings.signupsEnabled) report.blockers.push("SIGNUPS_DISABLED");
        if (!report.settings.emailConfirmationRequired) report.blockers.push("ENABLE_EMAIL_CONFIRMATION_FOR_ACCEPTANCE");
        if (report.settings.anonymousEnabled) report.blockers.push("DISABLE_ANONYMOUS_SIGN_IN_FOR_ACCEPTANCE");
      } else {
        if (!Array.isArray(body.keys)) throw new Error();
        const supported = body.keys.filter((item) => typeof item.kid === "string" &&
          ((item.alg === "ES256" && item.kty === "EC" && item.crv === "P-256" && item.x && item.y) ||
           (item.alg === "RS256" && item.kty === "RSA" && item.n && item.e)) &&
          (item.use === undefined || item.use === "sig") && !item.d);
        report.jwks = { supportedPublicKeys: supported.length, algorithms: [...new Set(supported.map((item) => item.alg))].sort(),
          activeSigningAlgorithm: "requires-actual-login" };
        if (!supported.length) report.blockers.push("NO_SUPPORTED_ASYMMETRIC_PUBLIC_KEY");
      }
    } catch { report.blockers.push(`${kind.toUpperCase()}_UNAVAILABLE_OR_INVALID`); }
  }
  report.status = report.blockers.length ? "blocked" : "ready-for-manual-hosted-login";
  // JWKS may include standby/previous keys. Discovery never proves which key
  // currently signs tokens, that mail arrives, or that a user can authenticate.
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { frontend, backend } = await readAuthEnvironment();
    const report = await authPreflight(frontend, backend, { offline: process.argv.includes("--offline") });
    console.log(JSON.stringify(report, null, 2));
    if (report.status === "blocked") process.exitCode = 1;
  } catch { console.error("Authentication preflight failed; all raw configuration and errors are suppressed."); process.exitCode = 1; }
}
