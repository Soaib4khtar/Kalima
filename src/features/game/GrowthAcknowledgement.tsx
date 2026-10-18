import { Link } from 'react-router';
import './journey.css';

/** Called only with a successful, committed review's immutable reward delta.
 * The decorative sprig is not a claim that a particular plant stage advanced. */
export function GrowthAcknowledgement({reward}:{reward:{xp:number;tokens:number}|null}) {
  if(!reward||(reward.xp<=0&&reward.tokens<=0))return null;
  return <div className="reward-feedback growth-ack" role="status" data-committed="true"><svg viewBox="0 0 60 70" aria-hidden="true"><ellipse cx="30" cy="59" rx="25" ry="8" fill="#b9c69a"/><path d="M30 59V24m0 18Q9 39 10 22q20 0 20 20m0-9q17-1 20-21-18 0-20 21" stroke="#5f875a" strokeWidth="2" fill="#8ba371"/></svg><div><p>A little growth: +{reward.xp} Knowledge XP{reward.tokens>0?` · +${reward.tokens} Build Tokens`:''}.</p><span>Learning saved. Your world is up to date.</span></div><Link className="text-link" to="/garden">Visit your garden →</Link></div>;
}
