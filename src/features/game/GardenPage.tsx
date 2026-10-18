import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchAlFatihah } from '@/lib/api';
import { safeHttpsUrl } from '../quran/quran-learning';
import { useAuth } from '../auth/auth-context';
import { GameLayout } from './GameLayout';
import { gameApi, plantStages, useGardenPage, type Challenge, type ChallengeResult, type Plant } from './game-api';
import { FlowerPatch, GardenTerrain, Tree, WordPlant } from './WorldArt';
import { GameError } from './HomePage';
import { GameSheet } from './GameSheet';
import { useSceneActivity } from './use-scene-activity';

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
function PlantDetails({ plant,serverNow }: { plant: Plant; serverNow:string }) {
  const source = useQuery({ queryKey: ['quran', 'surah', 1], queryFn: ({ signal }) => fetchAlFatihah(signal), gcTime: 0, retry: false });
  const ready = source.data?.status === 'ready' ? source.data : null;
  const word = ready?.surah.verses.find(v => v.number === plant.ayah)?.words.find(w => w.position === plant.word);
  const due=Date.parse(plant.dueAt)<=Date.parse(serverNow);
  return <aside className="garden-details" aria-label="Garden word details"><h2>Your growing word</h2>
    <WordPlant stage={plant.stage} variant={plant.word} attention={plant.health !== 'resting'} /><p className="panel-kicker">{plantStages[plant.stage - 1]} · {plant.health.replaceAll('-', ' ')}</p>
    {source.isPending ? <p role="status">Loading authentic word details…</p> : word ? <><h3 className="garden-arabic" lang="ar" dir="rtl" translate="no">{word.textUthmani}</h3>{word.transliteration && <p>{word.transliteration}</p>}<p dir="auto" translate="no">{word.translation ?? 'The contextual meaning is unavailable.'}</p>{safeHttpsUrl(word.audioUrl) && <audio aria-label="Garden word audio" controls preload="none" src={safeHttpsUrl(word.audioUrl)!} />}</> : <p role="status">Source word details are unavailable. Your plant and review schedule are safe.</p>}
    <Link className="text-link" to={`/quran/al-fatihah?word=${plant.surah}:${plant.ayah}:${plant.word}`}>Quran {plant.surah}:{plant.ayah} · Word {plant.word} →</Link>
    <p>{plant.reviews} recorded recalls. Current health is an estimate; earned growth is never destroyed.</p><p className="word-review-status">{due?'Ready for its scheduled review':`Next scheduled: ${new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(plant.dueAt))} (device time)`}</p><Link className="primary-button" to="/reviews">{due?'Review this memory':'Open daily reviews'}</Link>
    {ready && <p className="world-fine-print"><a href={safeHttpsUrl(ready.attribution.url) ?? undefined} target="_blank" rel="noreferrer">{ready.attribution.label}.</a> Meanings: {ready.attribution.wordTranslationLanguage ?? 'source-provided'}</p>}
    <KnowledgeCheck key={plant.vocabularyId} plant={plant} />
  </aside>;
}
function Garden() {
  const [stage, setStage] = useState(''), [selectedId, select] = useState<string | null>(null);
  const [cursors, setCursors] = useState(['']);
  const cursor = cursors.at(-1)!;
  const plants = useGardenPage(stage,cursor),scene=useSceneActivity<HTMLDivElement>();
  const items = plants.data?.items ?? [];
  const selected=items.find(p=>p.vocabularyId===selectedId);
  return <><header className="world-heading"><p className="eyebrow">A QUIET PLACE FOR WHAT YOU LEARN</p><h1>Your Memory <em>Garden.</em></h1><p>Not a collection to finish. A living place to return to.</p></header>
    <div className="garden-toolbar"><span>Every plant is a word you’ve practiced.</span><label>Growth stage <select value={stage} onChange={e=>{setStage(e.target.value);setCursors(['']);select(null);}}><option value="">All plants</option>{plantStages.map((s,i)=><option key={s} value={i+1}>{s}</option>)}</select></label></div>
    {plants.isError?<GameError retry={()=>void plants.refetch()} message={plants.error.message}/>:<div className="garden-place" ref={scene}><GardenTerrain/><svg className="garden-corner garden-corner-left" viewBox="0 0 160 240" aria-hidden="true"><Tree x={37} y={151} scale={1.1} variant={1}/><FlowerPatch x={75} y={187} scale={1.4}/><path d="M32 224q65-70 93-13" stroke="#799563" strokeWidth="16" fill="none"/><path d="M30 214q60-60 96-11" stroke="#b6c693" strokeWidth="8" fill="none"/></svg><svg className="garden-corner garden-corner-right" viewBox="0 0 160 240" aria-hidden="true"><Tree x={117} y={153} scale={1.2}/><FlowerPatch x={82} y={197} scale={1.5}/><path d="M25 217q70-65 109-6" stroke="#7d9967" strokeWidth="18" fill="none"/></svg><div className="garden-place-sign" aria-hidden="true">THE MEMORY GARDEN <span>ONE WORD, ONE SMALL BEGINNING</span></div>
      {plants.isPending?<p className="garden-empty-message" role="status">Opening your garden…</p>:!items.length?<section className="garden-empty-message"><span className="empty-bed" aria-hidden="true"/><h2>{stage?'No plants at this stage yet.':'A little space for your first word.'}</h2><p>Complete an honest recall to plant a seed. Bookmarking alone never creates mastery or XP.</p><Link className="primary-button" to="/quran/al-fatihah">Begin with Al-Fatihah</Link></section>:<section className="garden-plots" aria-label="Vocabulary plants">{items.map(p=>{const due=Date.parse(p.dueAt)<=Date.parse(plants.data!.serverNow);return <button key={p.vocabularyId} className={`garden-plot${selectedId===p.vocabularyId?' selected-plot':''}${due?' plant-is-due':''}`} aria-pressed={selectedId===p.vocabularyId} onClick={()=>select(p.vocabularyId)}><WordPlant stage={p.stage} variant={p.word} attention={p.health!=='resting'}/><span className="plant-marker"><strong>{plantStages[p.stage-1]}</strong><span>Quran {p.surah}:{p.ayah} · Word {p.word}</span><small>{due?'Ready to review':p.health==='recovering'?'A little care will help':'Growing at your pace'}</small></span></button>;})}</section>}
      <div className="garden-place-footer">{items.length} words in this part of your garden · choose a plant to explore</div></div>}
    {selected&&plants.data&&<GameSheet title="Your growing word" closeLabel="Close word details" close={()=>select(null)}><PlantDetails key={selected.vocabularyId} plant={selected} serverNow={plants.data.serverNow}/></GameSheet>}
    <div className="garden-toolbar">{cursors.length > 1 && <button className="reveal-button" onClick={() => { setCursors(c => c.slice(0,-1)); select(null); }}>Previous plants</button>}{plants.data?.nextCursor && <button className="reveal-button" disabled={plants.isFetching} onClick={() => { setCursors(c => [...c,plants.data!.nextCursor!]); select(null); }}>Explore more plants</button>}</div>
    <div className="growth-guide" aria-label="Five stages of word growth">{plantStages.map((s,i)=><div key={s}><WordPlant stage={i+1} variant={i}/><span>{s}</span></div>)}</div><p className="world-fine-print">Growth guide, not a mastery score. Bloom requires spaced due recalls across 30+ days, sustained FSRS evidence and a correct knowledge check. FSRS estimates and self-ratings do not prove actual memory. Quran occurrences remain separate learning identities.</p>
  </>;
}
export default function GardenPage() { return <GameLayout><Garden /></GameLayout>; }
