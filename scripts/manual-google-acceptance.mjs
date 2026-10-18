import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";

// Live acceptance only. No browser automation, auth bypass, new app endpoints,
// persistent token files, identity overrides or changes to application routes.
export function createGoogleBrowserMonitor(auth, decodeJwt) {
  const verified = new Map(), users = new Map();
  let mutationObserver;
  return {
    users,
    setMutationObserver(observer) { mutationObserver = observer; },
    auth: { configured: auth.configured, async verify(token) {
      const identity = await auth.verify(token); // Real signature/claims first.
      const claims = decodeJwt(token);
      const google = (claims.app_metadata?.provider === "google" || claims.app_metadata?.providers?.includes("google")) &&
        claims.amr?.some((item) => item.method === "oauth");
      verified.set(token, { identity, google, session: claims.session_id });
      return identity;
    } },
    handle(app) { return (req, res) => {
      let raw = "";
      const originalPath = req.url?.split("?")[0];
      const learning = originalPath?.startsWith("/api/learning/");
      // Optional acceptance-only retry hook, armed for one user-authorized
      // cosmetic click. Only an already normally verified Google bearer qualifies.
      if (req.headers.origin === 'http://localhost:5173' && req.method === 'POST' && learning) {
        const proof = verified.get(req.headers.authorization?.slice(7));
        const user = proof?.google && [...users.values()].find(item => item.identity.subject === proof.identity.subject);
        if (user) mutationObserver?.(user, originalPath);
      }
      const end = res.end;
      if (learning) res.end = function(chunk, ...rest) {
        if (chunk && Buffer.byteLength(chunk) < 1_000_000) raw = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        return end.call(this, chunk, ...rest);
      };
      res.once("finish", () => {
        if (!learning || res.statusCode !== 200 || !res.locals?.profile?.id) return;
        const token = req.headers.authorization?.slice(7), proof = verified.get(token);
        if (!proof?.google) return;
        let body; try { body = JSON.parse(raw); } catch { return; }
        const id = res.locals.profile.id;
        let user = users.get(id);
        if (!user) {
          user = { id, identity: proof.identity, token, sessions: new Set(), tokens: new Set(), bookmarks: [], reviews: [],
            gameViews: new Set(), challengeIssues: [], challengeAnswers: [], cosmetics: [] };
          users.set(id, user); console.log("A real Google-linked Supabase OAuth identity passed the normal backend JWT verifier. No identity or token is logged.");
        }
        user.token = token; user.sessions.add(proof.session); user.tokens.add(token);
        if (req.headers.origin === 'http://localhost:5173' && req.method === 'GET' && originalPath.startsWith('/api/learning/game/')) user.gameViews.add(originalPath);
        // Node acceptance requests have no browser Origin, so retries below cannot
        // masquerade as a new learner-selected UI review.
        if (req.headers.origin === "http://localhost:5173" && req.method === "POST") {
          if (originalPath === "/api/learning/bookmarks") user.bookmarks.push(body.data);
          if (originalPath === "/api/learning/attempts" && !user.reviews.some((event) => event.saved.attemptId === body.data.attemptId))
            user.reviews.push({ input: { ...req.body }, saved: body.data });
          if (originalPath === '/api/learning/game/challenges') user.challengeIssues.push({ id: body.data.id,
            reference: body.data.reference, choiceIds: body.data.choices.map(choice => choice.id), sourceAttributed: body.data.attribution?.provider === 'Quran Foundation' });
          if (/^\/api\/learning\/game\/challenges\/[a-f0-9-]+\/answer$/.test(originalPath)) user.challengeAnswers.push({
            id: originalPath.split('/').at(-2), choiceId: req.body.choiceId, saved: body.data });
          if (originalPath.startsWith('/api/learning/game/cosmetics/')) user.cosmetics.push({ key: originalPath.split('/').at(-1) });
        }
      });
      app(req, res);
    }; },
  };
}

