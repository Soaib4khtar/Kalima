import assert from "node:assert/strict";
import test from "node:test";
import { discoverPreliveResources } from "../scripts/qf-prelive-resources.mjs";

const syntheticCredentials = { QF_ENV: "prelive", QF_CLIENT_ID: "synthetic-client", QF_CLIENT_SECRET: "synthetic-secret" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("prelive resource discovery refuses missing credentials and production without requests", async () => {
  let calls = 0;
  const fetchImplementation = async () => { calls += 1; throw new Error("must not request"); };
  const missing = await discoverPreliveResources({}, fetchImplementation);
  assert.equal(missing.status, "unconfigured");
  assert.equal(missing.authentication, "not-attempted");
  assert.deepEqual(missing.missing, ["QF_CLIENT_ID", "QF_CLIENT_SECRET"]);
  const production = await discoverPreliveResources({ ...syntheticCredentials, QF_ENV: "production" }, fetchImplementation);
  assert.equal(production.status, "refused");
  assert.equal(calls, 0);
});

test("resource bootstrap uses only documented prelive hosts and prints whitelisted catalog metadata", async () => {
  const calls: string[] = [];
  const result = await discoverPreliveResources(syntheticCredentials, async (input: RequestInfo | URL, init: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const headers = new Headers(init.headers);
    if (url.endsWith("/oauth2/token")) {
      assert.equal(headers.get("Authorization"), `Basic ${Buffer.from("synthetic-client:synthetic-secret").toString("base64")}`);
      assert.equal(String(init.body), "grant_type=client_credentials&scope=content");
      return json({ access_token: "synthetic-private-token" });
    }
    assert.equal(headers.get("x-auth-token"), "synthetic-private-token");
    assert.equal(headers.get("x-client-id"), "synthetic-client");
    if (url.includes("resources/translations")) return json({ translations: [
      { id: 90001, name: "Synthetic English", author_name: "Synthetic author", language_name: "english", private_extra: "excluded" },
      { id: 90002, name: "Synthetic other", author_name: "Synthetic author", language_name: "urdu" },
    ] });
    return json({ recitations: [{ id: 90003, reciter_name: "Synthetic reciter", style: null }] });
  });
  assert.equal(result.authentication, "succeeded");
  assert.equal(result.status, "catalogs-loaded");
  assert.deepEqual(calls, [
    "https://prelive-oauth2.quran.foundation/oauth2/token",
    "https://apis-prelive.quran.foundation/content/api/v4/resources/translations?language=en",
    "https://apis-prelive.quran.foundation/content/api/v4/resources/recitations?language=en",
  ]);
  assert.equal(result.translations.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|synthetic-private-token|excluded/);
});

test("resource bootstrap redacts error bodies and transport errors", async () => {
  const rejected = await discoverPreliveResources(syntheticCredentials, async () => json({ message: "synthetic-secret" }, 401));
  assert.equal(rejected.authentication, "failed");
  assert.equal(rejected.httpStatus, 401);
  assert.doesNotMatch(JSON.stringify(rejected), /synthetic-secret/);
  const failed = await discoverPreliveResources(syntheticCredentials, async () => { throw new Error("synthetic-secret"); });
  assert.equal(failed.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(failed), /synthetic-secret/);
});
