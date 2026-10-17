import assert from "node:assert/strict";
import test from "node:test";
import { authPreflight } from "../scripts/supabase-preflight.mjs";
import { checkLiveScope } from "../../scripts/verify-supabase-live.mjs";

// SYNTHETIC configuration only. No real project or hosted login is used here.
const address = "https://abcdefghijklmnopqrst.supabase.co";
const key = "sb_publishable_SYNTHETIC_PRIVATE_SENTINEL";
const front = { VITE_SUPABASE_URL: address, VITE_SUPABASE_PUBLISHABLE_KEY: key };
const back = { SUPABASE_URL: address };
const settings = { external: { email: true, anonymous_users: false }, disable_signup: false, mailer_autoconfirm: false };
const jwks = { keys: [{ kid: "synthetic-key", alg: "ES256", kty: "EC", crv: "P-256", x: "synthetic-x", y: "synthetic-y" }] };

test("preflight refuses missing/mismatched/insecure settings without making any requests", async () => {
  let requests = 0;
  const fetchImplementation = async () => { requests++; throw new Error(); };
  for (const [frontend, backend] of [[{}, {}], [front, { SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co" }],
    [{ ...front, VITE_SUPABASE_URL: "http://127.0.0.1:4175" }, back], [{ ...front, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_PRIVATE_SENTINEL" }, back],
    [{ ...front, VITE_SUPABASE_URL: `${address}/?secret=PRIVATE_SENTINEL` }, back]]) {
    const result = await authPreflight(frontend, backend, { fetchImplementation });
    assert.equal(result.status, "blocked"); assert.equal(result.hostedLogin, "not-attempted");
    assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
  }
  assert.equal(requests, 0);
  assert.equal((await authPreflight(front, back, { offline: true, fetchImplementation })).status, "offline-configuration-valid");
  assert.equal(requests, 0);
});

test("preflight makes only authenticated GET discovery calls and never claims actual login or active-key verification", async () => {
  const requests: string[] = [];
  const result = await authPreflight(front, back, { fetchImplementation: async (url: string, options: RequestInit) => {
    requests.push(url); assert.equal(options.method, "GET"); assert.equal(options.redirect, "error"); assert.equal((options.headers as Record<string, string>).apikey, key);
    return Response.json(url.endsWith("settings") ? settings : jwks);
  } });
  assert.deepEqual(requests, [`${address}/auth/v1/settings`, `${address}/auth/v1/.well-known/jwks.json`]);
  assert.equal(result.status, "ready-for-manual-hosted-login");
  assert.equal(result.hostedLogin, "not-attempted"); assert.equal(result.jwks.activeSigningAlgorithm, "requires-actual-login");
  assert.ok(!JSON.stringify(result).includes(key));
});

test("preflight exposes configuration blockers and whitelisted booleans, not raw response bodies", async () => {
  const result = await authPreflight(front, back, { fetchImplementation: async (url: string) => Response.json(url.endsWith("settings") ? {
    ...settings, disable_signup: true, mailer_autoconfirm: true, external: { email: false, anonymous_users: true }, private: key,
  } : { keys: [] }) });
  assert.equal(result.status, "blocked"); assert.equal(result.blockers.length, 5);
  assert.ok(!JSON.stringify(result).includes(key));
  for (const fetchImplementation of [async () => new Response(key, { status: 401 }), async () => { throw new Error(key); }, async () => Response.json({ private: key })]) {
    const failure = await authPreflight(front, back, { fetchImplementation });
    assert.equal(failure.status, "blocked"); assert.ok(!JSON.stringify(failure).includes(key));
  }
});

test("headed acceptance requires explicit dev confirmation and the exact isolated store", () => {
  const dev = { ...back, QF_ENV: "prelive", LEARNING_DATABASE_URL: "postgresql://127.0.0.1:55439/kalima_learning_dev" };
  assert.throws(() => checkLiveScope(front, dev, []), /confirm-development/);
  assert.doesNotThrow(() => checkLiveScope(front, dev, ["--confirm-development"]));
  for (const LEARNING_DATABASE_URL of ["postgresql://127.0.0.1:5432/kalima", "postgresql://remote:55439/kalima_learning_dev", "postgresql://127.0.0.1:55439/kalima_learning_dev?host=remote", "postgresql://127.0.0.1:55439/kalima_learning_test"]) {
    assert.throws(() => checkLiveScope(front, { ...dev, LEARNING_DATABASE_URL }, ["--confirm-development"]), /isolated/);
  }
  assert.throws(() => checkLiveScope(front, { ...dev, QF_ENV: "production" }, ["--confirm-development"]), /prelive/);
});
