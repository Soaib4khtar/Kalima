import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native modal supplies focus containment, Escape and focus restoration. */
export function GameSheet({title,close,children,closeLabel='Close details'}:{title:string;close:()=>void;children:ReactNode;closeLabel?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;if(!dialog?.open)dialog?.showModal();},[]);
  return <dialog className="world-sheet" aria-label={title} ref={ref} onClose={close} onClick={event=>{if(event.target===event.currentTarget)ref.current?.close();}}>
    <div className="sheet-content"><header className="sheet-header"><span className="panel-kicker">YOUR LIVING WORLD</span><button className="icon-button" aria-label={closeLabel} onClick={()=>ref.current?.close()}><X size={21}/></button></header>{children}</div>
  </dialog>;
}
