import { expect, test, type Page } from "@playwright/test";

// All identity and Quran content here is synthetic. The learner DB is real and disposable.
async function signIn(page: Page, email: string) {
  await page.goto("/account");
  await page.getByText("Use an email code instead", { exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.getByLabel("Sign-in code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You’re signed in" })).toBeVisible();
}

test("bookmarks and recall survive refresh, new devices, retries and sign-out", async ({ page, browser, isMobile }, info) => {
  const email = `learner-${info.project.name}@example.test`;
  await page.goto("/quran/al-fatihah");
  await expect(page.locator(".quran-word-button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Reveal meaning" })).toBeVisible();
  await signIn(page, email);
  await page.getByRole("link", { name: "Continue Al-Fatihah", exact: true }).click();
  await page.getByRole("button", { name: /^Word 1 in ayah 1:/ }).click();
  const panel = page.locator(isMobile ? ".quran-inline-word-panel" : ".quran-detail-column").getByRole("complementary");
  await panel.getByRole("button", { name: "Bookmark word", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Remove bookmark", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start saved recall" }).click();
  const recall = page.getByRole("region", { name: "Saved meaning recall" });
  await expect(recall.getByText("1 / 2", { exact: true })).toBeVisible();
  await expect(recall.getByRole("button", { name: "Good", exact: true })).toHaveCount(0);
  await recall.getByRole("button", { name: "Reveal meaning" }).click();
  const submittedIds: string[] = [];
  await page.route("**/api/learning/attempts", async (route) => {
    submittedIds.push(route.request().postDataJSON().clientAttemptId);
    if (submittedIds.length === 1) {
      // Commit succeeds but its response is lost. Retry must not count twice.
      await route.fetch(); await route.abort("failed");
    } else await route.continue();
  });
  await recall.getByRole("button", { name: "Good", exact: true }).click();
  await expect(recall.getByRole("button", { name: "Retry saving" })).toBeVisible();
  await recall.getByRole("button", { name: "Retry saving" }).click();
  await expect(recall.getByText("2 / 2", { exact: true })).toBeVisible();
  expect(submittedIds).toHaveLength(2); expect(submittedIds[0]).toBe(submittedIds[1]);
  await page.reload();
  await expect(recall.getByText("2 / 2", { exact: true })).toBeVisible();
  await expect(recall.getByRole("button", { name: "Reveal meaning" })).toBeVisible();
  // Expire the stored test session: the real SDK must refresh it before API calls.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("kalima-auth")!);
    stored.expires_at = Math.floor(Date.now() / 1000) - 10;
    localStorage.setItem("kalima-auth", JSON.stringify(stored));
  });
  const refreshed = page.waitForResponse((response) => response.url().includes("/auth/v1/token?grant_type=refresh_token"));
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(recall.getByText("2 / 2", { exact: true })).toBeVisible();

  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const secondDevice = await context.newPage();
  await signIn(secondDevice, email);
  const summary = secondDevice.getByRole("region", { name: "Your learning progress" });
  await expect(summary.getByText("Quran 1:1 · Word 1", { exact: true })).toBeVisible();
  await expect(summary.locator(".learning-stats > div").filter({ hasText: "Recall attempts" }).locator("dd")).toHaveText("1");
  await secondDevice.getByRole("link", { name: "Continue Al-Fatihah", exact: true }).click();
  await expect(secondDevice.getByText("2 / 2", { exact: true })).toBeVisible();
  await secondDevice.getByRole("button", { name: "Reveal meaning" }).click();
  await secondDevice.getByRole("button", { name: "Again", exact: true }).click();
  await expect(secondDevice.getByText("Recall saved. Your next reviews are scheduled.")).toBeVisible();
  await secondDevice.getByRole("link", { name: "Account", exact: true }).click();
  await secondDevice.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(secondDevice.getByRole("heading", { name: "Save your learning" })).toBeVisible();
  await expect(secondDevice.getByRole("region", { name: "Your learning progress" })).toHaveCount(0);
  await signIn(secondDevice, `other-${info.project.name}@example.test`);
  await expect(secondDevice.getByText("No saved words yet.")).toBeVisible();
  await expect(secondDevice.getByText("No recall attempts saved yet.")).toBeVisible();
  await context.close();
  await page.goto("/account");
  await expect(page.locator(".learning-stats > div").filter({ hasText: "Recall attempts" }).locator("dd")).toHaveText("2");
  await page.getByRole("link", { name: "Quran 1:1 · Word 1", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Word 1 in ayah 1:/ })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Remove bookmark", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Bookmark word", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Practice due words" }).click();
  await expect(page.getByText("No reviews are due right now.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("invalid codes and failed account requests are clear without blocking public reading", async ({ page }) => {
  await page.goto("/account");
  await page.getByText("Use an email code instead", { exact: true }).click();
  await page.getByLabel("Email address").fill("invalid@example.test");
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.getByLabel("Sign-in code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This code could not be verified");
  await page.getByRole("link", { name: "Quran", exact: true }).click();
  await expect(page.locator(".quran-word-button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Reveal meaning" })).toBeVisible();
});