/** Read-only reconciliation when a real learning step returns during other checks. */
export async function auditNaturalDueFollowUp(pool, { userId, vocabularyId, attemptId, dueAt }) {
  const followUp = (await pool.query(`SELECT a.* FROM learning.review_attempts a JOIN learning.review_sessions s ON s.id=a.session_id
    WHERE a.user_id=$1 AND a.vocabulary_id=$2 AND a.id<>$3 AND s.kind='daily' AND a.reviewed_at>=$4
    ORDER BY a.reviewed_at,a.id LIMIT 1`, [userId, vocabularyId, attemptId, dueAt])).rows[0];
  if (followUp?.memory_before?.due !== dueAt) return { verified: false };
  const scheduler = await import("../server/dist/modules/learning/learning.scheduler.js");
  const expected = scheduler.scheduleCard(scheduler.restoreCard(followUp.memory_before), followUp.rating, followUp.reviewed_at);
  if (!isDeepStrictEqual(scheduler.serializeCard(expected.card), followUp.memory_after) ||
    !isDeepStrictEqual(scheduler.serializeLog(expected.log), followUp.scheduler_log) ||
    !isDeepStrictEqual(scheduler.SCHEDULER_PARAMETERS, followUp.scheduler_parameters)) throw new Error("Natural follow-up FSRS audit failed; private values suppressed");
  return { verified: true, rating: followUp.rating, reviewedAtOrAfterOriginalDue: true, storedFsrsCorrect: true };
}

