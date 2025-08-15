
import { mkdir, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'

const streamPipeline = promisify(pipeline)
type Hero = { id:number; localized_name:string; img:string; icon:string }
const API_BASE = process.env.API_BASE || 'http://localhost:8787'
const FALLBACK_OD = 'https://api.opendota.com/api/constants/heroes'
const CDN = 'https://cdn.cloudflare.steamstatic.com'
const OUT = path.resolve('public/assets/heroes')

async function fetchJSON<T>(url:string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error('GET '+url+' -> '+r.status)
  return r.json() as Promise<T>
}
async function fileExists(p:string){ try{ await stat(p); return true } catch{ return false } }
async function download(url:string, dest:string){
  const r=await fetch(url); if(!r.ok || !r.body) throw new Error('dl '+url+' -> '+r.status)
  await mkdir(path.dirname(dest), { recursive:true })
  await streamPipeline(r.body as any, createWriteStream(dest))
}
const stripQ=(u:string)=> u.includes('?') ? u.slice(0,u.indexOf('?')) : u

async function main(){
  let heroes: Hero[] = []
  try {
    const j = await fetchJSON<{heroes:Hero[]}>(API_BASE+'/constants/heroes')
    heroes = j.heroes
    console.log('heroes from middleware:', heroes.length)
  } catch {
    console.warn('fallback to OpenDota constants')
    const j = await fetchJSON<Record<string, any>>(FALLBACK_OD)
    heroes = Object.values(j).map((h:any)=> ({ id:h.id, localized_name:h.localized_name, img:CDN+h.img, icon:CDN+h.icon }))
  }
  let dl=0, skip=0, fail=0
  for (const h of heroes){
    const dir = path.join(OUT, String(h.id))
    const portrait = stripQ(h.img.startsWith('http')?h.img:CDN+h.img)
    const icon = stripQ(h.icon.startsWith('http')?h.icon:CDN+h.icon)
    const pOut = path.join(dir, 'portrait.png')
    const iOut = path.join(dir, 'icon.png')
    try{
      if(!(await fileExists(pOut))){ await download(portrait, pOut); dl++ } else skip++
      if(!(await fileExists(iOut))){ await download(icon, iOut); dl++ } else skip++
      process.stdout.write('.')
    }catch(e:any){ fail++; console.warn('\nfail', h.localized_name, e.message) }
  }
  console.log(`\nDone. dl=${dl} skip=${skip} fail=${fail}`)
}
main().catch(e=>{ console.error(e); process.exit(1) })