test("hosted SMTP and quota errors are actionable without echoing raw provider text", async ({ page }) => {
  await page.goto("/account");
  await page.getByText("Use an email code instead", { exact: true }).click();
  await page.getByLabel("Email address").fill("development@example.test");
  let code: string | undefined = "email_address_not_authorized";
  let status = 422;
  let requests = 0;
  await page.route("**/auth/v1/otp", (route) => {
    requests++;
    return route.fulfill({ status, headers: { "x-supabase-api-version": "2024-01-01", "access-control-allow-origin": "http://127.0.0.1:4173", "access-control-expose-headers": "x-supabase-api-version" }, json: { code, msg: "PRIVATE_ERROR_SENTINEL" } });
  });
  const cases: [string | undefined, string, number][] = [["email_address_not_authorized", "SMTP", 422], ["over_email_send_rate_limit", "rate limit", 429], ["otp_disabled", "disabled", 422], ["captcha_failed", "CAPTCHA", 422], ["unexpected_failure", "Auth logs", 500], [undefined, "Auth logs", 503], [undefined, "rate limit", 429]];
  for (const [nextCode, message, nextStatus] of cases) {
    code = nextCode; status = nextStatus;
    await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByRole("alert")).not.toContainText("PRIVATE_ERROR_SENTINEL");
  }
  expect(requests).toBe(cases.length);
});

