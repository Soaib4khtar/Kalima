import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { CalendarCheck, Check, Clock, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { fetchAlFatihah } from "@/lib/api";
import { safeHttpsUrl } from "../../quran/quran-learning";
import { learningApi, type AttemptSubmission, type PersistentSession, type Rating, type ReviewInbox, type ReviewPreview, type SavedAttempt } from "../learning-api";
import { reviewDelay, reviewTime } from "../review-utils";

const coordinateKey = (word: { surah: number; ayah: number; word: number }) => `${word.surah}:${word.ayah}:${word.word}`;
const ratingDescriptions = { again: "Forgot the meaning", hard: "Remembered with effort", good: "Remembered correctly", easy: "Remembered instantly" };

function DailyInbox() {
  const { session: auth } = useAuth();
  const user = auth!.user.id;
  const cache = useQueryClient();
  const key = ["learning", user, "inbox"];
  const inbox = useQuery({ queryKey: key, queryFn: async () => ({ ...await learningApi<ReviewInbox>("/reviews/inbox"), receivedAt: performance.now() }),
    retry: false, staleTime: 0, refetchInterval: 15_000 });
  const [tick, setTick] = useState(() => performance.now());
  useEffect(() => { const timer = window.setInterval(() => setTick(performance.now()), 1000); return () => window.clearInterval(timer); }, []);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState<AttemptSubmission | null>(null);
  const [notice, setNotice] = useState("");
  const [zone, setZone] = useState("");
  const data = inbox.data;
  const now = data ? reviewTime(data.serverNow, data.receivedAt, tick) : 0;
  const active = data?.session;
  const current = active?.items.find((item) => !item.reviewed && Date.parse(item.availableAt) <= now);
  const source = useQuery({ queryKey: ["quran", "surah", 1], queryFn: ({ signal }) => fetchAlFatihah(signal),
    enabled: Boolean(data && (data.items.length || active?.items.length)), gcTime: 0, retry: false });
  const ready = source.data?.status === "ready" ? source.data : null;
  const verse = ready?.surah.verses.find((entry) => entry.number === current?.ayah);
  const word = verse?.words.find((entry) => entry.position === current?.word);
  const cardKey = current ? `${active!.id}:${current.vocabularyId}:${current.revision}` : null;
  const preview = useQuery({ queryKey: ["learning", user, "preview", active?.id, current?.vocabularyId, current?.revision],
    queryFn: () => learningApi<ReviewPreview>(`/review-sessions/preview?sessionId=${active!.id}&vocabularyId=${current!.vocabularyId}`),
    enabled: Boolean(current && word?.translation && !pending), staleTime: 0, retry: false });
  const refresh = () => cache.invalidateQueries({ queryKey: ["learning", user] });
  const start = useMutation({ mutationFn: (includeNew: boolean) => learningApi<{ session: PersistentSession | null; unavailableWords: number }>("/review-sessions", "POST", { includeNew }),
    onSuccess: (result) => { setNotice(result.unavailableWords ? `${result.unavailableWords} word(s) remain due because source meanings are unavailable.` : result.session ? "Session ready. Take your time." : "Nothing is due right now."); void refresh(); } });
  const save = useMutation({ mutationFn: (input: AttemptSubmission) => learningApi<SavedAttempt>("/attempts", "POST", input),
    onSuccess: (result) => {
      setPending(null); setRevealed(null);
      setNotice(result.session.completed ? "Daily session saved. Your next reviews are scheduled." : "Review saved. Your schedule is up to date.");
      void refresh();
    } });
  const skip = useMutation({ mutationFn: () => learningApi("/review-sessions/skip", "POST", { sessionId: active!.id, vocabularyId: current!.vocabularyId, expectedRevision: current!.revision }),
    onSuccess: () => { setRevealed(null); setNotice("Word left due. Its learning schedule was not changed."); void refresh(); } });
  const timezone = useMutation({ mutationFn: (value: string) => learningApi("/profile", "PATCH", { timezone: value }), onSuccess: () => { setZone(""); void refresh(); } });
  function rate(rating: Rating) {
    if (!active || !current || pending || preview.data?.revision !== current.revision) return;
    const input = { clientAttemptId: crypto.randomUUID(), sessionId: active.id, vocabularyId: current.vocabularyId, rating, expectedRevision: current.revision };
    setPending(input); save.mutate(input);
  }
  const localDate = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: data!.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [...new Set(["UTC", deviceZone, data?.timezone ?? "UTC", ...Intl.supportedValuesOf("timeZone")])];
  if (inbox.isPending) return <div className="loading-panel" role="status">Opening your daily review inbox…</div>;
  if (inbox.isError || !data) return <section className="empty-panel" role="alert"><h2>We couldn’t load your reviews.</h2><p>{inbox.error?.message}</p><button className="primary-button" onClick={() => void inbox.refetch()}>Retry inbox</button></section>;
  const handled = active?.items.filter((item) => item.reviewed).length ?? 0;
  const waiting = active?.items.filter((item) => !item.reviewed) ?? [];
  const next = waiting[0]?.availableAt;
  const busy = Boolean(pending) || skip.isPending || inbox.isFetching;
  return <>
    <section className="surface-panel review-overview" aria-label="Daily review inbox">
      <div className="review-overview-heading"><div><p className="panel-kicker"><CalendarCheck size={16} /> DAILY REVIEW INBOX</p><h2>A little recall, every day.</h2><p>{data.localDate} · {data.timezone}</p></div><button className="icon-button" aria-label="Refresh inbox" disabled={inbox.isFetching} onClick={() => void inbox.refetch()}><RefreshCw size={18} /></button></div>
      <dl className="learning-stats">
        <div><dt>Due now</dt><dd>{data.dueNow}</dd></div><div><dt>Later today</dt><dd>{data.laterToday}</dd></div>
        <div><dt>Words reviewed today</dt><dd>{data.reviewedToday.words}</dd></div><div><dt>New saved words</dt><dd>{data.newWords}</dd></div>
      </dl>
      {data.overdue > 0 && <p className="review-overdue">{data.overdue} overdue {data.overdue === 1 ? "word is" : "words are"} included. No penalty—start wherever you are.</p>}
      <details className="review-timezone"><summary>Review timezone: {data.timezone}</summary><p>Your review day follows this saved timezone across devices. Changing it changes daily grouping, not scheduled instants.</p>
        <form onSubmit={(event) => { event.preventDefault(); timezone.mutate(zone || data.timezone); }}><label htmlFor="review-timezone">Timezone</label><select id="review-timezone" value={zone || data.timezone} disabled={timezone.isPending} onChange={(event) => setZone(event.target.value)}>{zones.map((value) => <option key={value}>{value}</option>)}</select><button className="reveal-button" disabled={timezone.isPending}>Save timezone</button></form>
        {deviceZone !== data.timezone && <button className="text-link" disabled={timezone.isPending} onClick={() => timezone.mutate(deviceZone)}>Use this device’s timezone ({deviceZone})</button>}
        {timezone.isError && <p role="alert">{timezone.error.message}</p>}
      </details>
      <p className="muted-copy">FSRS adapts intervals to your reviews using a 90% target retention. It is an estimate, not a promise or a mastery score. {data.reviewedToday.attempts} review {data.reviewedToday.attempts === 1 ? "event" : "events"} saved today.</p>
    </section>
    {notice && <p className="review-notice" role="status">{notice}</p>}
    {source.isError || (source.data && !ready) ? <section className="surface-panel review-source-state" role="alert"><h2>Source content is unavailable.</h2><p>Your inbox and schedules are safe. Arabic, meanings and recordings are never substituted.</p><button className="reveal-button" onClick={() => void source.refetch()}>Retry Quran source</button></section> : null}
    {active ? <section className="surface-panel daily-review-card" aria-label="Daily recall session">
      <div className="review-card-topline"><span><Sparkles size={16} /> Daily recall</span><span>{handled} / {active.items.length} words handled</span></div>
      <div className="recall-progress" role="progressbar" aria-label="Daily session progress" aria-valuemin={0} aria-valuemax={active.items.length} aria-valuenow={handled}><span style={{ width: `${handled / active.items.length * 100}%` }} /></div>
      {!current ? <div className="review-waiting"><Clock size={28} /><h2>Up to date for now.</h2><p>{waiting.length} {waiting.length === 1 ? "word returns" : "words return"} for learning or relearning.</p>{next && <p>Next card in <strong>{reviewDelay(next, now)}</strong> · {localDate(next)}</p>}<p>You can leave this page. Your session will resume when you return.</p></div> : source.isPending ? <p role="status">Loading the source-provided word…</p> : !word?.translation ? <div className="review-source-state"><h2>This card’s contextual meaning is unavailable.</h2>{word && <p className="daily-review-arabic" lang="ar" dir="rtl">{word.textUthmani}</p>}<p>The source has not supplied a usable meaning. Leave the word due and continue without recording a rating.</p><button className="reveal-button" disabled={busy} onClick={() => skip.mutate()}>Leave due and move on</button><button className="reveal-button" onClick={() => void source.refetch()}>Retry source</button></div> : <>
        <p className="recall-prompt">What does this word mean in its ayah?</p>
        <h2 className="daily-review-arabic" lang="ar" dir="rtl" translate="no">{word.textUthmani}</h2>
        {word.transliteration && <p className="quran-transliteration" translate="no">{word.transliteration}</p>}
        <Link className="recall-reference text-link" to={`/quran/al-fatihah?word=${coordinateKey(current)}`}>Quran {current.surah}:{current.ayah} · Word {current.word} · Open word details</Link>
        {safeHttpsUrl(word.audioUrl) && <audio key={word.audioUrl} aria-label="Review word audio" controls preload="none" src={safeHttpsUrl(word.audioUrl)!} />}
        {!safeHttpsUrl(word.audioUrl) && <p className="muted-copy">No verified word audio is available.</p>}
        <div className={`recall-answer${revealed === cardKey ? " is-visible" : ""}`} aria-live="polite">{revealed === cardKey ? <><small>Meaning in this ayah</small><strong translate="no" dir="auto">{word.translation}</strong></> : <span>Recall the meaning before revealing it.</span>}</div>
        {revealed !== cardKey ? <button className="primary-button review-reveal" disabled={busy} onClick={() => setRevealed(cardKey)}>Reveal meaning</button> : <>
          <p>How did you recall it?</p><div className="review-rating-grid">{(["again", "hard", "good", "easy"] as const).map((rating) => <button key={rating} className={`review-rating rating-${rating}`} disabled={busy || preview.isPending || preview.isError || preview.data?.revision !== current.revision} onClick={() => rate(rating)}><strong>{rating[0].toUpperCase() + rating.slice(1)}</strong><span>{ratingDescriptions[rating]}</span><small>{preview.data ? `About ${reviewDelay(preview.data.ratings[rating].dueAt, now)}` : "Calculating…"}</small></button>)}</div>
          <details className="review-context"><summary>Read the ayah in context</summary><p className="quran-ayah" lang="ar" dir="rtl" translate="no">{verse!.textUthmani}</p>{verse!.translation && <p dir="auto" translate="no">{verse!.translation.text}</p>}{safeHttpsUrl(verse!.audio?.url) && <audio aria-label="Review ayah audio" controls preload="none" src={safeHttpsUrl(verse!.audio?.url)!} />}</details>
        </>}
        {preview.isError && <p role="alert">{preview.error.message} <button className="reveal-button" onClick={() => { void inbox.refetch(); void preview.refetch(); }}>Refresh card schedule</button></p>}
      </>}
      {save.isPending && <p role="status">Saving your review…</p>}
      {save.isError && pending && <div role="alert"><p>{save.error.message} The result has not been confirmed.</p><button className="primary-button" onClick={() => save.mutate(pending)}>Retry saving</button><button className="reveal-button" onClick={async () => { const result = await inbox.refetch(); if (!result.isError) { setPending(null); setRevealed(null); save.reset(); } }}>Refresh saved session</button></div>}
      {skip.isError && <p role="alert">{skip.error.message}</p>}
      <p className="muted-copy">Learning and relearning cards return when due. Ratings and progress sync to your account; no need to keep this tab open.</p>
    </section> : <section className="surface-panel review-start" aria-label="Start daily reviews">
      {data.dueNow ? <><h2>Your words are ready.</h2><p>Review what’s due, one contextual meaning at a time.</p></> : <><Check size={27} /><h2>Nothing due right now.</h2><p>{data.nextDueAt ? `Your next scheduled word is due ${localDate(data.nextDueAt)}.` : "Bookmark words while reading, or try a saved recall in Al-Fatihah to begin your schedule."}</p></>}
      <div className="review-start-actions"><button className="primary-button" disabled={!data.dueNow || !ready || start.isPending} onClick={() => start.mutate(false)}>Review due words</button>{data.newWords > 0 && <button className="reveal-button" disabled={!ready || start.isPending} onClick={() => start.mutate(true)}>Learn saved words</button>}<Link className="text-link" to="/quran/al-fatihah">Read Al-Fatihah</Link></div>
      {source.isPending && data.items.length > 0 && <p role="status">Connecting to verified meanings…</p>}
      {start.isError && <p role="alert">{start.error.message}</p>}
    </section>}
    {ready && <section className="quran-attribution review-attribution" aria-label="Review content source" translate="no"><div><a href={safeHttpsUrl(ready.attribution.url) ?? undefined} target="_blank" rel="noreferrer">{ready.attribution.label}.</a><span>Word meanings: {ready.attribution.wordTranslationLanguage ?? "Source-provided"}</span>{ready.attribution.translationName && <span>Translation: {ready.attribution.translationName}</span>}{ready.attribution.translationAuthor && <span>Translation author: {ready.attribution.translationAuthor}</span>}{ready.attribution.recitationName && <span>Recitation: {ready.attribution.recitationName}</span>}</div></section>}
    <section className="surface-panel review-word-inbox" aria-label="Today’s vocabulary"><h2>Today’s vocabulary</h2><p className="muted-copy">Due now, scheduled later today, and new bookmarks. Future-due words stay on their schedule.</p>
      {!data.items.length ? <p>Your inbox is clear for this day.</p> : <ul>{data.items.map((item) => {
        const sourceWord = ready?.surah.verses.find((entry) => entry.number === item.ayah)?.words.find((entry) => entry.position === item.word);
        return <li key={item.vocabularyId}><Link to={`/quran/al-fatihah?word=${coordinateKey(item)}`}><span className="review-list-arabic" lang="ar" dir="rtl" translate="no">{sourceWord?.textUthmani ?? `Quran ${item.surah}:${item.ayah}`}</span><span>Quran {item.surah}:{item.ayah} · Word {item.word}</span></Link><div><span className={`review-state state-${item.state}`}>{item.state === "legacy" ? "Existing schedule" : item.state}</span><span>{!item.dueAt ? "Not reviewed yet" : Date.parse(item.dueAt) <= now ? "Due now" : localDate(item.dueAt)}</span></div></li>;
      })}</ul>}
    </section>
  </>;
}

export function DailyReviewsPage() {
  const { session, loading } = useAuth();
  return <><div className="page-heading"><div><p className="eyebrow">A DAILY MOMENT WITH YOUR WORDS</p><h1>Return. Recall.<br /><em>Remember.</em></h1><p className="heading-description">An adaptive review schedule for Quranic Arabic, one word in context at a time.</p></div></div>
    {loading ? <p role="status">Checking your session…</p> : !session ? <section className="empty-panel"><CalendarCheck size={32} /><h2>Your reviews, remembered.</h2><p>Sign in to see your private daily inbox. Quran reading and anonymous practice stay open to everyone.</p><Link className="primary-button" to="/account">Sign in for daily reviews</Link><Link className="text-link" to="/quran/al-fatihah">Read without signing in</Link></section> : <DailyInbox key={session.user.id} />}</>;
}
