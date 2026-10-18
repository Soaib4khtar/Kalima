import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LockKeyhole } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { GameLayout } from './GameLayout';
import { gameApi, useGame } from './game-api';
import { BuildingArt, WorldScene } from './WorldArt';
import { GameError } from './HomePage';

function Kingdom() {
  const query = useGame(), data = query.data, cache = useQueryClient(), { session } = useAuth();
  const [notice, setNotice] = useState('');
  const action = useMutation({ mutationFn: (path: string) => gameApi(path, 'POST', {}), onSuccess: (_result, path) => {
    setNotice(path.includes('cosmetics') ? 'Decoration saved. Your kingdom feels a little brighter.' : 'A new place in your world. Milestone saved.');
    void cache.invalidateQueries({ queryKey: ['learning', session!.user.id, 'game'] });
  } });
  if (query.isPending) return <p role="status">Opening your kingdom…</p>;
  if (query.isError || !data) return <GameError retry={() => void query.refetch()} message={query.error?.message} />;
  return <><header className="world-heading"><p className="eyebrow">BUILT THROUGH UNDERSTANDING</p><h1>My <em>Kingdom.</em></h1><p>A small world with a long horizon. Every milestone is earned, never purchased.</p></header>
    <WorldScene unlocked={data.structures.filter(s => s.unlockedAt).map(s => s.key)} lanterns={data.cosmetics.some(c => c.key === 'lanterns' && c.owned)} fountain={data.cosmetics.some(c => c.key === 'fountain' && c.owned)} />
    {notice && <p role="status" className="world-notice">{notice}</p>}{action.isError && <p role="alert">{action.error.message}</p>}
    <div className="structure-grid">{data.structures.map(s => <article className={`structure-card surface-panel${s.unlockedAt ? ' structure-earned' : ''}`} key={s.key}><BuildingArt kind={s.key} built={Boolean(s.unlockedAt)} /><div className="structure-status">{s.unlockedAt ? <Check size={15} /> : <LockKeyhole size={15} />}{s.unlockedAt ? 'A permanent achievement' : s.eligible ? 'Earned · ready to unlock' : 'A future chapter'}</div><h2>{s.title}</h2><p>{s.description}</p><p>{s.required ? `${Math.min(data.mastered,s.required)} / ${s.required} durable blooms` : 'Begin your first word to activate'}</p><button className="reveal-button" disabled={Boolean(s.unlockedAt) || !s.eligible || action.isPending} onClick={() => action.mutate(`/kingdom/${s.key}/unlock`)}>{s.unlockedAt ? 'Built' : s.eligible ? 'Unlock your milestone' : 'Keep growing'}</button></article>)}</div>
    <section className="world-section"><div className="world-section-title"><h2>A few finishing touches</h2><span>{data.tokens} Build Tokens available</span></div><p>Optional decorations only. Tokens never gate learning, earned buildings or mastery.</p><div className="cosmetic-grid">{data.cosmetics.map(c => <article className="surface-panel" key={c.key}><h3>{c.title}</h3><p>{c.cost} Build Tokens · one permanent decoration</p><button className="reveal-button" disabled={c.owned || action.isPending || data.tokens < c.cost || !data.structures.some(s => s.key === 'garden' && s.unlockedAt)} onClick={() => action.mutate(`/cosmetics/${c.key}`)}>{c.owned ? 'In your kingdom' : `Add ${c.title.toLowerCase()}`}</button></article>)}</div></section>
  </>;
}
export default function KingdomPage() { return <GameLayout><Kingdom /></GameLayout>; }
