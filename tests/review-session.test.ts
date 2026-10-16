import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, reviewReducer, restoreSession, saveSession } from '../src/features/learning/review-session.ts';
import type { ReviewRating, ReviewSession } from '../src/features/learning/review-session.ts';
const rate = (state: ReviewSession, rating: ReviewRating) => reviewReducer(reviewReducer(state, { type: 'reveal' }), { type: 'rate', wordId: state.queue[0], rating });

test('Again repeats after two available cards without advancing learned progress', () => {
  const next = rate(createSession(['a', 'b', 'c', 'd']), 'again');
  assert.deepEqual(next.queue, ['b', 'c', 'a', 'd']);
  assert.deepEqual(next.known, []);
  assert.equal(next.repeats, 1);
});
test('Difficult repeats after five available cards', () => {
  assert.deepEqual(rate(createSession(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'difficult').queue, ['b', 'c', 'd', 'e', 'f', 'a', 'g']);
});
test('Know removes a word and the session only finishes after every word is known', () => {
  let state = rate(createSession(['a', 'b']), 'again');
  state = rate(state, 'know');
  assert.deepEqual(state.queue, ['a']);
  assert.deepEqual(state.known, ['b']);
  state = rate(state, 'know');
  assert.deepEqual(state.queue, []);
  assert.deepEqual(state.known, ['b', 'a']);
  assert.equal(state.reviews, 3);
});
test('An unknown last word keeps repeating until it is known', () => {
  const state = rate(createSession(['a']), 'again');
  assert.deepEqual(state.queue, ['a']);
  assert.equal(state.known.length, 0);
  assert.deepEqual(rate(state, 'difficult').queue, ['a']);
});
test('Unrevealed cards and duplicate or stale clicks cannot advance the session', () => {
  const initial = createSession(['a', 'b']);
  assert.equal(reviewReducer(initial, { type: 'rate', wordId: 'a', rating: 'know' }), initial);
  const next = rate(initial, 'know');
  assert.equal(reviewReducer(next, { type: 'rate', wordId: 'a', rating: 'know' }), next);
  const revealed = reviewReducer(next, { type: 'reveal' });
  assert.equal(reviewReducer(revealed, { type: 'rate', wordId: 'a', rating: 'know' }), revealed);
});
test('Progress survives reloads and navigation without exposing the next answer', () => {
  let saved = '';
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  const state = rate(createSession(['a', 'b', 'c']), 'know');
  saveSession({ ...state, showAnswer: true }, storage);
  const restored = restoreSession(['a', 'b', 'c', 'new'], storage);
  assert.deepEqual(restored.queue, ['b', 'c']);
  assert.deepEqual(restored.known, ['a']);
  assert.equal(restored.showAnswer, false);
  assert.equal(restored.wordIds.includes('new'), false);
});
test('Corrupt, duplicated, or removed vocabulary in stored progress starts a safe session', () => {
  for (const saved of ['invalid', JSON.stringify({ queue: [] }), JSON.stringify({ ...createSession(['a', 'b']), queue: ['a', 'a'] }), JSON.stringify(createSession(['deleted']))]) {
    assert.deepEqual(restoreSession(['a', 'b'], { getItem: () => saved }), createSession(['a', 'b']));
  }
});
test('Restart includes newly added vocabulary and clears old progress', () => {
  const state = rate(createSession(['a']), 'know');
  assert.deepEqual(reviewReducer(state, { type: 'restart', wordIds: ['a', 'new'] }), createSession(['a', 'new']));
});