test("daily inbox learns a bookmark, retries safely, waits for FSRS, and resumes across contexts", async ({ page, browser, isMobile }, info) => {
  await page.route("https://audio.example.test/**", (route) => route.abort());
  const email = `daily-${info.project.name}@example.test`;
  await page.goto("/reviews");
  await expect(page.getByRole("link", { name: "Sign in for daily reviews", exact: true })).toBeVisible();
  await signIn(page, email);
  await page.goto("/quran/al-fatihah");
  await page.getByRole("button", { name: /^Word 1 in ayah 1:/ }).click();
  const panel = page.locator(isMobile ? ".quran-inline-word-panel" : ".quran-detail-column").getByRole("complementary");
  await panel.getByRole("button", { name: "Bookmark word", exact: true }).click();
  await panel.getByRole("link", { name: "Find this word in daily reviews" }).click();
  const inbox = page.getByRole("region", { name: "Daily review inbox", exact: true });
  await expect(inbox.locator(".learning-stats > div").filter({ hasText: "New saved words" }).locator("dd")).toHaveText("1");
  await page.getByText("Review timezone: UTC", { exact: true }).click();
  await page.getByLabel("Timezone", { exact: true }).selectOption("America/New_York");
  await page.getByRole("button", { name: "Save timezone", exact: true }).click();
  await expect(page.getByText("Review timezone: America/New_York", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Learn saved words", exact: true }).click();
  const recall = page.getByRole("region", { name: "Daily recall session", exact: true });
  await expect(recall.getByRole("button", { name: /^Good / })).toHaveCount(0);
  await expect(recall.getByLabel("Review word audio")).toHaveAttribute("src", "https://audio.example.test/synthetic-word.mp3");
  await recall.getByRole("button", { name: "Reveal meaning", exact: true }).click();
  await expect(recall.getByText("Synthetic meaning 1", { exact: true })).toBeVisible();
  const submissions: string[] = [];
  await page.route("**/api/learning/attempts", async (route) => {
    submissions.push(route.request().postDataJSON().clientAttemptId);
    if (submissions.length === 1) { await route.fetch(); await route.abort("failed"); } else await route.continue();
  });
  await recall.getByRole("button", { name: /^Again / }).click();
  await recall.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(recall.getByRole("heading", { name: "Up to date for now." })).toBeVisible();
  expect(submissions).toHaveLength(2); expect(submissions[0]).toBe(submissions[1]);
  await page.reload();
  await expect(recall.getByRole("heading", { name: "Up to date for now." })).toBeVisible();
  await expect(page.getByText("Review timezone: America/New_York", { exact: true })).toBeVisible();
  await expect(recall.getByRole("button", { name: "Reveal meaning", exact: true })).toHaveCount(0);
  await page.request.post("http://127.0.0.1:4174/__test/advance-time");
  await page.getByRole("button", { name: "Refresh inbox", exact: true }).click();
  await recall.getByRole("button", { name: "Reveal meaning", exact: true }).click();
  await recall.getByRole("button", { name: /^Easy / }).click();
  await expect(page.getByText("Daily session saved. Your next reviews are scheduled.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing due right now." })).toBeVisible();
  await expect(inbox.locator(".learning-stats > div").filter({ hasText: "Words reviewed today" }).locator("dd")).toHaveText("1");
  await expect(inbox.getByText("2 review events saved today.", { exact: false })).toBeVisible();
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const device = await context.newPage();
  await signIn(device, email); await device.goto("/reviews");
  await expect(device.getByText("Review timezone: America/New_York", { exact: true })).toBeVisible();
  await expect(device.getByRole("heading", { name: "Nothing due right now." })).toBeVisible();
  await expect(device.getByRole("region", { name: "Daily review inbox", exact: true }).getByText("2 review events saved today.", { exact: false })).toBeVisible();
  await context.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("daily review source gaps and inbox errors preserve schedules without fabricated meanings", async ({ page, isMobile }, info) => {
  await signIn(page, `daily-gaps-${info.project.name}@example.test`);
  await page.goto("/quran/al-fatihah");
  const panel = page.locator(isMobile ? ".quran-inline-word-panel" : ".quran-detail-column").getByRole("complementary");
  for (const word of [2, 3]) {
    await page.getByRole("button", { name: new RegExp(`^Word ${word} in ayah 1:`) }).click();
    await panel.getByRole("button", { name: "Bookmark word", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Remove bookmark", exact: true })).toBeVisible();
  }
  await page.goto("/reviews");
  await page.getByRole("button", { name: "Learn saved words", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 word(s) remain due because source meanings are unavailable." })).toBeVisible();
  const recall = page.getByRole("region", { name: "Daily recall session", exact: true });
  await recall.getByRole("button", { name: "Reveal meaning", exact: true }).click();
  await expect(recall.getByText("Synthetic meaning 2", { exact: true })).toBeVisible();
  await expect(recall.getByText("No verified word audio is available.", { exact: true })).toBeVisible();
  await recall.getByRole("button", { name: /^Easy / }).click();
  await expect(page.getByRole("heading", { name: "Nothing due right now." })).toBeVisible();
  await page.route("**/api/learning/reviews/inbox", (route) => route.fulfill({ status: 503, json: { success: false, error: { message: "Synthetic inbox outage" } } }));
  await page.getByRole("button", { name: "Refresh inbox", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Synthetic inbox outage");
  await page.unroute("**/api/learning/reviews/inbox");
  await page.getByRole("button", { name: "Retry inbox", exact: true }).click();
  await expect(page.getByRole("region", { name: "Daily review inbox", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Learn saved words", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 word(s) remain due because source meanings are unavailable." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Daily recall session", exact: true })).toHaveCount(0);
});

test("Google PKCE sign-in restores reviews, refreshes and isolates two synthetic identities", async ({ page, browser, isMobile }, info) => {
  // Synthetic OAuth chooser and signed identities only; this is NOT hosted Google acceptance.
  async function google(current: Page, learner: "Alice" | "Bob") {
    await current.goto("http://127.0.0.1:4173/account");
    await current.getByRole("button", { name: "Continue with Google", exact: true }).click();
    const choice = current.getByRole("link", { name: `Synthetic Google ${learner}`, exact: true });
    await choice.waitFor();
    await choice.evaluate((element, cohort) => { (element as HTMLAnchorElement).href += `&cohort=${cohort}`; }, info.project.name);
    await choice.click();
    await expect(current.getByRole("heading", { name: "You’re signed in", exact: true })).toBeVisible();
    expect(new URL(current.url()).pathname).toBe("/account"); expect(new URL(current.url()).search).toBe("");
  }
  async function call(current: Page, path: string, body?: unknown) {
    return current.evaluate(async ({ path, body }) => {
      const session = JSON.parse(localStorage.getItem("kalima-auth")!);
      const response = await fetch(`http://127.0.0.1:4174/api/learning${path}`, { method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    }, { path, body });
  }
  let exchanges = 0;
  page.on("request", (request) => { if (request.url().includes("grant_type=pkce")) exchanges++; });
  await google(page, "Alice"); expect(exchanges).toBe(1);
  await page.goto("/quran/al-fatihah?word=1:1:1");
  const panel = page.locator(isMobile ? ".quran-inline-word-panel" : ".quran-detail-column");
  await panel.getByRole("button", { name: "Bookmark word", exact: true }).click();
  await panel.getByRole("button", { name: "Remove bookmark", exact: true }).waitFor();
  await page.goto("/reviews");
  await page.getByRole("button", { name: "Learn saved words", exact: true }).click();
  const recall = page.getByRole("region", { name: "Daily recall session", exact: true });
  await recall.getByRole("button", { name: "Reveal meaning", exact: true }).click();
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/learning/attempts") && response.request().method() === "POST");
  await recall.getByRole("button", { name: /^Again / }).click();
  const response = await submitted;
  expect(response.status()).toBe(200);
  const input = response.request().postDataJSON();
  const saved = (await response.json()).data;
  await expect(recall.getByRole("heading", { name: "Up to date for now." })).toBeVisible();
  expect(Date.parse(saved.dueAt) - Date.parse(saved.reviewedAt)).toBe(60_000);
  expect((await call(page, "/attempts", input)).body.data.attemptId).toBe(saved.attemptId);
  expect((await call(page, "/attempts", { ...input, clientAttemptId: crypto.randomUUID() })).status).toBe(409);
  await page.reload(); await expect(recall.getByRole("heading", { name: "Up to date for now." })).toBeVisible();
  await page.goto("/account");
  await page.getByText("Session controls", { exact: true }).click();
  await page.getByRole("button", { name: "Refresh sign-in session", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your sign-in session has been refreshed.");
  expect((await call(page, "/progress")).body.data.totalReviews).toBe(1);
  await page.goto("/account"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
  const deviceContext = await browser.newContext(), otherContext = await browser.newContext();
  const device = await deviceContext.newPage(), other = await otherContext.newPage();
  await google(device, "Alice"); await device.goto("http://127.0.0.1:4173/reviews");
  await expect(device.getByRole("heading", { name: "Up to date for now." })).toBeVisible();
  expect((await call(device, "/history")).body.data.items[0].id).toBe(saved.attemptId);
  expect((await call(device, "/bookmarks")).body.data.items).toHaveLength(1);
  await google(other, "Bob");
  expect((await call(other, "/bookmarks")).body.data.items).toHaveLength(0);
  expect((await call(other, "/progress")).body.data.totalReviews).toBe(0);
  expect((await call(other, "/history")).body.data.items).toHaveLength(0);
  expect((await call(other, "/review-sessions/current")).body.data).toBeNull();
  expect((await call(other, "/attempts", { ...input, clientAttemptId: crypto.randomUUID() })).status).toBe(404);
  expect((await call(other, "/review-sessions/skip", { sessionId: input.sessionId, vocabularyId: input.vocabularyId, expectedRevision: 1 })).status).toBe(404);
  expect((await call(device, "/progress")).body.data.totalReviews).toBe(1);
  // Identity switching in the same tab must clear the prior learner's private cache.
  await device.goto("http://127.0.0.1:4173/account"); await device.getByRole("button", { name: "Sign out", exact: true }).click();
  await google(device, "Bob"); await device.goto("http://127.0.0.1:4173/reviews");
  await expect(device.getByRole("heading", { name: "Nothing due right now." })).toBeVisible();
  await expect(device.getByRole("region", { name: "Daily recall session", exact: true })).toHaveCount(0);
  await deviceContext.close(); await otherContext.close();
  await page.goto("/quran/al-fatihah"); await expect(page.locator(".quran-word-button")).toHaveCount(3);
});

test("Google callback cancellation and invalid callbacks scrub private parameters and preserve public reading", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=PRIVATE_SENTINEL&next=https://evil.example.test#access_token=PRIVATE_TOKEN");
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await expect(page.locator("body")).not.toContainText("PRIVATE_SENTINEL");
  expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("link", { name: "Read without signing in", exact: true }).click();
  await expect(page.locator(".quran-word-button")).toHaveCount(3);
  await page.goto("/auth/callback?code=SYNTHETIC_INVALID_CODE");
  await expect(page.getByRole("alert")).toContainText("same browser");
  expect(new URL(page.url()).search).toBe("");
});
