import { useEffect, useRef } from 'react';

/** CSS runs only while this scene intersects a visible browser tab. */
export function useSceneActivity<T extends HTMLElement>() {
  const ref=useRef<T>(null);
  useEffect(()=>{
    const node=ref.current; if(!node) return;
    let visible=false;
    const update=()=>{ node.dataset.active=String(visible && !document.hidden); };
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting ?? false;update();});
    observer.observe(node);document.addEventListener('visibilitychange',update);
    return ()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);};
  },[]);
  return ref;
}
