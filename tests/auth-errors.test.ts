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
});
test("unknown provider/network errors never echo sensitive values", () => {
  for (const error of [new Error("PRIVATE SENTINEL"), { message: "PRIVATE SENTINEL", code: "PRIVATE SENTINEL" }, null, "PRIVATE SENTINEL"]) {
    assert.ok(!authErrorMessage(error, true).includes("PRIVATE SENTINEL"));
    assert.equal(authErrorMessage(error, false), "A sign-in code could not be sent. Please try again later.");
  }
});
