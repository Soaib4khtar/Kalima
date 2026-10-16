import { useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  CloudOff,
  Headphones,
  Lightbulb,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  fetchAlFatihah,
  type QuranAttribution,
  type QuranSurah,
  type QuranVerse,
  type QuranWordOccurrence,
} from "@/lib/api";
import {
  createQuranRecallCards,
  createQuranRecallSession,
  occurrenceId,
  quranRecallReducer,
  safeHttpsUrl,
  type QuranRecallCard,
} from "../quran-learning";

interface SelectedOccurrence {
  verse: QuranVerse;
  word: QuranWordOccurrence;
}

function findOccurrence(
  surah: QuranSurah,
  selectedId: string | null,
): SelectedOccurrence | null {
  if (!selectedId) return null;
  for (const verse of surah.verses) {
    for (const word of verse.words) {
      const id = occurrenceId(surah.number, verse.number, word.position);
      if (id === selectedId) return { verse, word };
    }
  }
  return null;
}

function SourceAttribution({ attribution }: { attribution: QuranAttribution }) {
  const sourceUrl = safeHttpsUrl(attribution.url);
  const creditLabel = `${attribution.label}.`;
  return <section className="quran-attribution" aria-label="Content source" translate="no">
    <ShieldCheck size={17} aria-hidden="true" />
    <div>
      <p>Source attribution</p>
      <strong>{sourceUrl
        ? <a href={sourceUrl} target="_blank" rel="noreferrer">{creditLabel}</a>
        : creditLabel}</strong>
      {attribution.translationName && <span>Translation: {attribution.translationName}</span>}
      {attribution.translationAuthor && <span>Translation author: {attribution.translationAuthor}</span>}
      {attribution.translationLanguage && <span>Translation language: {attribution.translationLanguage}</span>}
      {attribution.wordTranslationLanguage && <span>Word meanings: {attribution.wordTranslationLanguage}</span>}
      {attribution.recitationName && <span>Recitation: {attribution.recitationName}</span>}
      {attribution.recitationStyle && <span>Recitation style: {attribution.recitationStyle}</span>}
    </div>
  </section>;
}

function WordDetails({
  occurrence,
}: {
  occurrence: SelectedOccurrence | null;
}) {
  if (!occurrence) {
    return <aside className="quran-word-panel surface-panel" aria-live="polite">
      <span className="quran-panel-icon"><Lightbulb size={21} aria-hidden="true" /></span>
      <p className="panel-kicker">EXPLORE THE AYAH</p>
      <h2>Select a word</h2>
      <p className="muted-copy">Choose any highlighted Arabic word to see its contextual meaning and Quranic reference.</p>
    </aside>;
  }

  const { word } = occurrence;
  const audioUrl = safeHttpsUrl(word.audioUrl);
  return <aside className="quran-word-panel surface-panel" aria-live="polite">
    <div className="quran-word-heading">
      <div>
        <p className="panel-kicker">SELECTED WORD</p>
        <h2 lang="ar" dir="rtl">{word.textUthmani}</h2>
      </div>
      <span className="word-position-badge">{word.position}</span>
    </div>
    {word.transliteration && <p className="quran-transliteration">{word.transliteration}</p>}
    <div className="word-detail-block">
      <span>Meaning in this ayah</span>
      {word.translation
        ? <strong dir="auto">{word.translation}</strong>
        : <p>Contextual meaning is not available from the current source.</p>}
    </div>
    <div className="quran-reference"><MapPin size={15} aria-hidden="true" /><span><small>Quranic reference</small>{word.reference.verseKey} · Word {word.reference.word}</span></div>
    <div className="quran-audio-block">
      <div><Volume2 size={16} aria-hidden="true" /><span>Word audio</span></div>
      {audioUrl
        ? <audio key={audioUrl} aria-label={`Word ${word.position} audio`} controls preload="none" src={audioUrl}>Your browser does not support audio playback.</audio>
        : <p>No verified recording is available for this word.</p>}
    </div>
  </aside>;
}

