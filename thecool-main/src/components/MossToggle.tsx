import { useCallback, useEffect, useState } from 'react';

type S = { forceLocal:boolean; mossAvailable:boolean; configured:boolean; mode:string };

// tiny side toggle — no error text shown on page
export default function MossToggle({ variant='card' }:{variant?:'card'|'chip'}){
  const [st,setSt]=useState<S|null>(null);
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{ const r=await fetch('/api/retrieval/mode'); if(r.ok) setSt(await r.json()); }catch{}
  },[]);
  useEffect(()=>{ load(); const id=setInterval(load,6000); const h=()=>load();
    window.addEventListener('neuralflow:retrieval-mode',h);
    return()=>{ clearInterval(id); window.removeEventListener('neuralflow:retrieval-mode',h); };
  },[load]);
  const toggle=async()=>{
    if(!st||busy) return;
    setBusy(true);
    try{
      const r=await fetch('/api/retrieval/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({forceLocal:!st.forceLocal})});
      if(r.ok) setSt(await r.json());
      window.dispatchEvent(new Event('neuralflow:retrieval-mode'));
    }catch{} finally{ setBusy(false); }
  };
  const available=Boolean(st?.mossAvailable);
  const on=available && !st?.forceLocal;
  const sw=(
    <button type="button" role="switch" aria-checked={on} disabled={busy||!available} onClick={toggle}
      title={available?(on?'Turn Moss off':'Turn Moss on'):'Moss unavailable'}
      className={`relative inline-flex h-4 w-8 items-center rounded-full border transition-colors ${on?'bg-emerald-500/80 border-emerald-300/40':'bg-zinc-700 border-white/10'} ${!available?'opacity-40 cursor-not-allowed':'cursor-pointer'}`}>
      <span className={`h-3 w-3 rounded-full bg-white transition-transform ${on?'translate-x-[16px]':'translate-x-[2px]'}`} />
    </button>
  );
  if(variant==='chip'){
    return <div className="hidden md:flex items-center gap-1.5 bg-[#101030] border border-white/10 rounded-lg px-2 py-1 text-[11px]">{sw}<span className={`font-mono text-[10px] ${on?'text-emerald-300':'text-zinc-400'}`}>{on?'Moss':'Local'}</span></div>;
  }
  return <div className="flex items-center gap-2">{sw}<span className="text-[10px] font-mono text-zinc-400">{on?'Moss':'Local'}</span></div>;
}
