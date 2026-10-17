import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "../auth/auth-context";
import { learningApi, type Bookmark, type HistoryItem, type LearningProgress } from "./learning-api";

export function LearningSummary() {
  const { session } = useAuth();
  const user = session?.user.id;
  const progress = useQuery({ queryKey: ["learning", user, "progress"], queryFn: () => learningApi<LearningProgress>("/progress"), enabled: Boolean(user), retry: false });
  const bookmarks = useQuery({ queryKey: ["learning", user, "bookmarks"], queryFn: () => learningApi<{ items: Bookmark[]; nextCursor: string | null }>("/bookmarks"), enabled: Boolean(user), retry: false });
  const history = useQuery({ queryKey: ["learning", user, "history"], queryFn: () => learningApi<{ items: HistoryItem[]; nextCursor: string | null }>("/history"), enabled: Boolean(user), retry: false });
  if (!user) return null;
  return <section className="surface-panel learning-summary" aria-label="Your learning progress">
    <h2>Your learning</h2>
    {progress.isPending ? <p role="status">Loading saved progress…</p> : progress.isError ? <p role="alert">{progress.error.message} <button className="reveal-button" onClick={() => void progress.refetch()}>Retry progress</button></p> : <dl className="learning-stats">
      <div><dt>Recall attempts</dt><dd>{progress.data.totalReviews}</dd></div>
      <div><dt>Words reviewed</dt><dd>{progress.data.reviewedWords}</dd></div>
      <div><dt>Reviews due</dt><dd>{progress.data.dueWords}</dd></div>
      <div><dt>Bookmarks</dt><dd>{progress.data.bookmarkedWords}</dd></div>
    </dl>}
    <p className="muted-copy">Self-rated recall, not a mastery score. Saved records contain references and activity, not Quran text.</p>
    <h3>Bookmarked words</h3>
    {bookmarks.isPending ? <p role="status">Loading bookmarks…</p> : bookmarks.isError ? <p role="alert">{bookmarks.error.message}</p> : bookmarks.data?.items.length ? <ul className="bookmark-list">{bookmarks.data.items.map((item) => <li key={item.vocabularyId}><Link to={`/quran/al-fatihah?word=${item.surah}:${item.ayah}:${item.word}`}>Quran {item.surah}:{item.ayah} · Word {item.word}</Link></li>)}</ul> : <p>No saved words yet.</p>}
    <h3>Recent practice</h3>
    {history.isPending ? <p role="status">Loading learning history…</p> : history.isError ? <p role="alert">{history.error.message}</p> : history.data?.items.length ? <ul className="learning-history">{history.data.items.slice(0, 5).map((item) => <li key={item.id}>Quran {item.surah}:{item.ayah} · Word {item.word} — {item.rating} <time dateTime={item.reviewedAt}>{new Date(item.reviewedAt).toLocaleString()}</time></li>)}</ul> : <p>No recall attempts saved yet.</p>}
  </section>;
}
