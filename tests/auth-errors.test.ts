import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage } from "../src/features/auth/auth-errors.ts";

test("known hosted auth setup failures give actionable messages", () => {
  assert.match(authErrorMessage({ code: "email_address_not_authorized" }, false), /SMTP/);
  assert.match(authErrorMessage({ code: "over_email_send_rate_limit" }, false), /rate limit/);
  assert.match(authErrorMessage({ code: "over_request_rate_limit" }, true), /rate limit/);
  assert.match(authErrorMessage({ code: "signup_disabled" }, false), /disabled/);
  assert.match(authErrorMessage({ code: "captcha_failed" }, false), /CAPTCHA/);
  assert.match(authErrorMessage({ code: "otp_expired" }, true), /expired/);
  assert.match(authErrorMessage({ code: "email_address_invalid" }, false), /approved/);
});

test("SDK HTTP and network fallbacks distinguish limits, service failures and unreachable projects", () => {
  assert.match(authErrorMessage({ status: 429 }, false), /rate limit/);
  for (const error of [{ code: "unexpected_failure" }, { name: "AuthRetryableFetchError", status: 500 }, { status: 503 }, { status: 599 }]) {
    const message = authErrorMessage({ ...error, message: "PRIVATE SENTINEL" }, false);
    assert.match(message, /Auth logs/); assert.ok(!message.includes("PRIVATE SENTINEL"));
  }
  assert.match(authErrorMessage({ name: "AuthRetryableFetchError", status: 0, message: "PRIVATE SENTINEL" }, false), /connection/);
});
test("unknown provider/network errors never echo sensitive values", () => {
  for (const error of [new Error("PRIVATE SENTINEL"), { message: "PRIVATE SENTINEL", code: "PRIVATE SENTINEL" }, null, "PRIVATE SENTINEL"]) {
    assert.ok(!authErrorMessage(error, true).includes("PRIVATE SENTINEL"));
    assert.equal(authErrorMessage(error, false), "A sign-in code could not be requested. Check your connection and the development project's Auth logs before retrying.");
  }
});
