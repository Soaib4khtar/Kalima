/** A boundary-triggered refresh, not a polling loop or client reward clock. */
export function nextWorldRefresh(serverNow: string, resetsAt: string | null, nextDueAt: string | null): number | null {
  const now = Date.parse(serverNow);
  if (!Number.isFinite(now)) return null;
  const future = [resetsAt, nextDueAt].flatMap(value => {
    const at = value ? Date.parse(value) : NaN;
    return Number.isFinite(at) && at > now ? [at - now] : [];
  });
  return future.length ? Math.min(2_147_000_000, Math.max(1000, Math.min(...future) + 250)) : null;
}
