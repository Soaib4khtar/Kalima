import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { GameLayout } from './GameLayout';
import { gameApi, useGame, type LedgerPage } from './game-api';
import { GameError } from './HomePage';

function Progress() {
  const { session } = useAuth(), overview = useGame();
  const ledger = useInfiniteQuery({ queryKey: ['learning', session!.user.id, 'game', 'ledger'], initialPageParam: '', queryFn: ({ pageParam }) => gameApi<LedgerPage>(`/ledger${pageParam ? `?cursor=${pageParam}` : ''}`), getNextPageParam: last => last.nextCursor ?? undefined, retry: false });
  const data = overview.data;
  if (overview.isPending) return <p role="status">Loading your learning story…</p>;
  if (overview.isError || !data) return <GameError retry={() => void overview.refetch()} message={overview.error?.message} />;
  return <><header className="world-heading"><p className="eyebrow">PATIENT PRACTICE, LASTING PROGRESS</p><h1>Look what’s <em>growing.</em></h1><p>No lost streaks. No pressure. Just a record of the steps you’ve taken.</p></header><dl className="learning-stats world-stats"><div><dt>Knowledge XP</dt><dd>{data.xp}</dd></div><div><dt>Build Tokens</dt><dd>{data.tokens}</dd></div><div><dt>Growing words</dt><dd>{data.plants}</dd></div><div><dt>Durable blooms</dt><dd>{data.mastered}</dd></div></dl>
    <section className="surface-panel momentum-panel"><h2>Learning Momentum</h2><p>{data.momentum.length} active days in the last week. Return whenever you can; your world will be here.</p><ul>{data.momentum.map(d => <li key={d}><span className="status-dot" />{d}</li>)}</ul></section>
    <section className="world-section"><h2>Permanent milestones</h2><div className="achievement-grid">{data.structures.map(s => <div className={`surface-panel${s.unlockedAt ? ' achievement-earned' : ''}`} key={s.key}><h3>{s.title}</h3><p>{s.unlockedAt ? 'Earned and built' : s.eligible ? 'Earned · unlock in My Kingdom' : `${s.required || 1} ${s.required ? 'durable blooms' : 'learned word'} to begin`}</p></div>)}</div><Link className="text-link" to="/kingdom">Explore milestones →</Link></section>
    <section className="world-section"><h2>Reward history</h2><p className="world-fine-print">Server-recorded awards and cosmetic spending. Rewards have daily caps: 200 XP and 6 newly earned tokens per UTC day, independent of quest timezone.</p>{ledger.isPending ? <p role="status">Loading reward history…</p> : ledger.isError ? <div role="alert"><p>{ledger.error.message}</p><button className="reveal-button" onClick={() => void ledger.refetch()}>Retry reward history</button></div> : <ul className="reward-history">{ledger.data?.pages.flatMap(p => p.items).map(r => <li key={r.id}><span>{r.source.startsWith('quest:') ? 'Quest completed' : r.source.startsWith('introduction:') ? 'New word introduced' : r.source.startsWith('due:') ? 'Scheduled recall completed' : r.source.startsWith('cosmetic:') ? 'Kingdom decoration' : 'Knowledge check'}<small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: data.timezone ?? 'UTC' }).format(new Date(r.createdAt))}</small></span><strong>{r.xp > 0 ? `+${r.xp} XP` : ''}{r.tokens ? ` ${r.tokens > 0 ? '+' : ''}${r.tokens} tokens` : r.xp ? '' : 'Daily limit applied'}</strong></li>)}{!ledger.data?.pages[0].items.length && <li>Your first earned reward will appear here.</li>}</ul>}{ledger.hasNextPage && <button className="reveal-button" disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>More reward history</button>}</section>
  </>;
}
export default function ProgressPage() { return <GameLayout><Progress /></GameLayout>; }
