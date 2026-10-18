import assert from "node:assert/strict";
import test from "node:test";
import { createOAuthCallbackCompletion, googleAuthErrorMessage } from "../src/features/auth/oauth-callback.ts";

test("PKCE callback scrubs its URL first and exchanges a code once across repeated consumers", async () => {
  const order: string[] = [];
  const complete = createOAuthCallbackCompletion("http://localhost/auth/callback?code=SYNTHETIC_CODE&next=https://evil.example.test", {
    exchangeCodeForSession: async (code) => { assert.equal(code, "SYNTHETIC_CODE"); order.push("exchange"); return { data: { session: { synthetic: true } }, error: null }; },
  }, () => { order.push("clear"); });
  const first = complete(), second = complete();
  assert.equal(first, second); assert.deepEqual(await first, { status: "success" });
  assert.deepEqual(order, ["clear", "exchange"]);
});

test("callback rejects implicit tokens, missing/duplicate codes, denial and missing config without exposing provider values", async () => {
  let calls = 0, cleared = 0;
  const auth = { exchangeCodeForSession: async () => { calls++; return { data: { session: null }, error: null }; } };
  for (const address of ["http://localhost/auth/callback", "http://localhost/auth/callback?code=a&code=b", "http://localhost/auth/callback?code=a#access_token=PRIVATE_SENTINEL",
    "http://localhost/auth/callback?error=PRIVATE_SENTINEL&error_description=PRIVATE_SENTINEL", "http://localhost/auth/callback#error=access_denied&error_description=PRIVATE_SENTINEL"]) {
    const result = await createOAuthCallbackCompletion(address, auth, () => { cleared++; })();
    assert.equal(result.status, "error"); assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
  }
  assert.equal(calls, 0); assert.equal(cleared, 5);
  assert.equal((await createOAuthCallbackCompletion("http://localhost/auth/callback?code=a", null, () => {})()).status, "error");
});

test("Google callback failure messages are safe and explain cancellation, provider configuration and expired PKCE", async () => {
  assert.match(googleAuthErrorMessage({ code: "access_denied" }), /cancelled/);
  assert.match(googleAuthErrorMessage({ code: "provider_disabled" }), /not enabled/);
  assert.match(googleAuthErrorMessage({ code: "bad_code_verifier" }), /same browser/);
  assert.match(googleAuthErrorMessage({ code: "pkce_code_verifier_not_found" }), /same browser/);
  for (const error of [new Error("PRIVATE_SENTINEL"), { code: "PRIVATE_SENTINEL", message: "PRIVATE_SENTINEL" }]) {
    const result = await createOAuthCallbackCompletion("http://localhost/auth/callback?code=SYNTHETIC_CODE", {
      exchangeCodeForSession: async () => { throw error; },
    }, () => {})();
    assert.equal(result.status, "error"); assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
  }
});
