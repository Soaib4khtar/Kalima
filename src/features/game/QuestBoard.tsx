import { Link } from 'react-router';
import { Check, Compass, Flower2, Leaf, RotateCcw, Sparkles } from 'lucide-react';
import type { Quest } from './game-api';
const descriptions: Record<string, { title: string; text: string; link: string; action: string }> = {
  discovery: { title: 'Plant something new', text: 'Begin new words with an honest recall.', link: '/quran/al-fatihah#recall', action: 'Discover words' },
  participation: { title: 'A little mindful practice', text: 'Complete recalls of different words. Every honest rating counts.', link: '/quran/al-fatihah', action: 'Practice words' },
  due: { title: 'Return to your words', text: 'Review different words when their FSRS schedule is due.', link: '/reviews', action: 'Open due reviews' },
  recovery: { title: 'Tend a fading memory', text: 'Revisit different difficult words when scheduled.', link: '/reviews', action: 'Help words recover' },
  challenge: { title: 'A moment of understanding', text: 'Match a learned word to its source-provided contextual meaning.', link: '/garden', action: 'Try a knowledge check' },
  days: { title: 'Room for a learning rhythm', text: 'Practice on different days this week, with a goal that fits the days remaining. No lost streaks.', link: '/quran/al-fatihah', action: 'Continue learning' },
};
export function QuestCard({ quest, active = true }: { quest: Quest; active?: boolean }) {
  const spec = descriptions[quest.kind];
  const Icon = quest.completedAt ? Check : quest.kind === 'discovery' ? Leaf : quest.kind === 'recovery' ? Flower2 : quest.kind === 'challenge' ? Sparkles : RotateCcw;
  return <article className={`quest-card${quest.completedAt ? ' quest-complete' : ''}`} aria-label={spec.title}>
    <div className="quest-top"><span className="quest-icon"><Icon size={20} /></span><span>{quest.completedAt ? 'Completed · rewards saved' : quest.period === 'weekly' ? 'THIS WEEK' : 'TODAY'}</span></div>
    <h3>{spec.title}</h3><p>{spec.text}</p><div className="quest-numbers"><span>{quest.progress} / {quest.target} {quest.kind === 'days' ? 'days' : 'words'}</span><span>{quest.completedAt ? 'Complete' : 'In progress'}</span></div>
    <div className="progress-track" role="progressbar" aria-label={`${spec.title} progress`} aria-valuenow={quest.progress} aria-valuemin={0} aria-valuemax={quest.target}><span style={{ width: `${quest.progress / quest.target * 100}%` }} /></div>
    <div className="quest-bottom"><span>Up to {quest.rewardXp} XP · {quest.rewardTokens} Build Token{quest.rewardTokens === 1 ? '' : 's'}</span>{!quest.completedAt && (active ? <Link to={spec.link} className="text-link">{spec.action} →</Link> : <span>Awaiting the next timezone-safe quest period</span>)}</div>
  </article>;
}
export function QuestBoard({ quests, active = true }: { quests: Quest[]; active?: boolean }) {
  if (!quests.length) return <div className="surface-panel world-empty"><Compass size={28} /><h3>Your next quests are waiting for verified words.</h3><p>No task or reward is invented while source content is unavailable. Your saved progress is safe.</p><Link className="text-link" to="/quran/al-fatihah">Open Quran reading →</Link></div>;
  return <div className="quest-grid">{quests.map(q => <QuestCard key={q.id} quest={q} active={active} />)}</div>;
}
