import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRemoteJWKSet } from "jose";
import { createApp } from "../src/app.js";
import { createJwtVerifier, createAuthFromEnv } from "../src/modules/auth/auth.js";
import { LearningRepository } from "../src/modules/learning/learning.repository.js";
import { createLearningPoolFromEnv, validateLearningDatabaseUrl } from "../src/modules/learning/learning.db.js";
import { disposableDatabase, testIdentityProvider, syntheticProvider, alice, bob } from "./support/learning-fixture.mjs";
import { migrateLearning, checkedLearningUrl } from "../scripts/learning-migrate.mjs";

let database: Awaited<ReturnType<typeof disposableDatabase>>;
let identity: Awaited<ReturnType<typeof testIdentityProvider>>;
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base: string;
let tokens: Record<string, string>;
let repository: LearningRepository;
before(async () => {
  database = await disposableDatabase();
  identity = await testIdentityProvider();
  repository = new LearningRepository(database.pool);
  tokens = { alice: await identity.token(alice), bob: await identity.token(bob) };
  const auth = createJwtVerifier(identity.issuer, createRemoteJWKSet(new URL(`${identity.issuer}/.well-known/jwks.json`)));
  server = createApp({ auth, learningRepository: repository, quranProvider: syntheticProvider }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await identity?.close(); await database?.close();
});
async function request(path: string, user = "alice", method = "GET", body?: unknown, overrideToken?: string) {
  const response = await fetch(`${base}/api${path}`, { method, headers: {
    ...(user ? { Authorization: `Bearer ${overrideToken ?? tokens[user]}` } : {}), "Content-Type": "application/json",
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, json: await response.json(), cache: response.headers.get("cache-control") };
}

test("learning database gates refuse original/remote databases and migration is repeatable", async () => {
  for (const address of ["postgresql://localhost/kalima", "postgresql://remote/kalima_learning_dev", "postgresql://localhost/kalima_learning_prod", "postgresql://localhost/kalima_learning_dev?host=remote", "postgresql://localhost/kalima_learning_dev#unexpected"]) {
    assert.throws(() => checkedLearningUrl(address)); assert.throws(() => validateLearningDatabaseUrl(address));
  }
  assert.deepEqual(await migrateLearning(database.connectionString), { status: "already-applied" });
  const columns = await database.pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='learning'");
  assert.ok(!columns.rows.some((row) => /arabic|translation|meaning|audio|token|password/.test(row.column_name)));
  assert.equal(createAuthFromEnv({}).configured, false);
  assert.equal(createLearningPoolFromEnv({ LEARNING_DATABASE_URL: "postgresql://localhost/kalima" }), undefined);
});

test("public reading stays public; learner endpoints require cryptographically valid identity", async () => {
  assert.equal((await request("/quran/surahs/1", "")).status, 200);
  assert.equal((await request("/learning/profile", "")).status, 401);
  for (const token of ["forged", await identity.token(alice, {}, { expiry: "-1h" }),
    await identity.token(alice, {}, { issuer: "https://wrong.example" }), await identity.token(alice, {}, { audience: "wrong" }),
    await identity.token(alice, { role: "service_role" }), await identity.token(alice, { is_anonymous: true }), await identity.token("not-a-uuid")]) {
    assert.equal((await request("/learning/profile", "alice", "GET", undefined, token)).status, 401);
  }
  const profile = await request("/learning/profile");
  assert.equal(profile.status, 200); assert.equal(profile.cache, "no-store");
  assert.equal((await request("/learning/profile", "alice", "PATCH", { displayName: "  Learner  " })).json.data.displayName, "Learner");
  assert.equal((await request("/learning/profile")).json.data.displayName, "Learner");
  assert.notEqual((await request("/learning/profile", "bob")).json.data.id, profile.json.data.id);
  const malformed = await fetch(`${base}/api/learning/bookmarks`, { method: "POST", headers: { Authorization: `Bearer ${tokens.alice}`, "Content-Type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 400);
  const otherIdentity = await testIdentityProvider();
  try { assert.equal((await request("/learning/profile", "alice", "GET", undefined, await otherIdentity.token(alice, {}, { issuer: identity.issuer }))).status, 401); }
  finally { await otherIdentity.close(); }
  const offlineAuth = createJwtVerifier(identity.issuer, createRemoteJWKSet(new URL("http://127.0.0.1:1/jwks")));
  await assert.rejects(() => offlineAuth.verify(tokens.alice), (error: unknown) => (error as { statusCode: number }).statusCode === 503);
});

test("bookmarks are verified, idempotent, bounded, and isolated between learners", async () => {
  const coordinate = { surah: 1, ayah: 1, word: 1 };
  assert.equal((await request("/learning/bookmarks", "alice", "POST", { ...coordinate, userId: bob })).status, 400);
  assert.equal((await request("/learning/bookmarks", "alice", "POST", { ...coordinate, word: 99 })).status, 422);
  assert.equal((await request("/learning/bookmarks", "alice", "POST", { ...coordinate, surah: 2 })).status, 400);
  const saved = await request("/learning/bookmarks", "alice", "POST", coordinate);
  const duplicate = await request("/learning/bookmarks", "alice", "POST", coordinate);
  assert.deepEqual(duplicate.json, saved.json);
  const list = (await request("/learning/bookmarks")).json.data;
  assert.equal(list.items.length, 1); assert.equal(list.items[0].sources[0].wordId, "9101");
  assert.equal(list.items[0].sources[0].environment, "prelive");
  assert.equal((await request("/learning/bookmarks", "bob")).json.data.items.length, 0);
  assert.equal((await request(`/learning/bookmarks/${saved.json.data.vocabularyId}`, "bob", "DELETE")).json.data.removed, false);
  assert.equal((await request("/learning/bookmarks")).json.data.items.length, 1);
  assert.equal((await request(`/learning/bookmarks/${saved.json.data.vocabularyId}`, "alice", "DELETE")).json.data.removed, true);
  assert.equal((await request("/learning/bookmarks")).json.data.items.length, 0);
});

test("resumable recall persists, serializes concurrent duplicate attempts, rejects stale and foreign submissions", async () => {
  const started = (await request("/learning/sessions", "alice", "POST", {})).json.data;
  assert.equal(started.items.length, 2, "missing meaning stays readable but is not a recall card");
  assert.deepEqual((await request("/learning/sessions", "alice", "POST", {})).json.data, started);
  const aliceProfile = (await request("/learning/profile")).json.data;
  const reloadedRepository = new LearningRepository(database.pool);
  assert.deepEqual(await reloadedRepository.currentSession(aliceProfile.id), started);
  const input = { clientAttemptId: crypto.randomUUID(), sessionId: started.id, vocabularyId: started.items[0].vocabularyId, rating: "good" };
  assert.equal((await request("/learning/attempts", "bob", "POST", input)).status, 404);
  assert.equal((await request("/learning/attempts", "alice", "POST", { ...input, vocabularyId: started.items[1].vocabularyId })).status, 409);
  assert.equal((await request("/learning/attempts", "alice", "POST", { ...input, rating: "correct" })).status, 400);
  const pair = await Promise.all([request("/learning/attempts", "alice", "POST", input), request("/learning/attempts", "alice", "POST", input)]);
  assert.equal(pair[0].status, 200); assert.deepEqual(pair[0].json, pair[1].json);
  assert.equal(pair[0].json.data.reviewCount, 1);
  assert.equal(Date.parse(pair[0].json.data.dueAt) - Date.parse(pair[0].json.data.reviewedAt), 600_000);
  assert.equal((await request("/learning/attempts", "alice", "POST", { ...input, rating: "easy" })).status, 409);
  assert.equal((await request("/learning/attempts", "alice", "POST", { ...input, clientAttemptId: crypto.randomUUID() })).status, 409);
  const current = (await request("/learning/sessions/current")).json.data;
  assert.equal(current.items[0].reviewed, true); assert.equal(current.items[1].reviewed, false);
  const second = await request("/learning/attempts", "alice", "POST", { ...input, clientAttemptId: crypto.randomUUID(), vocabularyId: current.items[1].vocabularyId, rating: "again" });
  assert.equal(second.status, 200); assert.equal(second.json.data.session.completed, true);
  assert.equal((await request("/learning/sessions/current")).json.data, null);
  const progress = (await request("/learning/progress")).json.data;
  assert.equal(progress.totalReviews, 2); assert.equal(progress.reviewedWords, 2); assert.equal(progress.dueWords, 0);
  assert.equal((await request("/learning/progress", "bob")).json.data.totalReviews, 0);
  const history = (await request("/learning/history")).json.data;
  assert.equal(history.items.length, 2); assert.equal((await request("/learning/history", "bob")).json.data.items.length, 0);
  assert.equal((await request(`/learning/history?cursor=${history.items[0].id}`, "bob")).json.data.items.length, 0);
  assert.equal((await request("/learning/sessions", "alice", "POST", { dueOnly: true })).json.data, null);
  // One due card is picked up without reintroducing cards whose due dates are in the future.
  await database.pool.query("UPDATE learning.vocabulary_progress SET due_at=now()-interval '1 second' WHERE user_id=$1 AND vocabulary_id=$2", [aliceProfile.id, input.vocabularyId]);
  const due = (await request("/learning/sessions", "alice", "POST", { dueOnly: true })).json.data;
  assert.equal(due.items.length, 1); assert.equal(due.items[0].vocabularyId, input.vocabularyId);
  const counts = await database.pool.query("SELECT count(*)::int AS n FROM learning.review_attempts");
  assert.equal(counts.rows[0].n, 2);
});

test("failed attempt insertion rolls back progress/session and permits safe retry", async () => {
  const active = (await request("/learning/sessions", "bob", "POST", {})).json.data;
  const input = { clientAttemptId: crypto.randomUUID(), sessionId: active.id, vocabularyId: active.items[0].vocabularyId, rating: "hard" };
  await database.pool.query(`CREATE FUNCTION learning.fail_attempt_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END; $$;
    CREATE TRIGGER fail_attempt BEFORE INSERT ON learning.review_attempts FOR EACH ROW EXECUTE FUNCTION learning.fail_attempt_test()`);
  try {
    assert.equal((await request("/learning/attempts", "bob", "POST", input)).status, 503);
    assert.equal((await request("/learning/progress", "bob")).json.data.totalReviews, 0);
    assert.equal((await request("/learning/progress", "bob")).json.data.items.length, 0);
    assert.equal((await request("/learning/sessions/current", "bob")).json.data.items[0].reviewed, false);
  } finally { await database.pool.query("DROP TRIGGER fail_attempt ON learning.review_attempts; DROP FUNCTION learning.fail_attempt_test()"); }
  assert.equal((await request("/learning/attempts", "bob", "POST", input)).status, 200);
  assert.equal((await request("/learning/progress", "bob")).json.data.totalReviews, 1);
});

test("unavailable auth/source/storage states are honest and preserve readable/saved data", async () => {
  const offlineProvider = { ...syntheticProvider, getSurah: async () => ({ status: "unavailable" as const, reason: "Synthetic outage", attribution: syntheticProvider.getStatus().attribution }) };
  const temporary = createApp({ learningRepository: repository, auth: createJwtVerifier(identity.issuer, createRemoteJWKSet(new URL(`${identity.issuer}/.well-known/jwks.json`))), quranProvider: offlineProvider }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => temporary.once("listening", resolve));
  const origin = `http://127.0.0.1:${(temporary.address() as { port: number }).port}`;
  try {
    const saved = await fetch(`${origin}/api/learning/progress`, { headers: { Authorization: `Bearer ${tokens.alice}` } });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).data.totalReviews, 2);
    const bookmark = await fetch(`${origin}/api/learning/bookmarks`, { method: "POST", headers: { Authorization: `Bearer ${tokens.alice}`, "Content-Type": "application/json" }, body: JSON.stringify({ surah: 1, ayah: 1, word: 1 }) });
    assert.equal(bookmark.status, 503);
    assert.equal((await (await fetch(`${origin}/api/quran/surahs/1`)).json()).data.status, "unavailable");
  } finally { await new Promise<void>((resolve) => temporary.close(() => resolve())); }
  await assert.rejects(() => createAuthFromEnv({}).verify(tokens.alice), (error: unknown) => (error as { statusCode: number }).statusCode === 503);
});