export async function runManualGoogleAcceptance({ monitor, pool, apiOrigin, report, check, setStage, resumePrimary = false }) {
  const lines = createInterface({ input: process.stdin });
  const confirmations = new Set();
  lines.on("line", (line) => { if (["primary-done", "recovery-done", "finish"].includes(line.trim())) confirmations.add(line.trim()); });
  async function wait(predicate, message, timeout = 1_200_000) {
    const until = Date.now() + timeout;
    while (!predicate()) { check(Date.now() < until, message); await new Promise((done) => setTimeout(done, 250)); }
  }
  async function request(user, path, method = "GET", body) {
    const response = await fetch(`${apiOrigin}/api/learning${path}`, { method,
      headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
    return { status: response.status, body: await response.json() };
  }
  async function data(user, path) {
    const response = await request(user, path); check(response.status === 200, "A real authenticated acceptance read failed."); return response.body.data;
  }
  async function oldEvents(user) { return (await pool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 ORDER BY id", [user.id])).rows; }
  async function preserved(user, before) {
    const retained = (await pool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id", [user.id, before.map((event) => event.id)])).rows;
    check(isDeepStrictEqual(retained, before), "Pre-existing learner events changed.");
  }
  const scheduler = await import("../server/dist/modules/learning/learning.scheduler.js");
  async function audit(user, attempt) {
    const { input, saved } = attempt;
    const event = (await pool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 AND id=$2", [user.id, saved.attemptId])).rows[0];
    const progress = (await pool.query("SELECT * FROM learning.vocabulary_progress WHERE user_id=$1 AND vocabulary_id=$2", [user.id, input.vocabularyId])).rows[0];
    check(event && event.rating === input.rating && event.expected_revision === input.expectedRevision, "The real UI rating/revision did not match its event.");
    const next = scheduler.scheduleCard(scheduler.restoreCard(event.memory_before), input.rating, event.reviewed_at);
    check(isDeepStrictEqual(event.memory_after, scheduler.serializeCard(next.card)) && isDeepStrictEqual(event.scheduler_log, scheduler.serializeLog(next.log)) &&
      isDeepStrictEqual(event.scheduler_parameters, scheduler.SCHEDULER_PARAMETERS) && event.scheduler_version === scheduler.SCHEDULER_VERSION &&
      progress.due_at.toISOString() === saved.dueAt && next.card.due.toISOString() === saved.dueAt && progress.revision === input.expectedRevision + 1,
    "Real FSRS memory, schedule or audit data did not commit correctly.");
    const before = (await data(user, "/progress")).totalReviews;
    const duplicates = await Promise.all([request(user, "/attempts", "POST", input), request(user, "/attempts", "POST", input)]);
    check(duplicates.every((row) => row.status === 200 && isDeepStrictEqual(row.body.data, saved)), "Exact retries were not idempotent.");
    check((await request(user, "/attempts", "POST", { ...input, clientAttemptId: randomUUID() })).status === 409, "A stale review was accepted.");
    check((await request(user, "/attempts", "POST", { ...input, rating: input.rating === "again" ? "good" : "again" })).status === 409, "A conflicting retry was accepted.");
    check((await data(user, "/progress")).totalReviews === before, "Retries added review events.");
    check((await data(user, "/history")).items.some((row) => row.id === saved.attemptId && row.rating === input.rating), "The review was absent from authenticated history.");
    check((await pool.query("SELECT kind FROM learning.review_sessions WHERE id=$1 AND user_id=$2", [input.sessionId, user.id])).rows[0]?.kind === "daily", "The observed review was not a daily session.");
    console.log(`Genuine learner-selected ${input.rating} review verified, including FSRS and duplicate/stale rejection. Interval: ${Math.round((Date.parse(saved.dueAt) - Date.parse(saved.reviewedAt)) / 1000)} seconds.`);
  }
  async function publicReading() {
    const response = await fetch(`${apiOrigin}/api/quran/surahs/1`, { signal: AbortSignal.timeout(30_000) });
    const body = await response.json(); check(response.status === 200 && body.data?.status === "ready" && body.data.surah.verses.length === 7, "Authentic public Al-Fatihah was unavailable.");
  }
  try {
    await publicReading(); report.publicReading = "passed-anonymously-seven-ayahs";
    report.browserMode = "regular-Chrome-user-controlled-no-automation";
    setStage("manual-primary-Google-login");
    console.log("REGULAR CHROME READY: open http://localhost:5173/account in normal Chrome. If already signed in, sign out first. Sign in with the PRIMARY Google account privately.");
    await wait(() => monitor.users.size > 0, "No genuine Google OAuth learner reached the backend.");
    const primary = [...monitor.users.values()][0], primaryOld = await oldEvents(primary);
    report.hostedLogin = "real-Google-OAuth-JWT-accepted";
    report.jwt = "normal-signature-issuer-audience-expiry-role-UUID-verifier-passed";
    const firstSessionCount = primary.sessions.size;
    if (resumePrimary) {
      // Explicit recovery after a checker interruption: inspect, never insert or
      // invent, the actual recent daily event the learner already confirmed.
      const event = (await pool.query(`SELECT a.* FROM learning.review_attempts a JOIN learning.review_sessions s ON s.id=a.session_id
        WHERE a.user_id=$1 AND s.kind='daily' AND a.scheduler_version=$2 AND a.reviewed_at>now()-interval '1 hour'
        ORDER BY a.reviewed_at DESC,a.id DESC LIMIT 1`, [primary.id, scheduler.SCHEDULER_VERSION])).rows[0];
      const bookmark = (await pool.query("SELECT vocabulary_id FROM learning.bookmarks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [primary.id])).rows[0];
      check(event && bookmark, "No recent real primary review/bookmark exists to resume; no data was invented.");
      primary.reviews.push({ input: { clientAttemptId: event.client_attempt_id, sessionId: event.session_id,
        vocabularyId: event.vocabulary_id, rating: event.rating, expectedRevision: event.expected_revision }, saved: event.result });
      primary.bookmarks.push({ vocabularyId: bookmark.vocabulary_id });
      report.resume = "read-only-audit-of-user-confirmed-recent-real-review-after-checker-fix";
    }
    if (!resumePrimary) console.log("PRIMARY LEARNING: bookmark an authentic unreviewed Al-Fatihah word. Open Reviews, Learn saved words, reveal and choose an HONEST rating. Do not select a rating to shorten this test.");
    setStage("manual-primary-daily-review");
    await wait(() => primary.bookmarks.length && primary.reviews.length, "The primary learner did not bookmark and complete a real daily review.");
    const first = primary.reviews[0]; await audit(primary, first);
    const bookmark = primary.bookmarks.at(-1);
    check((await data(primary, "/bookmarks")).items.some((row) => row.vocabularyId === bookmark.vocabularyId && row.sources?.some((source) => source.environment === "prelive")), "Authentic prelive bookmark attribution was missing.");
    const queue = await data(primary, "/review-sessions/current");
    const future = queue?.items.find((item) => item.vocabularyId === first.input.vocabularyId && !item.reviewed);
    report.earlyDue = "future-review-excluded-or-completed";
    if (future && Date.parse(future.availableAt) > Date.now() + 15_000) {
      check((await request(primary, `/review-sessions/preview?sessionId=${queue.id}&vocabularyId=${future.vocabularyId}`)).status === 409 &&
        (await request(primary, "/attempts", "POST", { ...first.input, clientAttemptId: randomUUID(), expectedRevision: future.revision })).status === 409, "A future-due card was available early.");
      report.earlyDue = "preview-and-current-revision-grade-rejected-before-real-due";
    }
    const tokensBefore = primary.tokens.size;
    console.log("PRIMARY CONTROLS: reload Reviews and check saved progress. On Account > Session controls click Refresh sign-in session, then Sign out and confirm Reviews shows sign-in. Tell the assistant when complete; no private values. Confirmation command: primary-done.");
    setStage("manual-reload-refresh-signout-confirmation");
    await wait(() => confirmations.has("primary-done"), "Primary reload/sign-out UI confirmation was not received.");
    check(primary.tokens.size > tokensBefore, "A refreshed real Supabase access token was not observed.");
    report.refresh = "new-hosted-token-accepted-for-same-identity";
    report.restoration = "user-confirmed-reload-with-server-persistence-verified";
    console.log("RECOVERY: open a NEW INCOGNITO Chrome window at http://localhost:5173/account. Sign in with the SAME primary Google account. Check Reviews/history/bookmark recovery, then tell the assistant. Confirmation command: recovery-done.");
    setStage("manual-independent-primary-Google-login");
    await wait(() => primary.sessions.size > firstSessionCount && confirmations.has("recovery-done"), "Independent primary Google sign-in/recovery was not confirmed.");
    check((await data(primary, "/history")).items.some((row) => row.id === first.saved.attemptId) &&
      (await data(primary, "/bookmarks")).items.some((row) => row.vocabularyId === bookmark.vocabularyId), "The fresh Supabase session did not recover learning.");
    report.crossDevice = "distinct-hosted-session-plus-user-confirmed-independent-incognito-context";
    report.naturalDue = "not-observed-no-clock-override";
    if (future && Date.now() >= Date.parse(future.availableAt) &&
      (await request(primary, `/review-sessions/preview?sessionId=${queue.id}&vocabularyId=${future.vocabularyId}`)).status === 200)
      report.naturalDue = "real-clock-due-card-now-available";
    console.log("SECOND LEARNER: keep primary signed in INCOGNITO. In the signed-out REGULAR window, sign in with the DIFFERENT approved Google account. Bookmark another authentic word, start Reviews and submit an honest rating.");
    setStage("manual-second-real-Google-learner");
    await wait(() => monitor.users.size >= 2, "A distinct second real Google learner did not sign in.");
    const other = [...monitor.users.values()].find((user) => user.id !== primary.id), otherOld = await oldEvents(other);
    check(other.identity.subject !== primary.identity.subject, "Two-user isolation requires different verified Supabase subjects.");
    await wait(() => other.bookmarks.length && other.reviews.length, "The second learner did not save a real bookmark and daily review.");
    await audit(other, other.reviews[0]);
    for (const [user, foreign] of [[primary, other.reviews[0]], [other, first]]) {
      const progress = await data(user, "/progress");
      const count = (await pool.query("SELECT count(*)::int AS count FROM learning.review_attempts WHERE user_id=$1", [user.id])).rows[0].count;
      const history = (await pool.query("SELECT id FROM learning.review_attempts WHERE user_id=$1 ORDER BY reviewed_at DESC,id DESC LIMIT 50", [user.id])).rows.map((row) => row.id);
      check(progress.totalReviews === count && isDeepStrictEqual((await data(user, "/history")).items.map((row) => row.id), history), "Foreign history or progress totals leaked.");
      for (const [path, table, items] of [["/bookmarks", "bookmarks", null], ["/progress", "vocabulary_progress", progress.items]]) {
        const ownIds = (await pool.query(`SELECT vocabulary_id FROM learning.${table} WHERE user_id=$1`, [user.id])).rows.map((row) => row.vocabulary_id).sort();
        check(isDeepStrictEqual((items ?? (await data(user, path)).items).map((row) => row.vocabularyId).sort(), ownIds), "Foreign bookmark/progress records leaked.");
      }
      for (const path of ["/sessions/current", "/review-sessions/current"]) {
        const session = await data(user, path);
        if (session) check((await pool.query("SELECT user_id FROM learning.review_sessions WHERE id=$1", [session.id])).rows[0]?.user_id === user.id, "Foreign session leaked.");
      }
      for (const [path, method, body] of [[`/review-sessions/preview?sessionId=${foreign.input.sessionId}&vocabularyId=${foreign.input.vocabularyId}`, "GET"],
        ["/attempts", "POST", { ...foreign.input, clientAttemptId: randomUUID() }],
        ["/review-sessions/skip", "POST", { sessionId: foreign.input.sessionId, vocabularyId: foreign.input.vocabularyId, expectedRevision: 0 }]])
        check((await request(user, path, method, body)).status === 404, "Foreign session access/modification was not rejected.");
      check((await data(user, `/history?cursor=${foreign.saved.attemptId}`)).items.length === 0 && (await data(user, "/progress")).totalReviews === count, "Foreign cursor leaked data or rejected writes changed history.");
    }
    await preserved(primary, primaryOld); await preserved(other, otherOld);
    report.userIsolation = "passed-both-directions-two-real-Google-accounts-with-persisted-activity";
    report.learning = "real-bookmarks-FSRS-history-due-schedules-and-idempotency-verified";
    console.log("LIVE ISOLATION PASSED. Sign out of BOTH Kalima contexts and verify public Quran reading/private Reviews sign-in states. Tell the assistant when complete. Confirmation command: finish.");
    setStage("manual-final-signout-confirmation");
    await wait(() => confirmations.has("finish"), "Final sign-out UI confirmation was not received.");
    // Reassess at the end: a natural return may occur while the second learner
    // is being checked, after the earlier recovery checkpoint.
    const followUp = await auditNaturalDueFollowUp(pool, { userId: primary.id, vocabularyId: first.input.vocabularyId,
      attemptId: first.saved.attemptId, dueAt: first.saved.dueAt });
    if (followUp.verified) {
      report.naturalDue = "real-daily-follow-up-accepted-at-or-after-original-due-FSRS-audited";
    }
    await publicReading(); report.signOut = "user-confirmed-both-contexts-public-reading-verified-anonymously";
    report.status = report.naturalDue.startsWith("not-") ? "passed-with-unperformed-natural-due-observation" : "passed";
    report.note = "Regular browser UI steps explicitly user-confirmed, not automated. Real JWT/API/DB evidence; no auth bypass or clock override. Activity retained. Original database blocked; no migrations/deployment.";
  } finally { lines.close(); monitor.users.clear(); }
}