function QuranVerseCard({
  verse,
  surahNumber,
  selectedId,
  selectedOccurrence,
  onSelect,
}: {
  verse: QuranVerse;
  surahNumber: number;
  selectedId: string | null;
  selectedOccurrence: SelectedOccurrence | null;
  onSelect: (id: string) => void;
}) {
  const verseAudioUrl = safeHttpsUrl(verse.audio?.url);
  return <article className="quran-verse-card">
    <header>
      <span>Ayah {verse.number}</span>
      <span>{verse.verseKey}</span>
    </header>
    <p className="quran-ayah" lang="ar" dir="rtl">{verse.textUthmani}</p>
    {verse.translation && <p className="quran-verse-translation" dir="auto">{verse.translation.text}</p>}
    {verseAudioUrl && <div className="quran-verse-audio">
      <span><Headphones size={14} aria-hidden="true" /> Ayah audio</span>
      <audio aria-label={`Ayah ${verse.number} audio`} controls preload="none" src={verseAudioUrl}>Your browser does not support audio playback.</audio>
    </div>}
    {!!verse.words.length && <div className="quran-word-section">
      <p>Select a word to explore</p>
      <div className="quran-word-list" lang="ar" dir="rtl">
        {verse.words.map((word) => {
          const id = occurrenceId(surahNumber, verse.number, word.position);
          return <button
            key={id}
            type="button"
            className={`quran-word-button${selectedId === id ? " is-selected" : ""}`}
            aria-pressed={selectedId === id}
            aria-label={`Word ${word.position} in ayah ${verse.number}: ${word.textUthmani}`}
            onClick={() => onSelect(id)}
          >{word.textUthmani}</button>;
        })}
      </div>
    </div>}
    {selectedOccurrence?.verse.number === verse.number && <div className="quran-inline-word-panel">
      <WordDetails occurrence={selectedOccurrence} />
    </div>}
  </article>;
}

function RecallChallenge({ cards }: { cards: QuranRecallCard[] }) {
  const [session, dispatch] = useReducer(
    quranRecallReducer,
    cards.map((card) => card.id),
    createQuranRecallSession,
  );
  const cardById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const currentCard = cardById.get(session.cardIds[session.currentIndex]);

  if (!currentCard || session.complete) {
    return <section className="quran-recall surface-panel" aria-labelledby="recall-title">
      <div className="recall-complete-icon"><Check size={22} aria-hidden="true" /></div>
      <p className="panel-kicker">RECALL COMPLETE</p>
      <h2 id="recall-title">A thoughtful first pass.</h2>
      <p>You reviewed {session.cardIds.length} contextual {session.cardIds.length === 1 ? "meaning" : "meanings"} from this surah.</p>
      <button className="primary-button" type="button" onClick={() => dispatch({ type: "restart" })}><RotateCcw size={15} />Practice again</button>
    </section>;
  }

  return <section className="quran-recall surface-panel" aria-labelledby="recall-title">
    <div className="recall-topline">
      <div><Sparkles size={17} aria-hidden="true" /><span>Meaning recall</span></div>
      <span>{session.currentIndex + 1} / {session.cardIds.length}</span>
    </div>
    <div className="recall-progress" role="progressbar" aria-label="Recall progress" aria-valuemin={0} aria-valuemax={session.cardIds.length} aria-valuenow={session.currentIndex}>
      <span style={{ width: `${session.currentIndex / session.cardIds.length * 100}%` }} />
    </div>
    <p className="recall-prompt">What does this word mean in its ayah?</p>
    <h2 id="recall-title" lang="ar" dir="rtl">{currentCard.textUthmani}</h2>
    {currentCard.transliteration && <p className="quran-transliteration">{currentCard.transliteration}</p>}
    <span className="recall-reference">{currentCard.reference}</span>
    <div className={`recall-answer${session.revealed ? " is-visible" : ""}`} aria-live="polite">
      {session.revealed ? <><small>Contextual meaning</small><strong dir="auto">{currentCard.meaning}</strong></> : <span>Think of the meaning before revealing it.</span>}
    </div>
    {session.revealed
      ? <button className="primary-button recall-action" type="button" onClick={() => dispatch({ type: "next" })}>Next word <ArrowRight size={15} /></button>
      : <button className="reveal-button recall-action" type="button" onClick={() => dispatch({ type: "reveal" })}>Reveal meaning</button>}
  </section>;
}

function NotReadyState({
  status,
  reason,
  attribution,
  onRetry,
}: {
  status: "unconfigured" | "unavailable";
  reason: string;
  attribution: QuranAttribution;
  onRetry: () => void;
}) {
  const isUnconfigured = status === "unconfigured";
  return <div className="quran-state-stack">
    <section className="empty-panel quran-unavailable" role="status">
      {isUnconfigured ? <CircleAlert size={34} /> : <CloudOff size={34} />}
      <p className="eyebrow">{isUnconfigured ? "SOURCE SETUP NEEDED" : "CONTENT UNAVAILABLE"}</p>
      <h2>{isUnconfigured ? "Al-Fatihah isn’t connected yet." : "Al-Fatihah can’t be loaded right now."}</h2>
      <p>{reason}</p>
      <p className="quran-honesty-note">Kalima will not substitute unverified text or recordings.</p>
      <button className="reveal-button quran-state-retry" type="button" onClick={onRetry}><RefreshCw size={15} />Check again</button>
    </section>
    <SourceAttribution attribution={attribution} />
  </div>;
}

