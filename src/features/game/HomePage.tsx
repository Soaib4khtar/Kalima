import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { GameLayout } from './GameLayout';
import { useGame, useGardenPage } from './game-api';
import { QuestBoard } from './QuestBoard';
import { BuildingArt, LevelEmblem, WordPlant, WorldScene } from './WorldArt';

export function GameError({retry,message}:{retry:()=>void;message?:string}) {
  return <section className="empty-panel world-error" role="alert"><span aria-hidden="true">✧</span><h2>Your world couldn’t be loaded.</h2><p>{message??'Please try again. Your learning history is safe.'}</p><button className="primary-button" onClick={retry}>Try again</button><Link className="text-link" to="/reviews">Continue learning</Link></section>;
}
function GardenPreview(){
  const query=useGardenPage();
  return <section className="garden-glimpse"><div><p className="panel-kicker">A LITTLE LIFE, TAKING ROOT</p><h2>A moment in<br/><em>your garden.</em></h2><p>{query.isPending?'Opening the garden…':query.isError?'Your plants are safe. Open the garden to retry.':query.data?.items.length?'Familiar words. New beginnings. All growing at your pace.':'An unplanted bed. A beautiful place to begin.'}</p><Link className="text-link" to="/garden">Step into Memory Garden <ArrowRight size={15}/></Link></div><div className="garden-glimpse-bed" aria-label="Garden preview">{query.data?.items.slice(0,5).map(p=><Link key={p.vocabularyId} to="/garden" aria-label={`Explore Quran ${p.surah}:${p.ayah} word ${p.word} in your garden`}><WordPlant stage={p.stage} variant={p.word}/></Link>)}{!query.data?.items.length&&<span className="empty-garden-ground" aria-hidden="true"/>}</div></section>;
}
function Overview({questsOnly=false}:{questsOnly?:boolean}) {
  const query=useGame(),data=query.data;
  if(query.isPending)return <p className="world-loading" role="status">Finding your place in the garden…</p>;
  if(query.isError||!data)return <GameError retry={()=>void query.refetch()} message={query.error?.message}/>;
  const next=data.structures.find(s=>!s.unlockedAt),daily=data.missions.filter(q=>q.period==='daily');
  return <>
    {questsOnly?<header className="world-heading quest-heading"><div><p className="eyebrow">THE QUEST JOURNAL</p><h1>Small steps.<br/><em>Wonderful things.</em></h1><p>Three little invitations to learn. Follow your curiosity, not a countdown.</p></div><div className="quest-journal-mark" aria-hidden="true">✧<span>TODAY’S<br/>CHAPTER</span></div></header>:
      <section className="world-home-hero" aria-label="Your growing kingdom"><div className="home-welcome"><p className="eyebrow">THE GROWING KINGDOM</p><h1>Little words.<br/>A living <em>world.</em></h1><p>{data.plants?'Welcome back to your quiet corner. A little learning goes a long way.':'Your world is waiting. Begin with a word, and let something beautiful take root.'}</p><Link className="primary-button continue-learning" to={data.due?'/reviews':'/quran/al-fatihah'}>Continue Learning <ArrowRight size={17}/></Link><span className="home-due-note">{data.due?`${data.due} words are ready for a little care.`:'A few unhurried minutes. One meaningful word.'}</span><Link className="home-explore-link text-link" to="/kingdom">Explore your kingdom →</Link></div><WorldScene unlocked={data.structures.filter(s=>s.unlockedAt).map(s=>s.key)} lanterns={data.cosmetics.some(c=>c.key==='lanterns'&&c.owned)} fountain={data.cosmetics.some(c=>c.key==='fountain'&&c.owned)}/>
        <div className="home-player-strip"><LevelEmblem level={data.level}/><div><strong>{data.xp} Knowledge XP</strong><span>{100-data.levelXp} XP to your next level</span><div className="progress-track" role="progressbar" aria-label="Level progress" aria-valuenow={data.levelXp} aria-valuemin={0} aria-valuemax={100}><span style={{transform:`scaleX(${data.levelXp/100})`}}/></div></div><div><strong>{data.due}</strong><span>words due now</span></div><div><strong>{data.tokens}</strong><span>Build Tokens</span></div></div>
      </section>}
    <section className="world-section" aria-label="Today’s quests"><div className="world-section-title"><div><span className="panel-kicker">YOUR NEXT SMALL ADVENTURE</span><h2>Today’s Quests</h2></div><span>{daily.filter(q=>q.completedAt).length} / {daily.length} complete · {data.localDate??'Awaiting source'}<small>{data.timezone??'Saved timezone'}</small></span></div>
      {!data.sourceAvailable&&<p className="world-notice">Verified source content is temporarily unavailable. Existing quests and learning records are preserved.</p>}{data.questsPaused&&<p className="world-notice">This issued quest period has ended. New quests resume when the next timezone-safe period and verified content are available. You can keep studying normally.</p>}
      <QuestBoard quests={daily} active={!data.questsPaused}/><p className="world-fine-print">Rewards are saved automatically after learning commits. Honest Again, Hard, Good and Easy ratings receive equal participation credit. Daily limits apply.</p>
    </section>
    {!questsOnly&&<GardenPreview/>}
    {next&&<section className="next-milestone"><BuildingArt kind={next.key} built={next.eligible}/><div><p className="panel-kicker">A NEW PLACE ON THE HORIZON</p><h2>{next.title}</h2><p>{next.eligible?'You’ve earned this place. Make it part of your world.':next.key==='garden'?'One learned word. Your first small beginning.':`${Math.max(0,next.required-data.mastered)} more durable blooms to earn this place.`}</p><Link className="text-link" to="/kingdom">{next.eligible?'Unlock your milestone':'See your kingdom'} →</Link></div></section>}
    <section className="world-section weekly-chapter"><div className="world-section-title"><div><p className="panel-kicker">NO LOST STREAKS. JUST LITTLE RETURNS.</p><h2>A gentle weekly rhythm</h2></div><span>{data.momentum.length} active days in the last week</span></div><QuestBoard quests={data.missions.filter(q=>q.period==='weekly')} active={!data.questsPaused}/><p className="world-fine-print">Missing a day never takes away XP, plants or earned structures. Your world will be here whenever you return.</p></section>
  </>;
}
export default function HomePage(){return <GameLayout><Overview/></GameLayout>;}
export function QuestsPage(){return <GameLayout><Overview questsOnly/></GameLayout>;}
