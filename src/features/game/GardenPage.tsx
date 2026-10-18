import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Flower2, X } from 'lucide-react';
import { fetchAlFatihah } from '@/lib/api';
import { safeHttpsUrl } from '../quran/quran-learning';
import { useAuth } from '../auth/auth-context';
import { GameLayout } from './GameLayout';
import { gameApi, plantStages, type Challenge, type ChallengeResult, type GardenPage as Page, type Plant } from './game-api';
import { WordPlant } from './WorldArt';
import { GameError } from './HomePage';

function KnowledgeCheck({ plant }: { plant: Plant }) {
  const { session } = useAuth(), cache = useQueryClient();
  const issue = useMutation({ mutationFn: () => gameApi<Challenge>('/challenges', 'POST', { vocabularyId: plant.vocabularyId }) });
  const answer = useMutation({ mutationFn: (choiceId: string) => gameApi<ChallengeResult>(`/challenges/${issue.data!.id}/answer`, 'POST', { choiceId }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['learning', session!.user.id] }); } });
  const challenge = issue.data;
  return <section className="knowledge-check" aria-label="Knowledge check"><h3>A moment of understanding</h3><p>Match this occurrence to its source-provided meaning. Checks are graded on the server; this is practice, not proof of unaided recall.</p>
    {!challenge ? <button className="reveal-button" disabled={issue.isPending} onClick={() => issue.mutate()}>{issue.isPending ? 'Preparing verified meanings…' : 'Start knowledge check'}</button> : <>
      <p lang="ar" dir="rtl" translate="no" className="garden-arabic">{challenge.prompt}</p><p>Which contextual meaning does the source attach to this word?</p>
      <div className="challenge-choices">{challenge.choices.map(c => <button className={`reveal-button${answer.data?.correctChoice === c.id ? ' correct-choice' : ''}`} key={c.id} disabled={answer.isPending || Boolean(answer.data) || answer.isError} onClick={() => answer.mutate(c.id)}>{c.text}</button>)}</div>
      {answer.isPending && <p role="status">Checking your answer…</p>}
      {answer.data && <p role="status">{answer.data.correct ? 'Correct. Knowledge check saved.' : 'A useful moment of learning. The highlighted meaning is the source answer. Try your next scheduled review when it’s due.'}</p>}
      {answer.isError && <div role="alert"><p>{answer.error.message}</p><button className="reveal-button" disabled={answer.isPending} onClick={() => answer.mutate(answer.variables!)}>Retry same answer</button><button className="text-link" onClick={() => { issue.reset(); answer.reset(); }}>Return to word</button></div>}
      <p className="world-fine-print">One answer per check. Repeated checks of the same word have capped rewards. {challenge.attribution.label}.</p>
    </>}
    {issue.isError && <p role="alert">{issue.error.message}</p>}
  </section>;
}
function PlantDetails({ plant, close }: { plant: Plant; close: () => void }) {
  const source = useQuery({ queryKey: ['quran', 'surah', 1], queryFn: ({ signal }) => fetchAlFatihah(signal), gcTime: 0, retry: false });
  const ready = source.data?.status === 'ready' ? source.data : null;
  const word = ready?.surah.verses.find(v => v.number === plant.ayah)?.words.find(w => w.position === plant.word);
  return <aside className="garden-details surface-panel" aria-label="Garden word details"><div className="world-section-title"><h2>Your growing word</h2><button className="icon-button" aria-label="Close word details" onClick={close}><X size={20} /></button></div>
    <WordPlant stage={plant.stage} variant={plant.word} attention={plant.health !== 'resting'} /><p className="panel-kicker">{plantStages[plant.stage - 1]} · {plant.health.replaceAll('-', ' ')}</p>
    {source.isPending ? <p role="status">Loading authentic word details…</p> : word ? <><h3 className="garden-arabic" lang="ar" dir="rtl" translate="no">{word.textUthmani}</h3>{word.transliteration && <p>{word.transliteration}</p>}<p dir="auto" translate="no">{word.translation ?? 'The contextual meaning is unavailable.'}</p>{safeHttpsUrl(word.audioUrl) && <audio aria-label="Garden word audio" controls preload="none" src={safeHttpsUrl(word.audioUrl)!} />}</> : <p role="status">Source word details are unavailable. Your plant and review schedule are safe.</p>}
    <Link className="text-link" to={`/quran/al-fatihah?word=${plant.surah}:${plant.ayah}:${plant.word}`}>Quran {plant.surah}:{plant.ayah} · Word {plant.word} →</Link>
    <p>{plant.reviews} recorded recalls. Current health is an estimate; earned growth is never destroyed.</p><Link className="primary-button" to="/reviews">Open legitimate scheduled reviews</Link>
    {ready && <p className="world-fine-print"><a href={safeHttpsUrl(ready.attribution.url) ?? undefined} target="_blank" rel="noreferrer">{ready.attribution.label}.</a> Meanings: {ready.attribution.wordTranslationLanguage ?? 'source-provided'}</p>}
    <KnowledgeCheck key={plant.vocabularyId} plant={plant} />
  </aside>;
}
function Garden() {
  const { session } = useAuth();
  const [stage, setStage] = useState(''), [selected, select] = useState<Plant | null>(null);
  const [cursors, setCursors] = useState(['']);
  const cursor = cursors.at(-1)!;
  const plants = useQuery({ queryKey: ['learning', session!.user.id, 'game', 'garden', stage, cursor],
    queryFn: () => gameApi<Page>(`/garden?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(stage ? { stage } : {}) })}`), retry: false });
  const items = plants.data?.items ?? [];
  return <><header className="world-heading"><p className="eyebrow">ROOTED IN REAL LEARNING</p><h1>Your Memory <em>Garden.</em></h1><p>Every plant is a word you’ve practiced. Give memory time and room to grow.</p></header>
    <div className="garden-toolbar"><span>Seed → Sprout → Growing → Mature → Bloom</span><label>Growth stage <select value={stage} onChange={e => { setStage(e.target.value); setCursors(['']); select(null); }}><option value="">All plants</option>{plantStages.map((s,i) => <option key={s} value={i+1}>{s}</option>)}</select></label></div>
    {plants.isPending ? <p role="status">Opening your garden…</p> : plants.isError ? <GameError retry={() => void plants.refetch()} message={plants.error.message} /> : !items.length ? <section className="world-empty surface-panel"><Flower2 size={36} /><h2>{stage ? 'No plants at this stage yet.' : 'A little space for your first word.'}</h2><p>Complete an honest recall to plant a seed. Bookmarking alone never creates mastery or XP.</p><Link className="primary-button" to="/quran/al-fatihah">Begin with Al-Fatihah</Link></section> : <div className={`garden-layout${selected ? ' has-selection' : ''}`}><section className="garden-plots" aria-label="Vocabulary plants">{items.map(p => <button key={p.vocabularyId} className={`garden-plot${selected?.vocabularyId === p.vocabularyId ? ' selected-plot' : ''}`} aria-pressed={selected?.vocabularyId === p.vocabularyId} onClick={() => select(p)}><WordPlant stage={p.stage} variant={p.word} attention={p.health !== 'resting'} /><strong>{plantStages[p.stage-1]}</strong><span>Quran {p.surah}:{p.ayah} · Word {p.word}</span><small>{p.health === 'resting' ? 'Growing at your pace' : p.health === 'recovering' ? 'A little care will help' : 'Ready for attention'}</small></button>)}</section>{selected && <PlantDetails key={selected.vocabularyId} plant={selected} close={() => select(null)} />}</div>}
    <div className="garden-toolbar">{cursors.length > 1 && <button className="reveal-button" onClick={() => { setCursors(c => c.slice(0,-1)); select(null); }}>Previous plants</button>}{plants.data?.nextCursor && <button className="reveal-button" disabled={plants.isFetching} onClick={() => { setCursors(c => [...c,plants.data!.nextCursor!]); select(null); }}>Explore more plants</button>}</div>
    <p className="world-fine-print">Bloom requires spaced due recalls across 30+ days, sustained FSRS evidence and a correct knowledge check. FSRS estimates and self-ratings do not prove actual memory. Quran occurrences remain separate learning identities.</p>
  </>;
}
export default function GardenPage() { return <GameLayout><Garden /></GameLayout>; }
