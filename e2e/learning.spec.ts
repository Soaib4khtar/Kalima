import { expect, test, type Page } from "@playwright/test";

// All identity and Quran content here is synthetic. The learner DB is real and disposable.
async function signIn(page: Page, email: string) {
  await page.goto("/account");
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
  await page.getByLabel("Email address").fill("development@example.test");
  let code = "email_address_not_authorized";
  await page.route("**/auth/v1/otp", (route) => route.fulfill({ status: 422,
    headers: { "x-supabase-api-version": "2024-01-01", "access-control-allow-origin": "http://127.0.0.1:4173", "access-control-expose-headers": "x-supabase-api-version" }, json: { code, msg: "PRIVATE_ERROR_SENTINEL" } }));
  for (const [nextCode, message] of [["email_address_not_authorized", "SMTP"], ["over_email_send_rate_limit", "rate limit"], ["otp_disabled", "disabled"], ["captcha_failed", "CAPTCHA"]]) {
    code = nextCode;
    await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByRole("alert")).not.toContainText("PRIVATE_ERROR_SENTINEL");
  }
});
