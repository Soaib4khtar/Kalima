import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createRemoteJWKSet } from "jose";
import { createApp } from "../src/app.js";
import { createJwtVerifier } from "../src/modules/auth/auth.js";
import { LearningRepository } from "../src/modules/learning/learning.repository.js";
import { SCHEDULER_VERSION } from "../src/modules/learning/learning.scheduler.js";
import { disposableDatabase, testIdentityProvider, syntheticProvider } from "./support/learning-fixture.mjs";
import { migrateLearning } from "../scripts/learning-migrate.mjs";

let database: Awaited<ReturnType<typeof disposableDatabase>>;
let identity: Awaited<ReturnType<typeof testIdentityProvider>>;
let repository: LearningRepository;
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base: string;
let time = new Date("2026-10-17T12:00:00Z");
const refs = [1, 2].map((word) => ({ surah: 1 as const, ayah: 1, word, sourceWordId: String(9100 + word), sourceVerseId: "9001", environment: "prelive" as const }));
before(async () => {
  database = await disposableDatabase(); identity = await testIdentityProvider();
  repository = new LearningRepository(database.pool, () => new Date(time));
  server = createApp({ learningRepository: repository, quranProvider: syntheticProvider,
    auth: createJwtVerifier(identity.issuer, createRemoteJWKSet(new URL(`${identity.issuer}/.well-known/jwks.json`))) }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/learning`;
});
after(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); await identity?.close(); await database?.close(); });
async function learner() { const subject = randomUUID(); const profile = await repository.profile({ issuer: identity.issuer, subject }); return { ...profile, token: await identity.token(subject) }; }
async function api(token: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

test("daily inbox requires authentication, distinguishes saved/new/scheduled words, and persists timezone", async () => {
  const user = await learner();
  assert.equal((await api("invalid", "/reviews/inbox")).status, 401);
  assert.equal((await api(user.token, "/profile", "PATCH", { timezone: "not/a/timezone" })).status, 400);
  assert.equal((await api(user.token, "/profile", "PATCH", { timezone: "Asia/Kolkata", userId: randomUUID() })).status, 400);
  assert.equal((await api(user.token, "/profile", "PATCH", { timezone: "Asia/Kolkata" })).body.data.timezone, "Asia/Kolkata");
  await repository.bookmark(user.id, refs[0]);
  const inbox = (await api(user.token, "/reviews/inbox")).body.data;
  assert.equal(inbox.timezone, "Asia/Kolkata"); assert.equal(inbox.newWords, 1); assert.equal(inbox.dueNow, 0);
  assert.equal(inbox.localDate, "2026-10-17");
  assert.equal((await api(user.token, "/review-sessions", "POST", {})).body.data.session, null);
  const daily = (await api(user.token, "/review-sessions", "POST", { includeNew: true })).body.data.session;
  assert.equal(daily.kind, "daily"); assert.equal(daily.items.length, 1);
  const stranger = await learner();
  assert.equal((await api(stranger.token, "/reviews/inbox")).body.data.items.length, 0);
  assert.equal((await api(stranger.token, `/review-sessions/preview?sessionId=${daily.id}&vocabularyId=${daily.items[0].vocabularyId}`)).status, 404);
  assert.equal((await api(stranger.token, "/attempts", "POST", { clientAttemptId: randomUUID(), sessionId: daily.id, vocabularyId: daily.items[0].vocabularyId, rating: "good", expectedRevision: 0 })).status, 404);
});

test("daily Again waits, resumes, repeats safely, graduates, and stores auditable FSRS events", async () => {
  time = new Date("2026-10-17T12:00:00Z"); const user = await learner();
  await repository.bookmark(user.id, refs[0]);
  const started = (await repository.startDaily(user.id, refs, true)).session!;
  const item = started.items[0];
  const input = { clientAttemptId: randomUUID(), sessionId: started.id, vocabularyId: item.vocabularyId, rating: "again", expectedRevision: 0 };
  assert.equal((await api(user.token, "/attempts", "POST", { ...input, expectedRevision: undefined })).status, 400);
  const pair = await Promise.all([api(user.token, "/attempts", "POST", input), api(user.token, "/attempts", "POST", input)]);
  assert.equal(pair[0].status, 200); assert.deepEqual(pair[0].body, pair[1].body);
  assert.equal(pair[0].body.data.session.completed, false);
  assert.equal(pair[0].body.data.session.items[0].revision, 1);
  assert.equal(pair[0].body.data.dueAt, "2026-10-17T12:01:00.000Z");
  assert.equal((await api(user.token, "/attempts", "POST", { ...input, expectedRevision: 1 })).status, 409, "an idempotency key cannot change its expected revision");
  assert.equal((await api(user.token, "/attempts", "POST", { ...input, clientAttemptId: randomUUID(), reviewedAt: "2099-01-01T00:00Z" })).status, 400);
  const wait = await api(user.token, "/reviews/inbox"); assert.equal(wait.body.data.dueNow, 0); assert.equal(wait.body.data.laterToday, 1);
  assert.equal((await api(user.token, "/attempts", "POST", { ...input, clientAttemptId: randomUUID(), expectedRevision: 1 })).status, 409);
  assert.equal((await api(user.token, "/review-sessions/current")).body.data.items[0].reviewed, false);
  time = new Date("2026-10-17T12:01:00Z");
  const preview = (await api(user.token, `/review-sessions/preview?sessionId=${started.id}&vocabularyId=${item.vocabularyId}`)).body.data;
  assert.equal(preview.revision, 1); assert.ok(preview.ratings.easy.dueAt);
  const next = { ...input, clientAttemptId: randomUUID(), expectedRevision: 1, rating: "easy" };
  const concurrent = await Promise.all([api(user.token, "/attempts", "POST", next), api(user.token, "/attempts", "POST", { ...next, clientAttemptId: randomUUID() })]);
  assert.deepEqual(concurrent.map((entry) => entry.status).sort(), [200, 409]);
  const progress = (await api(user.token, "/progress")).body.data;
  assert.equal(progress.totalReviews, 2); assert.equal(progress.items[0].revision, 2);
  assert.equal(progress.items[0].schedulerVersion, SCHEDULER_VERSION);
  assert.equal((await repository.currentSession(user.id, "daily")), null);
  assert.equal((await api(user.token, "/history")).body.data.items.length, 2);
  const records = await database.pool.query("SELECT memory_before,memory_after,scheduler_log,scheduler_parameters FROM learning.review_attempts WHERE user_id=$1", [user.id]);
  assert.ok(records.rows.every((row) => row.memory_before && row.memory_after && row.scheduler_log && row.scheduler_parameters.request_retention === 0.9));
});

test("timezone boundaries use actual IANA civil days across DST and exact midnight", async () => {
  for (const [now, hours] of [["2026-03-08T12:00:00Z", 23], ["2026-11-01T12:00:00Z", 25]] as const) {
    const bounds = await repository.dayBounds(database.pool, "America/New_York", new Date(now));
    assert.equal((bounds.endAt.getTime() - bounds.startAt.getTime()) / 3600_000, hours);
  }
  const before = await repository.dayBounds(database.pool, "Asia/Kolkata", new Date("2026-10-17T18:29:59Z"));
  const after = await repository.dayBounds(database.pool, "Asia/Kolkata", new Date("2026-10-17T18:30:00Z"));
  assert.equal(before.localDate, "2026-10-17"); assert.equal(after.localDate, "2026-10-18"); assert.equal(before.endAt.getTime(), after.startAt.getTime());
  const user = await learner(); await repository.updateProfile(user.id, undefined, "Asia/Kolkata");
  time = new Date("2026-10-17T18:29:59Z");
  const practice = await repository.startSession(user.id, refs, false);
  await repository.attempt(user.id, { clientAttemptId: randomUUID(), sessionId: practice!.id, vocabularyId: practice!.items[0].vocabularyId, rating: "again" });
  assert.equal((await repository.inbox(user.id)).reviewedToday.attempts, 1);
  assert.equal((await repository.inbox(user.id)).laterToday, 0, "a post-midnight learning card is not in the previous civil day");
  time = new Date("2026-10-17T18:30:00Z");
  assert.equal((await repository.inbox(user.id)).reviewedToday.attempts, 0);
  assert.equal((await repository.inbox(user.id)).laterToday, 1);
  time = new Date("2026-10-17T18:31:00Z"); assert.equal((await repository.inbox(user.id)).dueNow, 1);
});

test("cross-session revisions reject stale submissions and missing meanings can be left due", async () => {
  time = new Date("2026-10-17T12:00:00Z"); const user = await learner(); await repository.bookmark(user.id, refs[0]);
  const daily = (await repository.startDaily(user.id, refs, true)).session!;
  const practice = await repository.startSession(user.id, refs, false);
  await repository.attempt(user.id, { clientAttemptId: randomUUID(), sessionId: practice!.id, vocabularyId: daily.items[0].vocabularyId, rating: "again" });
  assert.equal((await api(user.token, "/attempts", "POST", { clientAttemptId: randomUUID(), sessionId: daily.id, vocabularyId: daily.items[0].vocabularyId, expectedRevision: 0, rating: "easy" })).status, 409);
  const resumed = await repository.currentSession(user.id, "daily"); assert.equal(resumed!.items[0].revision, 1);
  time = new Date("2026-10-17T12:01:00Z");
  const skipped = await repository.skipDaily(user.id, daily.id, daily.items[0].vocabularyId, 1);
  assert.equal(skipped!.completed, true); assert.equal(skipped!.items[0].skipped, true);
  assert.equal((await repository.inbox(user.id)).dueNow, 1, "skip never advances the schedule");
  assert.equal((await repository.progress(user.id)).totalReviews, 1);
  const unavailable = await repository.startDaily(user.id, [], false); assert.equal(unavailable.session, null); assert.equal(unavailable.unavailableWords, 1);
});

test("migration upgrades seeded starter activity without changing due dates, history, bookmarks or sessions", async () => {
  const old = await disposableDatabase({ throughVersion: 1 });
  try {
    const user = randomUUID(), vocabulary = randomUUID(), session = randomUUID(), attempt = randomUUID();
    await old.pool.query("INSERT INTO learning.profiles(id,auth_issuer,auth_subject) VALUES($1,'synthetic-upgrade-test',$2)", [user, randomUUID()]);
    await old.pool.query("INSERT INTO learning.word_occurrences VALUES(1,1,1)");
    await old.pool.query("INSERT INTO learning.vocabulary_items(id,identity_kind,surah,ayah,word) VALUES($1,'occurrence',1,1,1)", [vocabulary]);
    await old.pool.query("INSERT INTO learning.bookmarks(user_id,vocabulary_id) VALUES($1,$2)", [user, vocabulary]);
    await old.pool.query("INSERT INTO learning.review_sessions(id,user_id,surah) VALUES($1,$2,1)", [session, user]);
    await old.pool.query("INSERT INTO learning.session_items(session_id,vocabulary_id,ordinal) VALUES($1,$2,0)", [session, vocabulary]);
    await old.pool.query("INSERT INTO learning.vocabulary_progress(user_id,vocabulary_id,review_count,last_rating,last_reviewed_at,due_at,interval_seconds) VALUES($1,$2,1,'good','2026-10-16T12:00Z','2026-10-25T12:00Z',777600)", [user, vocabulary]);
    await old.pool.query("INSERT INTO learning.review_attempts(id,user_id,client_attempt_id,session_id,vocabulary_id,rating,scheduler_version,result,reviewed_at) VALUES($1,$2,$3,$4,$5,'good','starter-v1','{\"immutable\":true}','2026-10-16T12:00Z')", [attempt, user, randomUUID(), session, vocabulary]);
    const before = await old.pool.query("SELECT due_at,review_count,scheduler_version FROM learning.vocabulary_progress");
    assert.deepEqual(await migrateLearning(old.connectionString), { status: "applied", versions: [2] });
    assert.deepEqual((await old.pool.query("SELECT due_at,review_count,scheduler_version FROM learning.vocabulary_progress")).rows, before.rows);
    assert.equal((await old.pool.query("SELECT fsrs_card FROM learning.vocabulary_progress")).rows[0].fsrs_card, null);
    assert.deepEqual((await old.pool.query("SELECT result FROM learning.review_attempts WHERE id=$1", [attempt])).rows[0].result, { immutable: true });
    const upgraded = new LearningRepository(old.pool, () => new Date("2026-10-25T12:00:00Z"));
    assert.equal((await upgraded.bookmarks(user)).items.length, 1); assert.equal((await upgraded.currentSession(user))!.id, session);
    const daily = (await upgraded.startDaily(user, refs, false)).session!;
    const event = await upgraded.attempt(user, { clientAttemptId: randomUUID(), sessionId: daily.id, vocabularyId: vocabulary, rating: "good", expectedRevision: 0 });
    assert.equal(event.reviewCount, 2); assert.equal(event.schedulerVersion, SCHEDULER_VERSION);
    assert.equal((await upgraded.history(user)).items.length, 2);
    assert.equal((await old.pool.query("SELECT scheduler_version FROM learning.review_attempts WHERE id=$1", [attempt])).rows[0].scheduler_version, "starter-v1");
    assert.deepEqual(await migrateLearning(old.connectionString), { status: "already-applied" });
  } finally { await old.close(); }
});

test("failed daily review transaction rolls back memory, revision, queue position and audit event", async () => {
  time = new Date("2026-10-17T12:00:00Z"); const user = await learner(); await repository.bookmark(user.id, refs[0]);
  const daily = (await repository.startDaily(user.id, refs, true)).session!;
  const input = { clientAttemptId: randomUUID(), sessionId: daily.id, vocabularyId: daily.items[0].vocabularyId, expectedRevision: 0, rating: "easy" };
  await database.pool.query(`CREATE FUNCTION learning.fail_daily_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic daily failure'; END; $$;
    CREATE TRIGGER fail_daily BEFORE INSERT ON learning.review_attempts FOR EACH ROW EXECUTE FUNCTION learning.fail_daily_test()`);
  try {
    assert.equal((await api(user.token, "/attempts", "POST", input)).status, 503);
    assert.equal((await repository.progress(user.id)).items.length, 0);
    const current = (await repository.currentSession(user.id, "daily"))!;
    assert.equal(current.id, daily.id); assert.equal(current.items[0].revision, 0); assert.equal(current.items[0].reviewEvents, 0); assert.equal(current.items[0].reviewed, false);
    assert.equal((await repository.history(user.id)).items.length, 0);
  } finally { await database.pool.query("DROP TRIGGER fail_daily ON learning.review_attempts; DROP FUNCTION learning.fail_daily_test()"); }
  assert.equal((await api(user.token, "/attempts", "POST", input)).status, 200);
  assert.equal((await repository.progress(user.id)).totalReviews, 1);
});
