import assert from "node:assert/strict";
import test from "node:test";
import { reviewDelay, reviewTime } from "../src/features/learning/review-utils.ts";

test("review clock uses server UTC and elapsed monotonic time, never the device timezone/wall clock", () => {
  const serverNow = "2026-10-17T18:29:30Z";
  assert.equal(reviewTime(serverNow, 10_000, 40_000), Date.parse("2026-10-17T18:30:00Z"));
  assert.equal(reviewTime(serverNow, 10_000, 9_000), Date.parse(serverNow));
});
test("review interval labels handle due, short learning steps and multi-day reviews", () => {
  const now = Date.parse("2026-10-17T12:00Z");
  assert.equal(reviewDelay("2026-10-17T11:59Z", now), "now");
  assert.equal(reviewDelay("2026-10-17T12:00:30Z", now), "30s");
  assert.equal(reviewDelay("2026-10-17T12:10Z", now), "10m");
  assert.equal(reviewDelay("2026-10-17T13:00Z", now), "1h");
  assert.equal(reviewDelay("2026-10-20T12:00Z", now), "3d");
});
