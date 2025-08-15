import { useStore } from "@/store";

export default function Timeline() {
  const minute = useStore((s) => s.minute);
  const setMinute = (m: number) => useStore.setState({ minute: m });

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <strong>Minute</strong>
        <span style={{ opacity: 0.8 }}>{minute} min</span>
      </div>
      <input
        type="range"
        min={0}
        max={50}
        step={1}
        value={minute}
        onChange={(e) => setMinute(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 6,
          fontSize: 12,
          opacity: 0.8,
        }}
      >
        <span>Roshan 8</span>
        <span>Tormentor 20</span>
      </div>
    </div>
  );
}

// import { useStore } from '@/store'

// export default function Timeline(){
//   const minute = useStore(s=> s.minute)
//   const setMinute = (m:number)=> useStore.setState({ minute: Math.max(0, Math.min(60, m)) })
//   return (
//     <div style={{border:'1px solid #30363d', borderRadius:8, padding:8}}>
//       <div style={{display:'flex', gap:8, alignItems:'center'}}>
//         <strong>Timeline</strong>
//         <input type="range" min={0} max={60} value={minute} onChange={(e)=> setMinute(Number(e.target.value))} style={{flex:1}}/>
//         <span>{minute}m</span>
//       </div>
//       <div style={{marginTop:6, fontSize:12, opacity:.8}}>Markers: 8m Roshan (earliest), 20m Tormentor</div>
//     </div>
//   )
// }
