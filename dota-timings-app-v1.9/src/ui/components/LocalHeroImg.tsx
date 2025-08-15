
import React, { useState } from 'react'
import type { Hero } from '@/store'
export default function LocalHeroImg({ hero, kind, alt, style, className }:{ hero:Hero, kind:'portrait'|'icon', alt?:string, style?:React.CSSProperties, className?:string }){
  const local = `/assets/heroes/${hero.id}/${kind==='portrait'?'portrait':'icon'}.png`
  const cdn = kind==='portrait' ? hero.img : hero.icon
  const [src, setSrc] = useState(local)
  return <img src={src} alt={alt ?? hero.localized_name} onError={()=> { if (src!==cdn) setSrc(cdn) }} style={style} className={className} loading="lazy"/>
}