function ReadySurah({ surah, attribution }: { surah: QuranSurah; attribution: QuranAttribution }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOccurrence = findOccurrence(surah, selectedId);
  const recallCards = useMemo(() => createQuranRecallCards(surah), [surah]);
  const wordCount = surah.verses.reduce((total, verse) => total + verse.words.length, 0);

  if (!surah.verses.length) {
    return <section className="empty-panel quran-unavailable" role="status">
      <CloudOff size={34} />
      <h2>No verified ayahs were returned.</h2>
      <p>The source responded without verse content, so Kalima has nothing authentic to display.</p>
    </section>;
  }

  return <div className="quran-ready-content" translate="no">
    <section className="quran-surah-overview surface-panel" aria-label="Surah overview">
      <div>
        <p className="panel-kicker"><ShieldCheck size={14} /> SOURCE-PROVIDED QURANIC TEXT</p>
        <h2>{surah.nameTransliterated}</h2>
        <p>{surah.translatedName}</p>
      </div>
      <p className="quran-surah-name" lang="ar" dir="rtl">{surah.nameArabic}</p>
      <dl>
        <div><dt>Surah</dt><dd>{surah.number}</dd></div>
        <div><dt>Ayahs</dt><dd>{surah.verses.length}</dd></div>
        <div><dt>Word occurrences</dt><dd>{wordCount}</dd></div>
      </dl>
    </section>

    <div className="quran-learning-grid">
      <section className="quran-verses" aria-labelledby="ayahs-heading">
        <div className="section-topline"><span><BookOpen size={17} /> <span id="ayahs-heading">Read and explore</span></span><span className="quiet-label">SELECT ANY WORD</span></div>
        <div className="quran-verse-list">
          {surah.verses.map((verse) => <QuranVerseCard
            key={verse.verseKey}
            verse={verse}
            surahNumber={surah.number}
            selectedId={selectedId}
            selectedOccurrence={selectedOccurrence}
            onSelect={setSelectedId}
          />)}
        </div>
      </section>
      <div className="quran-detail-column">
        <WordDetails occurrence={selectedOccurrence} />
        <SourceAttribution attribution={attribution} />
      </div>
    </div>

    {recallCards.length > 0
      ? <RecallChallenge key={recallCards.map((card) => card.id).join("|")} cards={recallCards} />
      : <section className="quran-practice-locked surface-panel">
          <Lightbulb size={20} aria-hidden="true" />
          <div><strong>Recall practice is waiting for verified meanings.</strong><p>The challenge will appear when the connected source provides contextual word translations.</p></div>
        </section>}
  </div>;
}

export function AlFatihahPage() {
  const query = useQuery({
    queryKey: ["quran", "surah", 1],
    queryFn: ({ signal }) => fetchAlFatihah(signal),
    gcTime: 0,
  });

  return <>
    <div className="page-heading quran-page-heading">
      <div>
        <p className="eyebrow"><span className="status-dot" /> QURANIC ARABIC, IN CONTEXT</p>
        <h1>Read Al-Fatihah.<br /><em>Meet every word.</em></h1>
        <p className="heading-description">Read each ayah as provided by the connected source, then explore word meanings in their Quranic context.</p>
      </div>
      <span className="heading-note"><Headphones size={19} /> Audio appears only when verified and available</span>
    </div>

    {query.isPending
      ? <div className="loading-panel" role="status"><span className="loading-orb" />Connecting to the Quranic content source…</div>
      : query.isError || !query.data
        ? <section className="empty-panel quran-unavailable" role="alert">
            <CircleAlert size={34} />
            <h2>We couldn’t load Al-Fatihah.</h2>
            <p>{query.error instanceof Error ? query.error.message : "The Quranic content service could not be reached."}</p>
            <button className="primary-button" type="button" onClick={() => void query.refetch()}><RefreshCw size={15} />Try again</button>
          </section>
        : query.data.status !== "ready"
          ? <NotReadyState status={query.data.status} reason={query.data.reason} attribution={query.data.attribution} onRetry={() => void query.refetch()} />
          : <ReadySurah surah={query.data.surah} attribution={query.data.attribution} />}
  </>;
}
