import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth-context";
import type { QuranRecallCard } from "../quran/quran-learning";
import { learningApi, type AttemptSubmission, type PersistentSession, type Rating, type SavedAttempt } from "./learning-api";

export function PersistentRecall({ cards }: { cards: QuranRecallCard[] }) {
  const { session } = useAuth();
  const user = session?.user.id;
  const cache = useQueryClient();
  const key = ["learning", user, "session"];
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState<AttemptSubmission | null>(null);
  const [notice, setNotice] = useState("");
  const query = useQuery({ queryKey: key, queryFn: () => learningApi<PersistentSession | null>("/sessions/current"), enabled: Boolean(user), retry: false });
  const start = useMutation({
    mutationFn: (dueOnly: boolean) => learningApi<PersistentSession | null>("/sessions", "POST", { dueOnly }),
    onSuccess: (result) => { cache.setQueryData(key, result); setNotice(result ? "" : "No reviews are due right now."); },
  });
  const save = useMutation({
    mutationFn: (input: AttemptSubmission) => learningApi<SavedAttempt>("/attempts", "POST", input),
    onSuccess: (result) => {
      cache.setQueryData(key, result.session.completed ? null : result.session);
      void cache.invalidateQueries({ queryKey: ["learning", user] });
      setPending(null); setRevealed(null);
      setNotice(result.session.completed ? "Recall saved. Your next reviews are scheduled." : "Recall saved.");
    },
  });
  const item = query.data?.items.find((entry) => !entry.reviewed);
  const card = item ? cards.find((entry) => entry.id === `${item.surah}:${item.ayah}:${item.word}`) : undefined;
  const reviewed = query.data?.items.filter((entry) => entry.reviewed).length ?? 0;
  function rate(rating: Rating) {
    if (!query.data || !item || pending) return;
    const input = { clientAttemptId: crypto.randomUUID(), sessionId: query.data.id, vocabularyId: item.vocabularyId, rating };
    setPending(input); save.mutate(input);
  }
  return <section className="quran-recall surface-panel" aria-label="Saved meaning recall">
    <div className="recall-topline"><span>Saved meaning recall</span>{query.data && <span>{reviewed + 1} / {query.data.items.length}</span>}</div>
    {notice && <p role="status">{notice}</p>}
    {query.isPending ? <p role="status">Resuming your recall session…</p> : query.isError ? <p role="alert">{query.error.message} <button className="reveal-button" onClick={() => void query.refetch()}>Retry session</button></p> : !query.data ? <>
      <h2>A practice that stays with you.</h2><p>Reveal a contextual meaning, then honestly rate your recall. Progress syncs to your account.</p>
      <button className="primary-button" disabled={start.isPending} onClick={() => start.mutate(false)}>Start saved recall</button>
      <button className="reveal-button" disabled={start.isPending} onClick={() => start.mutate(true)}>Practice due words</button>
    </> : !card ? <p role="status">The current card’s source meaning is unavailable. Your saved session is safe; reload when the source is available.</p> : <>
      <div className="recall-progress" role="progressbar" aria-label="Saved recall progress" aria-valuemin={0} aria-valuemax={query.data.items.length} aria-valuenow={reviewed}><span style={{ width: `${reviewed / query.data.items.length * 100}%` }} /></div>
      <p className="recall-prompt">What does this word mean in its ayah?</p>
      <h2 lang="ar" dir="rtl">{card.textUthmani}</h2>
      <span className="recall-reference">{card.reference}</span>
      <div className={`recall-answer${revealed === card.id ? " is-visible" : ""}`} aria-live="polite">{revealed === card.id ? <><small>Contextual meaning</small><strong dir="auto">{card.meaning}</strong></> : <span>Think of the meaning before revealing it.</span>}</div>
      {revealed !== card.id ? <button className="reveal-button" disabled={Boolean(pending)} onClick={() => setRevealed(card.id)}>Reveal meaning</button> : <>
        <p>How was your recall? These are self-ratings.</p>
        <div className="recall-ratings">{(["again", "hard", "good", "easy"] as const).map((rating) => <button key={rating} className="reveal-button" disabled={Boolean(pending)} onClick={() => rate(rating)}>{rating[0].toUpperCase() + rating.slice(1)}</button>)}</div>
      </>}
    </>}
    {start.isError && <p role="alert">{start.error.message}</p>}
    {save.isPending && <p role="status">Saving recall…</p>}
    {save.isError && pending && <div role="alert"><p>{save.error.message} Your rating has not been confirmed.</p><button className="primary-button" onClick={() => save.mutate(pending)}>Retry saving</button><button className="reveal-button" onClick={async () => { const result = await query.refetch(); if (!result.isError) { setPending(null); setRevealed(null); save.reset(); } }}>Refresh saved session</button></div>}
    <p className="muted-copy">Starter schedule: Again 10 minutes; Hard at least 1 hour; Good at least 1 day; Easy at least 3 days. Further recalls extend intervals. This is not a mastery assessment.</p>
  </section>;
}
