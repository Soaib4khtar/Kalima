import { memo, useEffect, useRef } from 'react';

/** Reusable code-native vector art. Never represents fabricated vocabulary. */
export const WordPlant = memo(function WordPlant({ stage, variant = 0, attention = false }: { stage: number; variant?: number; attention?: boolean }) {
  const flower = ['#e6b873', '#c9a0ce', '#f0b8a0'][variant % 3];
  return <svg viewBox="0 0 160 170" aria-hidden="true" className={`word-plant${attention ? ' plant-attention' : ''}`}>
    <ellipse cx="80" cy="149" rx="48" ry="13" fill="#102f29" opacity=".14" />
    <path d="M31 139 79 118 129 139 80 161Z" fill="#b49b72" /><path d="M31 139v8l49 22v-8Zm49 22v8l49-22v-8Z" fill="#8f7959" />
    {stage === 1 ? <><ellipse cx="80" cy="137" rx="11" ry="7" fill="#70533d" /><path d="M80 136q8-15 16-10-2 12-16 10" fill="#8fa76d" /></> : <g className="plant-leaves">
      <path d={`M80 140Q${attention ? '69' : '82'} 100 80 ${stage > 2 ? 39 : 91}`} stroke="#52795b" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M80 119Q45 123 43 94q28-8 37 25M80 102q35 5 39-25-29-5-39 25" fill="#7aa77b" />
      {stage > 2 && <><path d="M80 81Q46 85 44 57q30-4 36 24" fill="#5f9171" /><path d="M80 61q29 8 32-19-25-5-32 19" fill="#94b889" /></>}
      {stage > 3 && <><path d="M65 135Q29 131 31 109q28-5 34 26M89 133q37 5 43-22-31-10-43 22" fill="#4f8367" /><circle cx="80" cy="43" r="24" fill="#83a781" opacity=".55" /></>}
      {stage === 5 && <g fill={flower}><circle cx="80" cy="25" r="11" /><circle cx="95" cy="37" r="11" /><circle cx="89" cy="54" r="11" /><circle cx="71" cy="54" r="11" /><circle cx="65" cy="37" r="11" /><circle cx="80" cy="40" r="8" fill="#f5df9f" /><circle cx="47" cy="68" r="7" /><circle cx="115" cy="86" r="6" /></g>}
    </g>}
    <path d="m114 143 8-3 6 3-8 3Zm-71-7 5-2 5 2-5 2Z" fill="#e7d6b7" />
  </svg>;
});

export function BuildingArt({ kind, built }: { kind: string; built: boolean }) {
  return <svg viewBox="0 0 180 160" aria-hidden="true" className={`building-art${built ? ' is-built' : ''}`}>
    <ellipse cx="90" cy="139" rx="65" ry="16" fill="#193b32" opacity=".12" />
    {kind === 'garden' ? <><path d="m23 119 64-34 91 30-65 37Z" fill="#779c76" /><path d="m48 120 37-20 51 17-38 21Z" fill="#d1bb8d" /><path d="M74 119V77m35 47V64" stroke="#52765a" strokeWidth="5" /><path d="M73 98Q40 99 42 72q25-4 31 26m35-12q34 0 33-29-27-5-33 29" fill="#8db28a" /><circle cx="109" cy="54" r="16" fill="#edc291" /><path d="m30 133 11-5 11 4-11 6" fill="#b6c6a2" /></> : kind === 'bridge' ? <><path d="m20 104 66-36 76 25-61 38Z" fill="#8bb0ab" /><path d="M24 108 72 84 157 111v25l-30 10v-11q-32-35-51-13v-10l-31 14Z" fill="#c5b28a" /><path d="m24 107 47-26 87 27-27 16-59-19-27 16Z" fill="#ecdbb5" /><path d="M25 105V90m45-9V68m88 39V93" stroke="#8f8267" strokeWidth="5" /></> : <>
      <path d="M42 70 97 46 143 68v59l-49 24-52-23Z" fill="#d8c6a2" /><path d="m94 92 49-24v59l-49 24Z" fill="#b4a182" />
      <path d="M30 71 93 25 155 67 94 98Z" fill="#537b70" /><path d="m30 71 64 27v-8L30 63Z" fill="#789b87" />
      <path d="M67 138v-25q12-22 24 0v35" fill="#637b66" /><path d="m107 104 13-6v18l-13 6Z" fill="#f2d49a" />
      {kind !== 'library' && <><path d="M71 57V21l22-10 21 10v36L93 68Z" fill="#ded0b0" /><path d="m65 23 28-20 28 20-28 14Z" fill="#456d64" /></>}
      <path d="M61 89v12m14-6v12" stroke="#f5dfab" strokeWidth="5" />
    </>}
  </svg>;
}

export function WorldScene({ unlocked = [], lanterns = false, fountain = false }: { unlocked?: string[]; lanterns?: boolean; fountain?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let visible = false;
    const update = () => { node.dataset.active = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; update(); });
    observer.observe(node); document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <div className="world-scene" aria-hidden="true" ref={ref}>
    <svg className="island-ground" viewBox="0 0 760 400"><ellipse cx="380" cy="305" rx="291" ry="62" fill="#142e2c" opacity=".12" /><path d="M69 228q34-58 126-84l164-66q41-16 86 0l222 94q46 18 36 63l-9 33-285 113L88 269Z" fill="#647f6a" /><path d="M79 222q-9-38 54-62l228-83q38-14 76 0l230 91q59 23 24 59L406 344 98 245Z" fill="#a4b59a" /><path d="m172 228 114-38 66-61 35 13-65 66 152 42 90-53 31 10-97 68-187-45-108 42Z" fill="#d9c9a7" /><path d="m172 228 114-38 66-61" stroke="#efe2c4" strokeWidth="3" opacity=".5" fill="none" />
      {[ [157,190], [620,196], [510,129], [241,285], [552,249] ].map(([x,y],i) => <g key={i} transform={`translate(${x},${y})`}><ellipse cy="12" rx="20" ry="6" fill="#52715a" opacity=".22" /><path d="M0 15V-19" stroke="#738268" strokeWidth="4" /><ellipse cy="-21" rx="19" ry="27" fill={i%2 ? '#799b78':'#6e8c70'} /><ellipse cx="-5" cy="-30" rx="9" ry="12" fill="#91ac87" opacity=".65" /></g>)}
      {lanterns && [ [275,210], [398,243], [536,223] ].map(([x,y]) => <g key={x} transform={`translate(${x},${y})`}><path d="M0 8v-25" stroke="#667661" strokeWidth="3" /><circle cy="-20" r="7" fill="#f0cf85" className="lantern-glow" /></g>)}
      {fountain && <g transform="translate(457 207)"><ellipse rx="24" ry="12" fill="#d4c6ab" /><ellipse cy="-4" rx="18" ry="8" fill="#82b1b2" /><path d="M0-6v-21m0 0q-14-4-14 8m14-8q14-4 14 8" stroke="#c2ded8" strokeWidth="3" fill="none" /></g>}
      <path d="m590 132 8 6 8-8-6-4Z" fill="#e4c290" className="world-butterfly" />
    </svg>
    <div className="world-building world-garden"><BuildingArt kind="garden" built={unlocked.includes('garden')} /></div>
    <div className="world-building world-library"><BuildingArt kind="library" built={unlocked.includes('library')} /></div>
    <div className="world-building world-bridge"><BuildingArt kind="bridge" built={unlocked.includes('bridge')} /></div>
    <span className="world-caption">A quiet world, grown through learning.</span>
  </div>;
}
