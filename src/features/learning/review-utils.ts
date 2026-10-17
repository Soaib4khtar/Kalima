/** Calibrate against server time using a monotonic browser timer, not its wall clock. */
export function reviewTime(serverNow: string, receivedAt: number, monotonicNow: number): number {
  return Date.parse(serverNow) + Math.max(0, monotonicNow - receivedAt);
}
export function reviewDelay(dueAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(dueAt) - now) / 1000));
  if (seconds < 60) return seconds ? `${seconds}s` : "now";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
