import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";

// Invoked only by the opt-in, development-gated hosted acceptance command.
// Normal application auth, provider, repository and wall clock are used. Nothing
// requests email automatically or supplies a learner's rating on their behalf.
export async function runDailyReviewAcceptance({ args, page, ready, base, report, learningPool, newPage,
  getSession, privateApi, manualLogin, google = false, auth, requireCheck: check, setStage }) {
  report.dailyReviews = { bookmark: "not-tested", schedule: "not-tested", history: "not-tested",
    duplicates: "not-tested", stale: "not-tested", earlyRejection: "not-tested", naturalDue: "not-tested",
    sessionRecovery: "not-tested", previousActivity: "not-tested" };
  const result = report.dailyReviews;
  const { restoreCard, scheduleCard, serializeCard, serializeLog, SCHEDULER_PARAMETERS, SCHEDULER_VERSION } =
    await import("../server/dist/modules/learning/learning.scheduler.js");
  const coordinate = (item) => `${item.surah ?? 1}:${item.ayah ?? item.reference?.ayah}:${item.word ?? item.position}`;
  const stableSession = (session) => { if (!session) return null; const { serverNow: _clock, ...stable } = session; return stable; };
  async function data(current, path, method = "GET", body) {
    const response = await privateApi(current, path, method, body);
    check(response.status === 200 && response.body.success, "An authenticated daily-review request failed.");
    return response.body.data;
  }
  async function signOut(current) {
    await current.goto(`${base}/account`);
    await current.getByRole("button", { name: "Sign out", exact: true }).click();
    await current.getByRole("heading", { name: "Save your learning", exact: true }).waitFor();
    check(!(await getSession(current)), "Sign-out retained the browser session.");
    await current.goto(`${base}/reviews`);
    await current.getByRole("link", { name: "Sign in for daily reviews", exact: true }).waitFor();
    check(await current.getByRole("region", { name: "Daily recall session" }).count() === 0, "Private review UI remained after sign-out.");
  }
  async function userReview(current, label, owner = learner) {
    const card = current.getByRole("region", { name: "Daily recall session", exact: true });
    await card.getByRole("button", { name: "Reveal meaning", exact: true }).waitFor({ timeout: 30_000 });
    console.log(`${label}: in the browser, recall the word, reveal its meaning, and choose your HONEST rating. Do not choose a rating just to shorten the test. You have 8 minutes.`);
    const response = await current.waitForResponse((response) => response.url().endsWith("/api/learning/attempts") &&
      response.request().method() === "POST" && response.status() === 200, { timeout: 480_000 });
    const input = response.request().postDataJSON(), saved = (await response.json()).data;
    check(["again", "hard", "good", "easy"].includes(input.rating), "Review rating was invalid.");
    const event = (await learningPool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 AND id=$2", [owner.profile.id, saved.attemptId])).rows[0];
    const progress = (await learningPool.query("SELECT * FROM learning.vocabulary_progress WHERE user_id=$1 AND vocabulary_id=$2", [owner.profile.id, input.vocabularyId])).rows[0];
    check(event && event.rating === input.rating && event.expected_revision === input.expectedRevision &&
      event.client_attempt_id === input.clientAttemptId && event.session_id === input.sessionId, "Stored event differs from the actual browser submission.");
    const scheduled = scheduleCard(restoreCard(event.memory_before), input.rating, event.reviewed_at);
    check(isDeepStrictEqual(event.memory_after, serializeCard(scheduled.card)) &&
      isDeepStrictEqual(event.scheduler_log, serializeLog(scheduled.log)) &&
      isDeepStrictEqual(event.scheduler_parameters, SCHEDULER_PARAMETERS) && event.scheduler_version === SCHEDULER_VERSION,
    "Persisted FSRS state or audit parameters do not match the real review.");
    check(progress.last_rating === input.rating && progress.due_at.toISOString() === saved.dueAt &&
      scheduled.card.due.toISOString() === saved.dueAt && isDeepStrictEqual(progress.fsrs_card, event.memory_after) &&
      progress.revision === input.expectedRevision + 1 && progress.review_count === saved.reviewCount,
    "Schedule, revision or review count did not commit with the event.");
    check((await data(current, "/history")).items.some((item) => item.id === saved.attemptId && item.rating === input.rating), "Saved review is absent from the authenticated history.");
    result.schedule = "verified-against-FSRS-at-real-server-time"; result.history = "verified-in-API-and-database";
    result.ratings = [...(result.ratings ?? []), input.rating];
    result.lastIntervalSeconds = Math.round((Date.parse(saved.dueAt) - Date.parse(saved.reviewedAt)) / 1000);
    console.log(`Real ${input.rating} review committed; FSRS, history and due interval verified (${result.lastIntervalSeconds} seconds).`);
    return { input, saved };
  }
  async function rejectedRetries(current, attempt, owner = learner) {
    const before = (await data(current, "/progress")).totalReviews;
    const duplicates = await Promise.all([privateApi(current, "/attempts", "POST", attempt.input), privateApi(current, "/attempts", "POST", attempt.input)]);
    check(duplicates.every((response) => response.status === 200 && isDeepStrictEqual(response.body.data, attempt.saved)), "Identical retries did not return the immutable original result.");
    const stale = await privateApi(current, "/attempts", "POST", { ...attempt.input, clientAttemptId: randomUUID() });
    const conflict = await privateApi(current, "/attempts", "POST", { ...attempt.input, rating: attempt.input.rating === "again" ? "good" : "again" });
    check(stale.status === 409 && conflict.status === 409, "A stale or conflicting review was accepted.");
    check((await data(current, "/progress")).totalReviews === before, "Retries created extra review events.");
    check((await learningPool.query("SELECT count(*)::int AS count FROM learning.review_attempts WHERE user_id=$1 AND client_attempt_id=$2", [owner.profile.id, attempt.input.clientAttemptId])).rows[0].count === 1,
      "The idempotency key created more than one event.");
    result.duplicates = "two-concurrent-retries-no-extra-event"; result.stale = "stale-revision-and-conflicting-ID-rejected";
  }
  setStage("daily-primary-hosted-login");
  const learner = await manualLogin(page, "Daily reviews: first learner");
  report.hostedLogin = google ? "succeeded-with-Google" : "succeeded";
  report.jwt = { signature: "verified", algorithm: learner.algorithm, issuer: "verified", audience: "verified", expiration: "verified", identity: "verified" };
  const oldEvents = (await learningPool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 ORDER BY id", [learner.profile.id])).rows;
  const baseline = await data(page, "/progress");
  const bookmarks = (await data(page, "/bookmarks")).items;
  const words = ready.surah.verses.flatMap((verse) => verse.words).filter((word) => word.translation?.trim());
  const activeBefore = await data(page, "/review-sessions/current");
  const existingCard = activeBefore?.items.find((item) => !item.reviewed && Date.parse(item.availableAt) <= Date.now());
  const target = existingCard ? words.find((word) => coordinate(word) === coordinate(existingCard)) :
    words.find((word) => !baseline.items.some((item) => coordinate(item) === coordinate(word)) && !bookmarks.some((item) => coordinate(item) === coordinate(word)));
  check(Boolean(target), "No unreviewed authentic word or current due card is available; existing schedules were not reset.");
  setStage("daily-authentic-bookmark");
  await page.goto(`${base}/quran/al-fatihah?word=1:${target.reference.ayah}:${target.position}`);
  const panel = page.locator(".quran-detail-column");
  if (!bookmarks.some((item) => coordinate(item) === coordinate(target))) await panel.getByRole("button", { name: "Bookmark word", exact: true }).click();
  await panel.getByRole("button", { name: "Remove bookmark", exact: true }).waitFor();
  const bookmark = (await data(page, "/bookmarks")).items.find((item) => coordinate(item) === coordinate(target));
  check(bookmark && bookmark.sources.some((source) => source.environment === "prelive" && source.wordId === String(target.sourceId)), "Bookmark lacks the authentic prelive source reference.");
  result.bookmark = "authentic-source-occurrence-saved";
  setStage("daily-user-review");
  await page.goto(`${base}/reviews`);
  await page.getByRole("region", { name: "Daily review inbox", exact: true }).waitFor();
  if (!activeBefore) await page.getByRole("button", { name: "Learn saved words", exact: true }).click();
  const first = await userReview(page, "First daily review");
  check((await data(page, "/progress")).totalReviews === baseline.totalReviews + 1, "The daily review did not increment history exactly once.");
  await rejectedRetries(page, first);
  setStage("daily-before-due");
  const queueAfter = await data(page, "/review-sessions/current");
  const futureItem = queueAfter?.items.find((item) => item.vocabularyId === first.input.vocabularyId && !item.reviewed);
  if (futureItem && Date.parse(futureItem.availableAt) > Date.now() + 15_000) {
    const preview = await privateApi(page, `/review-sessions/preview?sessionId=${queueAfter.id}&vocabularyId=${futureItem.vocabularyId}`);
    const early = await privateApi(page, "/attempts", "POST", { ...first.input, clientAttemptId: randomUUID(), expectedRevision: futureItem.revision });
    check(preview.status === 409 && early.status === 409, "A not-yet-due card could be previewed or graded early.");
    check((await data(page, "/progress")).totalReviews === baseline.totalReviews + 1, "An early submission added a review.");
    result.earlyRejection = "preview-and-current-revision-submission-rejected-before-due";
  } else {
    const beforeStart = await data(page, "/reviews/inbox");
    check(!beforeStart.items.some((item) => item.vocabularyId === first.input.vocabularyId && item.dueAt && Date.parse(item.dueAt) <= Date.parse(beforeStart.serverNow)), "Future review is counted due early.");
    result.earlyRejection = "future-review-excluded-from-due-inbox";
  }
  setStage("daily-reload");
  await page.reload(); await page.getByRole("region", { name: "Daily review inbox", exact: true }).waitFor();
  check((await getSession(page))?.user.id === learner.subject &&
    isDeepStrictEqual(stableSession(await data(page, "/review-sessions/current")), stableSession(queueAfter)), "Reload did not restore the authenticated daily queue.");
  report.restoration = "passed";
  setStage("daily-hosted-refresh");
  const refreshed = await page.evaluate(async () => {
    const path = "/src/features/auth/auth-client.ts";
    const { authClient } = await import(/* @vite-ignore */ path);
    const { data, error } = await authClient.auth.refreshSession();
    return { success: !error && Boolean(data.session), subject: data.session?.user.id };
  });
  check(refreshed.success && refreshed.subject === learner.subject, "Hosted session refresh failed or changed identity.");
  await auth.verify((await getSession(page)).access_token);
  check((await data(page, "/profile")).id === learner.profile.id, "Refreshed JWT changed the learner profile.");
  report.refresh = "passed-with-hosted-token-refresh";
  await signOut(page);
  console.log(google ? "Reload, hosted refresh and sign-out passed. Next: a clean browser context signs in with the SAME Google account." : "Reload and sign-out passed. The next independent login uses one additional email delivery; do not request repeated codes.");
  setStage("daily-independent-relogin");
  const device = await newPage();
  const restored = await manualLogin(device, google ? "New browser context: use the SAME Google account" : "New browser context: sign in to the SAME learner account with a NEW emailed code");
  check(restored.subject === learner.subject && restored.profile.id === learner.profile.id, "Recovery requires the same actual learner account.");
  check((await data(device, "/progress")).totalReviews === baseline.totalReviews + 1 &&
    (await data(device, "/bookmarks")).items.some((item) => item.vocabularyId === bookmark.vocabularyId) &&
    (await data(device, "/history")).items.some((item) => item.id === first.saved.attemptId) &&
    isDeepStrictEqual(stableSession(await data(device, "/review-sessions/current")), stableSession(queueAfter)), "Independent sign-in did not recover the bookmark, progress, history and exact daily queue.");
  report.crossDevice = google ? "passed-with-independent-Google-sign-in" : "passed-with-independent-email-sign-in"; result.sessionRecovery = queueAfter ? "interrupted-daily-session-recovered" : "completed-session-and-progress-recovered";
  await device.goto(`${base}/reviews`);
  await device.getByRole("region", { name: "Daily review inbox", exact: true }).waitFor();
  if (futureItem && Date.parse(futureItem.availableAt) - Date.now() <= 660_000) {
    setStage("daily-natural-due-wait");
    console.log("Waiting for the REAL due instant; no application clock is overridden. The returned card will require another honest browser review.");
    await device.getByRole("region", { name: "Daily recall session", exact: true }).getByRole("button", { name: "Reveal meaning", exact: true }).waitFor({ timeout: 675_000 });
    const due = await data(device, "/reviews/inbox");
    check(Date.parse(due.serverNow) >= Date.parse(futureItem.availableAt) && due.dueNow > 0, "The scheduled review appeared before its real due instant.");
    check((await privateApi(device, `/review-sessions/preview?sessionId=${queueAfter.id}&vocabularyId=${futureItem.vocabularyId}`)).status === 200, "The due card remained unavailable.");
    result.naturalDue = "real-time-transition-from-rejected-to-available";
    const second = await userReview(device, "Due follow-up review");
    await rejectedRetries(device, second);
  } else result.naturalDue = "not-observed-within-11-minute-window-no-clock-override";
  if (args.includes("--two-users")) {
    setStage("daily-second-real-user");
    console.log(google ? "Second-user acceptance: use the approved DIFFERENT Google account in the next private browser window." : "Optional second-user acceptance needs an approved DIFFERENT account and sufficient email quota. No mail is requested automatically.");
    const other = await newPage();
    const second = await manualLogin(other, google ? "Second REAL learner: use the approved DIFFERENT Google account" : "Second REAL learner: sign in only with an approved different development account");
    check(second.subject !== learner.subject && second.profile.id !== learner.profile.id, "Isolation requires two distinct real users.");
    const secondOldEvents = (await learningPool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 ORDER BY id", [second.profile.id])).rows;
    const secondBaseline = await data(other, "/progress");
    const secondBookmarks = (await data(other, "/bookmarks")).items;
    const secondActive = await data(other, "/review-sessions/current");
    const secondCurrent = secondActive?.items.find((item) => !item.reviewed && Date.parse(item.availableAt) <= Date.now());
    const secondTarget = secondCurrent ? words.find((word) => coordinate(word) === coordinate(secondCurrent)) :
      words.find((word) => coordinate(word) !== coordinate(target) && !secondBaseline.items.some((item) => coordinate(item) === coordinate(word)) && !secondBookmarks.some((item) => coordinate(item) === coordinate(word)));
    check(Boolean(secondTarget), "Second learner has no available authentic test card; existing activity was not reset.");
    await other.goto(`${base}/quran/al-fatihah?word=1:${secondTarget.reference.ayah}:${secondTarget.position}`);
    const secondPanel = other.locator(".quran-detail-column");
    if (!secondBookmarks.some((item) => coordinate(item) === coordinate(secondTarget))) await secondPanel.getByRole("button", { name: "Bookmark word", exact: true }).click();
    await secondPanel.getByRole("button", { name: "Remove bookmark", exact: true }).waitFor();
    await other.goto(`${base}/reviews`);
    await other.getByRole("region", { name: "Daily review inbox", exact: true }).waitFor();
    if (!secondActive) await other.getByRole("button", { name: "Learn saved words", exact: true }).click();
    const secondAttempt = await userReview(other, "Second learner's real daily review", second);
    await rejectedRetries(other, secondAttempt, second);
    // Check BOTH directions against each learner's own database rows. Neither
    // empty-account assumptions nor globally shared vocabulary IDs prove isolation.
    for (const [current, owner, foreign] of [[device, learner, secondAttempt], [other, second, first]]) {
      const own = await data(current, "/progress");
      const ownCount = (await learningPool.query("SELECT count(*)::int AS count FROM learning.review_attempts WHERE user_id=$1", [owner.profile.id])).rows[0].count;
      check(own.totalReviews === ownCount, "Foreign review totals leaked.");
      const ownHistory = (await learningPool.query("SELECT id,rating FROM learning.review_attempts WHERE user_id=$1 ORDER BY reviewed_at DESC,id DESC LIMIT 50", [owner.profile.id])).rows;
      check(isDeepStrictEqual((await data(current, "/history")).items.map(({ id, rating }) => ({ id, rating })), ownHistory), "Foreign history leaked.");
      const ownBookmarks = (await learningPool.query("SELECT vocabulary_id FROM learning.bookmarks WHERE user_id=$1", [owner.profile.id])).rows.map((item) => item.vocabulary_id).sort();
      check(isDeepStrictEqual((await data(current, "/bookmarks")).items.map((item) => item.vocabularyId).sort(), ownBookmarks), "Foreign bookmarks leaked.");
      const ownProgress = (await learningPool.query("SELECT vocabulary_id FROM learning.vocabulary_progress WHERE user_id=$1", [owner.profile.id])).rows.map((item) => item.vocabulary_id).sort();
      check(isDeepStrictEqual(own.items.map((item) => item.vocabularyId).sort(), ownProgress), "Foreign progress leaked.");
      for (const path of ["/review-sessions/current", "/sessions/current"]) {
        const session = await data(current, path);
        if (session) check((await learningPool.query("SELECT user_id FROM learning.review_sessions WHERE id=$1", [session.id])).rows[0]?.user_id === owner.profile.id, "Foreign session leaked.");
      }
      for (const [path, method, body] of [[`/review-sessions/preview?sessionId=${foreign.input.sessionId}&vocabularyId=${foreign.input.vocabularyId}`, "GET"],
        ["/attempts", "POST", { ...foreign.input, clientAttemptId: randomUUID() }],
        ["/review-sessions/skip", "POST", { sessionId: foreign.input.sessionId, vocabularyId: foreign.input.vocabularyId, expectedRevision: 0 }]]) {
        check((await privateApi(current, path, method, body)).status === 404, "Another learner's session was accessible or mutable.");
      }
      check((await data(current, `/history?cursor=${foreign.saved.attemptId}`)).items.length === 0, "Foreign history cursor leaked reviews.");
      check((await data(current, "/progress")).totalReviews === ownCount, "Rejected foreign writes changed review totals.");
    }
    const secondRetained = (await learningPool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id", [second.profile.id, secondOldEvents.map((event) => event.id)])).rows;
    check(isDeepStrictEqual(secondRetained, secondOldEvents), "Second learner's earlier activity changed.");
    await signOut(other); report.userIsolation = "passed-bidirectionally-for-two-real-users-with-saved-activity";
  }
  setStage("daily-preservation-and-signout");
  const retained = (await learningPool.query("SELECT * FROM learning.review_attempts WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id", [learner.profile.id, oldEvents.map((event) => event.id)])).rows;
  check(isDeepStrictEqual(retained, oldEvents), "Earlier learner review events changed during acceptance.");
  result.previousActivity = "all-preexisting-review-events-unchanged";
  await signOut(device); report.signOut = "passed";
  await device.goto(`${base}/quran/al-fatihah`);
  await device.locator(".quran-verse-card").first().waitFor();
  check(await device.locator(".quran-word-button").count() > 0, "Public authentic reading failed after sign-out.");
  report.publicReading = "passed-before-login-and-after-signout";
  report.learning = "real-bookmark-FSRS-history-progress-and-recovery-passed";
  report.status = report.userIsolation === "not-tested" || result.naturalDue.startsWith("not-") ? "passed-with-unperformed-checks" : "passed";
  report.note = "Genuine learner-selected ratings and real server time only. Development activity retained. No migrations, original database access, content snapshots, credentials or token files.";
}
