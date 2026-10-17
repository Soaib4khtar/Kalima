import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCard, State } from "ts-fsrs";
import { bootstrapCard, previewCard, restoreCard, scheduleCard, serializeCard, SCHEDULER_VERSION, SCHEDULER_PARAMETERS } from "../src/modules/learning/learning.scheduler.js";

const now = new Date("2026-10-17T12:00:00Z");
test("FSRS maps four ratings to real learning/memory states with deterministic previews", () => {
  const card = createEmptyCard(now);
  const preview = previewCard(card, now);
  assert.equal(preview.again.dueAt, "2026-10-17T12:01:00.000Z");
  assert.equal(preview.good.dueAt, "2026-10-17T12:10:00.000Z");
  assert.ok(Date.parse(preview.hard.dueAt) > Date.parse(preview.again.dueAt));
  assert.equal(preview.easy.state, "review");
  assert.deepEqual(previewCard(card, now), preview);
  assert.equal(card.reps, 0, "preview cannot mutate the input card");
  assert.equal(SCHEDULER_PARAMETERS.request_retention, 0.9);
  assert.ok(SCHEDULER_VERSION.includes("fsrs6"));
});
test("graduation, overdue reviews and lapses update stability/difficulty without inventing mastery", () => {
  const first = scheduleCard(createEmptyCard(now), "good", now).card;
  const graduated = scheduleCard(first, "good", first.due).card;
  assert.equal(graduated.state, State.Review);
  const overdue = new Date(graduated.due.getTime() + 5 * 86400_000);
  const lapse = scheduleCard(graduated, "again", overdue).card;
  assert.equal(lapse.state, State.Relearning); assert.equal(lapse.lapses, 1);
  assert.ok(lapse.due > overdue); assert.ok(Number.isFinite(lapse.stability));
  assert.ok(lapse.stability < graduated.stability);
  const easy = scheduleCard(graduated, "easy", overdue).card;
  assert.ok(easy.due > lapse.due); assert.ok(easy.stability > 0);
  assert.deepEqual(restoreCard(JSON.parse(JSON.stringify(serializeCard(easy)))), easy);
  assert.throws(() => scheduleCard(easy, "good", now), /precedes/);
  assert.throws(() => restoreCard({ ...serializeCard(easy), stability: -1 }));
});
test("legacy history replay preserves the existing due instant and reproducible memory state", () => {
  const due = new Date("2026-10-25T08:00:00Z");
  const history = [{ rating: "good" as const, reviewedAt: now }, { rating: "hard" as const, reviewedAt: new Date(now.getTime() + 86400_000) }];
  const card = bootstrapCard(history, due, now);
  assert.equal(card.due.getTime(), due.getTime()); assert.equal(card.reps, 2);
  assert.deepEqual(serializeCard(bootstrapCard(history, due, now)), serializeCard(card));
});
