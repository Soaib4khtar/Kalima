import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextWorldRefresh } from '../src/features/game/game-time.ts';

test('world refresh follows the next server due/reset boundary, never device wall time', () => {
  assert.equal(nextWorldRefresh('2026-10-18T18:29:00Z','2026-10-18T18:30:00Z','2026-10-18T18:29:30Z'),30_250);
  assert.equal(nextWorldRefresh('2026-10-18T18:29:00Z','2026-10-18T18:30:00Z',null),60_250);
});
test('stale and malformed boundaries do not cause a game polling loop', () => {
  assert.equal(nextWorldRefresh('invalid','2099-01-01',null),null);
  assert.equal(nextWorldRefresh('2026-10-18T18:30:00Z','2026-10-18T18:30:00Z','invalid'),null);
  assert.equal(nextWorldRefresh('2026-10-18T18:30:00Z',null,null),null);
});
test('world timers handle DST instants and clamp browser timeout overflow', () => {
  assert.equal(nextWorldRefresh('2026-11-01T04:00:00Z','2026-11-02T05:00:00Z',null),25*3600_000+250);
  assert.equal(nextWorldRefresh('2026-10-18T18:30:00Z',null,'2099-01-01T00:00:00Z'),2_147_000_000);
});
