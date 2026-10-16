import { useEffect, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, CheckCheck, CircleHelp, Layers, RotateCcw, Sparkles, Sprout, Trophy } from "lucide-react";
import { Link } from "react-router";
import { fetchVocabulary } from "@/lib/api";
import type { ApiVocabularyWord } from "@/lib/api";
import { VocabularyCard } from "@/features/vocabulary/components/VocabularyCard";
import { ReviewButtons } from "@/features/vocabulary/components/ReviewButtons";
import { createSession, restoreSession, reviewReducer, saveSession } from "../review-session";
import type { ReviewRating } from "../review-session";

export function LearningPage() {
  const { data: words, isPending, isError, refetch } = useQuery({ queryKey: ["vocabulary"], queryFn: () => fetchVocabulary() });
  return <>
    <div className="page-heading"><div><p className="eyebrow"><span className="status-dot" /> YOUR DAILY DOSE OF ARABIC</p><h1>A little practice.<br />A lot of <em>possibility.</em></h1><p className="heading-description">Build your vocabulary, one meaningful word at a time.</p></div><span className="heading-note"><Sprout size={19} /> Small steps, lasting progress</span></div>
    {isPending ? <div className="loading-panel" role="status"><span className="loading-orb" />Getting your words ready…</div>
      : isError || !words ? <div className="empty-panel"><CircleHelp size={32} /><h2>Your words couldn’t be loaded</h2><p>Please try again in a moment.</p><button className="primary-button" onClick={() => void refetch()}>Try again</button></div>
      : !words.length ? <div className="empty-panel"><BookOpen size={36} /><h2>Your journey starts with a word.</h2><p>Add your first Arabic word to start practicing.</p><Link className="primary-button" to="/vocabulary/new">Add your first word <ArrowRight size={16} /></Link></div>
      : <LearningSession words={words} />}
  </>;
}
function LearningSession({ words }: { words: ApiVocabularyWord[] }) {
  const [session, dispatch] = useReducer(reviewReducer, words, initialWords => {
    const ids = initialWords.map(word => word.id);
    try { return restoreSession(ids, sessionStorage); } catch { return createSession(ids); }
  });
  const currentWord = words.find(word => word.id === session.queue[0]);
  const progress = Math.round(session.known.length / session.wordIds.length * 100);
  const finished = session.queue.length === 0;
  useEffect(() => { try { saveSession(session, sessionStorage); } catch { /* Browser storage is optional. */ } }, [session]);
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || finished || !currentWord) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [contenteditable]")) return;
      if (event.code === "Space" && !session.showAnswer) { event.preventDefault(); dispatch({ type: "reveal" }); }
      const ratings: Record<string, ReviewRating> = { "1": "again", "2": "difficult", "3": "know" };
      if (session.showAnswer && ratings[event.key]) { event.preventDefault(); dispatch({ type: "rate", wordId: currentWord.id, rating: ratings[event.key] }); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentWord, finished, session.showAnswer]);
  const restart = () => dispatch({ type: "restart", wordIds: words.map(word => word.id) });
  return <div className="practice-layout">
    <section className="practice-main" aria-label="Flashcard practice">
      <div className="section-topline"><span><Layers size={16} /> Practice session</span><span className="quiet-label">ENGLISH <ArrowRight size={12} /> ARABIC</span></div>
      <div className="session-progress"><div><span>{session.known.length} of {session.wordIds.length} words learned</span><span>{progress}%</span></div><div className="progress-track" role="progressbar" aria-label="Words learned" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div></div>
      {finished ? <div className="completion-panel"><span className="completion-icon"><Trophy size={34} /></span><p className="eyebrow">SESSION COMPLETE</p><h2>Look how far<br />you’ve come.</h2><p>You learned {session.known.length} words in {session.reviews} reviews.<br />A little more Arabic is now a part of you.</p><button className="primary-button" onClick={restart}><RotateCcw size={16} />Practice again</button><Link className="text-link" to="/vocabulary">Explore your word library <ArrowRight size={15} /></Link></div>
        : currentWord ? <VocabularyCard key={currentWord.id} word={currentWord} showAnswer={session.showAnswer} onReveal={() => dispatch({ type: "reveal" })}><ReviewButtons onRate={rating => dispatch({ type: "rate", wordId: currentWord.id, rating })} /></VocabularyCard>
        : <div className="empty-panel"><h2>Your library has changed</h2><button className="primary-button" onClick={restart}>Start a fresh session</button></div>}
      <div className="practice-caption"><span><Check size={14} /> Progress saved for this browser session</span><button className="text-button" onClick={restart}><RotateCcw size={13} />Restart</button></div>
      <p className="review-feedback" role="status" aria-live="polite">{session.feedback || "Take your time. Learning isn’t a race."}</p>
    </section>
    <aside className="practice-sidebar">
      <section className="surface-panel session-panel"><p className="panel-kicker"><Sparkles size={15} /> THE BIGGER PICTURE</p><h2>Every word counts.</h2><p className="muted-copy">You’re building a bridge to a new language. Keep going.</p>
        <div className="session-stat"><span className="stat-icon green"><CheckCheck size={18} /></span><div><strong>{session.known.length}</strong><span>Words learned</span></div></div>
        <div className="session-stat"><span className="stat-icon amber"><RotateCcw size={17} /></span><div><strong>{session.repeats}</strong><span>Repeat reviews queued</span></div></div>
        <div className="session-stat"><span className="stat-icon blue"><Layers size={18} /></span><div><strong>{session.queue.length}</strong><span>Words left to practice</span></div></div>
      </section>
      <section className="tip-panel"><span className="tip-icon"><Sprout size={22} /></span><p className="panel-kicker">A LITTLE LEARNING WISDOM</p><h3>Recall before you reveal.</h3><p>Try saying the Arabic word out loud before flipping the card. A little effort helps it stick.</p></section>
      <Link className="library-shortcut" to="/vocabulary"><span><BookOpen size={18} /><span>Your word library<small>{words.length} words to discover</small></span></span><ArrowRight size={17} /></Link>
    </aside>
  </div>;
}
