
import { useStore } from '@/store'
import LocalHeroImg from './components/LocalHeroImg'
export default function Profiles(){
  const heroes = useStore(s=> s.heroes)
  const profilesByHero = useStore(s=> s.profilesByHero)
  return (
    <div style={{display:'grid', gap:8}}>
      {heroes.slice(0,50).map(h=>{
        const list = profilesByHero[h.id]||[]
        return (
          <div key={h.id} style={{border:'1px solid #30363d', borderRadius:8, padding:8}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <LocalHeroImg hero={h} kind="icon" style={{width:24,height:24,borderRadius:4}}/>
              <strong>{h.localized_name}</strong>
            </div>
            <ul>
              {list.map(p=> <li key={p.id}>{p.name} — Pos {p.positions.join('/')}</li>)}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
