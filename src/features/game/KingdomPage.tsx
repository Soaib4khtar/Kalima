import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { GameLayout } from './GameLayout';
import { gameApi, useGame } from './game-api';
import { BuildingArt, WorldScene } from './WorldArt';
import { GameSheet } from './GameSheet';
import { GameError } from './HomePage';
import { useAuth } from '../auth/auth-context';

function Kingdom() {
  const query=useGame(),data=query.data,cache=useQueryClient(),{session}=useAuth();
  const [selected,select]=useState<string|null>(null),[notice,setNotice]=useState(''),[celebration,celebrate]=useState<string>();
  const action=useMutation({mutationFn:(path:string)=>gameApi(path,'POST',{}),onSuccess:async(_result,path)=>{
    // Never optimistic: construction/decoration feedback follows the committed API result.
    await cache.invalidateQueries({queryKey:['learning',session!.user.id,'game']});
    setNotice(path.includes('cosmetics')?'Decoration saved. Your kingdom feels a little brighter.':'A new place in your world. Milestone saved.');
    if(!path.includes('cosmetics'))celebrate(path.split('/')[2]);
  }});
  useEffect(()=>{if(!celebration)return;const timer=window.setTimeout(()=>celebrate(undefined),4000);return()=>window.clearTimeout(timer);},[celebration]);
  if(query.isPending)return <p className="world-loading" role="status">Unfolding your little atlas…</p>;
  if(query.isError||!data)return <GameError retry={()=>void query.refetch()} message={query.error?.message}/>;
  const place=data.structures.find(s=>s.key===selected);
  return <><header className="world-heading heading-with-note"><div><p className="eyebrow">THE LIVING ATLAS · YOUR KINGDOM</p><h1>A world of <em>your making.</em></h1><p>Every path begins with a word. Every place is earned through patient learning.</p></div><span className="world-wallet">✧ <strong>{data.tokens}</strong> Build Tokens</span></header>
    <WorldScene structures={data.structures} unlocked={data.structures.filter(s=>s.unlockedAt).map(s=>s.key)} lanterns={data.cosmetics.some(c=>c.key==='lanterns'&&c.owned)} fountain={data.cosmetics.some(c=>c.key==='fountain'&&c.owned)} onSelect={select} selected={selected??undefined} celebration={celebration}/>
    <div className="map-legend"><span><i className="legend-built"/>Built</span><span><i className="legend-ready"/>Ready to unlock</span><span><i/>A future chapter</span><small>Tap a building, or choose a place below.</small></div>
    <nav className="place-index" aria-label="Kingdom places">{data.structures.map(s=><button key={s.key} onClick={()=>select(s.key)}><span>{s.unlockedAt?'✓':s.eligible?'+':'·'}</span>{s.title}<small>{s.unlockedAt?'Built':s.eligible?'Ready':'Locked'}</small></button>)}</nav>
    {notice&&<p role="status" className="world-notice reward-acknowledgement">{notice}</p>}{action.isError&&<p role="alert" className="world-notice">{action.error.message}</p>}
    <section className="world-section finishing-touches"><div className="world-section-title"><div><p className="panel-kicker">MAKE IT FEEL LIKE HOME</p><h2>A few finishing touches</h2></div><span>{data.tokens} Build Tokens available</span></div><p>Small, optional details. Never a shortcut to knowledge.</p><div className="cosmetic-grid">{data.cosmetics.map(c=><article className={`cosmetic-item${c.owned?' cosmetic-owned':''}`} key={c.key}><svg className="cosmetic-art" viewBox="0 0 100 100" aria-hidden="true">{c.key==='lanterns'?<><ellipse cx="52" cy="86" rx="29" ry="8" fill="#b2c19a"/><path d="M37 86V17h32v17" stroke="#827356" strokeWidth="4" fill="none"/><circle cx="68" cy="48" r="24" fill="#dfc58c" opacity=".3"/><path d="M56 34h23v27H56Z" fill="#e3bc71" stroke="#897553" strokeWidth="3"/><path d="M62 40v15m10-15v15" stroke="#fff0bf" strokeWidth="2"/></>:<><ellipse cx="50" cy="77" rx="36" ry="14" fill="#b7b18d"/><ellipse cx="50" cy="71" rx="28" ry="10" fill="#8eb6a4"/><path d="M50 70V20m0 5Q24 10 24 44m26-19q26-15 26 19" stroke="#b4d0b6" strokeWidth="4" fill="none"/><ellipse cx="50" cy="48" rx="18" ry="6" fill="#d7c7a0"/></>}</svg><div><h3>{c.title}</h3><p>{c.cost} Build Tokens · one permanent decoration</p><button className="reveal-button" disabled={c.owned||action.isPending||data.tokens<c.cost||!data.structures.some(s=>s.key==='garden'&&s.unlockedAt)} onClick={()=>action.mutate(`/cosmetics/${c.key}`)}>{c.owned?'In your kingdom':`Add ${c.title.toLowerCase()}`}</button>{!c.owned&&!data.structures.some(s=>s.key==='garden'&&s.unlockedAt)&&<small>Activate your earned Memory Garden first.</small>}</div></article>)}</div></section>
    {place&&<GameSheet title={place.title} close={()=>select(null)}><div className="structure-detail"><BuildingArt kind={place.key} built={Boolean(place.unlockedAt)||place.eligible}/><p className="panel-kicker">{place.unlockedAt?'A PERMANENT ACHIEVEMENT':place.eligible?'YOUR NEXT PLACE IS READY':'A FUTURE CHAPTER'}</p><h2>{place.title}</h2><p>{place.description}</p><div className="milestone-requirement">{place.required?<><strong>{Math.min(data.mastered,place.required)} / {place.required}</strong><span>durable blooms</span></>:<><strong>{data.plants>0?'First word begun':'One learned word'}</strong><span>A small beginning is enough.</span></>}</div><p className="world-fine-print">Milestones are earned, not purchased. Blooming needs spaced recall over time, never repeated taps.</p><button className="primary-button" disabled={Boolean(place.unlockedAt)||!place.eligible||action.isPending} onClick={()=>action.mutate(`/kingdom/${place.key}/unlock`)}>{action.isPending?'Saving your place…':place.unlockedAt?'Built':place.eligible?'Unlock your milestone':'Keep growing'}</button>{place.unlockedAt&&place.key==='garden'&&<Link className="text-link" to="/garden">Step into Memory Garden →</Link>}{action.isError&&<p role="alert">{action.error.message}</p>}{notice&&<p role="status">{notice}</p>}</div></GameSheet>}
  </>;
}
export default function KingdomPage(){return <GameLayout><Kingdom/></GameLayout>;}
