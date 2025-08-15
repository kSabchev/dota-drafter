
import { useStore } from '@/store'
import LocalHeroImg from './components/LocalHeroImg'
export default function Heroes(){
  const heroes = useStore(s=> s.heroes)
  return (
    <div className="grid" style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:8}}>
      {heroes.map(h=>(
        <div key={h.id} style={{border:'1px solid #30363d', borderRadius:8, overflow:'hidden'}}>
          <LocalHeroImg hero={h} kind="portrait" />
          <div style={{padding:6}}>{h.localized_name}</div>
        </div>
      ))}
    </div>
  )
}
