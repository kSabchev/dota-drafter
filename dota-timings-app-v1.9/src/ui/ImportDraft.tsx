
import { useState } from 'react'
import { useStore } from '@/store'

export default function ImportDraft({ onImported }:{ onImported: ()=>void }){
  const apiBase = useStore(s=> s.apiBase)
  const clearBoard = useStore(s=> s.clearBoard)
  const pickHero = useStore(s=> s.pickHero)
  const buildStory = useStore(s=> s.buildStory)
  const [q,setQ] = useState('')
  const [loading,setLoading] = useState(false)
  const [res,setRes] = useState<any>(null)

  const run = async()=>{
    try{
      setLoading(true)
      clearBoard()
      const r = await fetch(apiBase+'/importMatch?q='+encodeURIComponent(q))
      const j = await r.json()
      if (!r.ok) throw new Error(j.error||'import failed')
      setRes(j)
      for (const p of j.picks) pickHero(p.hero_id)
      await buildStory()
      onImported()
    }catch(e:any){
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{display:'grid', gap:12, maxWidth:720}}>
      <h3>Import Draft</h3>
      <input value={q} onChange={e=> setQ(e.target.value)} placeholder="Dotabuff URL or Match ID" style={{padding:'8px 10px', border:'1px solid #30363d', borderRadius:8, background:'#0d1117', color:'#e6edf3'}}/>
      <div style={{display:'flex', gap:8}}>
        <button disabled={loading} onClick={run} style={{padding:'6px 10px',borderRadius:8, border:'1px solid #30363d', background:'#0d1117', color:'#e6edf3'}}>Import</button>
      </div>
      {res && <pre style={{opacity:.7}}>{JSON.stringify(res,null,2)}</pre>}
    </div>
  )
}
