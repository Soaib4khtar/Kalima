export type ReviewRating = "again" | "difficult" | "know";
export interface ReviewSession {
  wordIds: string[]; queue: string[]; known: string[];
  reviews: number; repeats: number; showAnswer: boolean; feedback: string;
}
export type ReviewAction = { type: "reveal" } | { type: "rate"; wordId: string; rating: ReviewRating } | { type: "restart"; wordIds: string[] };
export function createSession(wordIds: string[]): ReviewSession {
  const uniqueIds = [...new Set(wordIds)];
  return { wordIds: uniqueIds, queue: uniqueIds, known: [], reviews: 0, repeats: 0, showAnswer: false, feedback: "" };
}
export function reviewReducer(state: ReviewSession, action: ReviewAction): ReviewSession {
  if (action.type === "restart") return createSession(action.wordIds);
  if (action.type === "reveal") return state.queue.length ? { ...state, showAnswer: true } : state;
  // Ignore stale clicks and ratings submitted before revealing the answer.
  if (!state.showAnswer || state.queue[0] !== action.wordId) return state;
  const queue = state.queue.slice(1);
  const known = [...state.known];
  const repeat = action.rating !== "know";
  if (repeat) queue.splice(Math.min(action.rating === "again" ? 2 : 5, queue.length), 0, action.wordId);
  else known.push(action.wordId);
  return { ...state, queue, known, reviews: state.reviews + 1, repeats: state.repeats + Number(repeat), showAnswer: false,
    feedback: repeat ? "Word queued for another look." : "Word learned. Nicely done!" };
}
const SESSION_KEY = "kalima-review-v1";
export function restoreSession(wordIds: string[], storage: Pick<Storage, "getItem">): ReviewSession {
  try {
    const saved: unknown = JSON.parse(storage.getItem(SESSION_KEY) ?? "null");
    if (typeof saved !== "object" || !saved) return createSession(wordIds);
    const state = saved as ReviewSession;
    const ids = new Set(wordIds);
    if (!Array.isArray(state.wordIds) || !Array.isArray(state.queue) || !Array.isArray(state.known)) return createSession(wordIds);
    if (state.wordIds.some(id => typeof id !== "string" || !ids.has(id))) return createSession(wordIds);
    const members = new Set(state.wordIds);
    const partition = [...state.queue, ...state.known];
    if (new Set(partition).size !== state.wordIds.length || partition.length !== state.wordIds.length || partition.some(id => !members.has(id))) return createSession(wordIds);
    if (!Number.isSafeInteger(state.reviews) || state.reviews < 0 || !Number.isSafeInteger(state.repeats) || state.repeats < 0 || state.repeats > state.reviews) return createSession(wordIds);
    if (!state.wordIds.length && wordIds.length) return createSession(wordIds);
    return { ...state, showAnswer: false, feedback: "" };
  } catch { return createSession(wordIds); }
}
export function saveSession(state: ReviewSession, storage: Pick<Storage, "setItem">) {
  storage.setItem(SESSION_KEY, JSON.stringify(state));
}
