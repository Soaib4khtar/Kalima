import { Link } from 'react-router';
import { ArrowRight, Sprout } from 'lucide-react';
import { GameLayout } from './GameLayout';
import { useGame } from './game-api';
import { QuestBoard } from './QuestBoard';
import { WorldScene } from './WorldArt';

export function GameError({ retry, message }: { retry: () => void; message?: string }) {
  return <section className="empty-panel" role="alert"><h2>Your world couldn’t be loaded.</h2><p>{message ?? 'Please try again. Your learning history is safe.'}</p><button className="primary-button" onClick={retry}>Try again</button><Link className="text-link" to="/reviews">Continue learning</Link></section>;
}
function Overview({ questsOnly = false }: { questsOnly?: boolean }) {
  const query = useGame(), data = query.data;
  if (query.isPending) return <p className="loading-panel" role="status">Finding your place in the garden…</p>;
  if (query.isError || !data) return <GameError retry={() => void query.refetch()} message={query.error?.message} />;
  const next = data.structures.find(s => !s.eligible && !s.unlockedAt);
  return <>
    <header className="world-heading"><p className="eyebrow"><Sprout size={15} /> THE GROWING KINGDOM</p><h1>{questsOnly ? <>Today’s <em>Quests.</em></> : <>Little words.<br />A world <em>taking root.</em></>}</h1><p>{data.plants ? 'Welcome back. There’s always room for a little growth.' : 'Begin with one word. Let your garden grow at the pace of real learning.'}</p></header>
    {!questsOnly && <section className="world-overview surface-panel" aria-label="Your growing kingdom"><div><span className="panel-kicker">LEVEL {data.level} · KNOWLEDGE EXPLORER</span><h2>{data.xp} Knowledge XP</h2><div className="progress-track" role="progressbar" aria-label="Level progress" aria-valuenow={data.levelXp} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${data.levelXp}%` }} /></div><p>{100 - data.levelXp} XP to the next level · {data.tokens} Build Tokens</p></div><div><strong>{data.due}</strong><span>words due now</span><Link className="primary-button" to={data.due ? '/reviews' : '/quran/al-fatihah'}>Continue Learning <ArrowRight size={15} /></Link></div></section>}
    <section className="world-section" aria-label="Today’s quests"><div className="world-section-title"><div><span className="panel-kicker">SMALL STEPS, MEANINGFUL PROGRESS</span><h2>Today’s Quests</h2></div><span>{data.localDate ?? 'Awaiting source'} · {data.timezone ?? 'Saved timezone'}</span></div>
      {!data.sourceAvailable && <p className="world-notice">Verified source content is temporarily unavailable. Existing quests and learning records are preserved.</p>}
      {data.questsPaused && <p className="world-notice">This issued quest period has ended. New quests resume when the next timezone-safe period and verified content are available. You can keep studying normally.</p>}
      <QuestBoard quests={data.missions.filter(q => q.period === 'daily')} active={!data.questsPaused} />
      <p className="world-fine-print">Rewards are saved automatically. Daily limits apply. Honest Again, Hard, Good and Easy ratings receive equal participation credit.</p>
    </section>
    {!questsOnly && <section className="world-preview"><div><span className="panel-kicker">YOUR OWN QUIET CORNER</span><h2>Where knowledge<br /><em>comes to life.</em></h2><p>{data.plants} plants taking root · {data.mastered} durable blooms</p><Link className="text-link" to="/garden">Explore Memory Garden →</Link><Link className="text-link" to="/kingdom">Visit My Kingdom →</Link></div><WorldScene unlocked={data.structures.filter(s => s.unlockedAt).map(s => s.key)} lanterns={data.cosmetics.some(c => c.key === 'lanterns' && c.owned)} fountain={data.cosmetics.some(c => c.key === 'fountain' && c.owned)} /></section>}
    {next && <section className="next-milestone surface-panel"><span className="quest-icon"><Sprout size={22} /></span><div><span className="panel-kicker">THE NEXT CHAPTER</span><h3>{next.key === 'garden' ? 'Begin your first word to bring the Memory Garden to life.' : `${Math.max(0, next.required - data.mastered)} more durable blooms to earn ${next.title}.`}</h3><p>Mastery grows across spaced occasions, never from repeated taps.</p></div><Link className="text-link" to="/kingdom">See your kingdom →</Link></section>}
    <section className="world-section"><div className="world-section-title"><h2>A gentle weekly rhythm</h2><span>{data.momentum.length} active days in the last week</span></div><QuestBoard quests={data.missions.filter(q => q.period === 'weekly')} /><p className="world-fine-print">Missing a day never takes away XP, plants or earned structures. Welcome back, whenever you return.</p></section>
  </>;
}
export default function HomePage() { return <GameLayout><Overview /></GameLayout>; }
export function QuestsPage() { return <GameLayout><Overview questsOnly /></GameLayout>; }
