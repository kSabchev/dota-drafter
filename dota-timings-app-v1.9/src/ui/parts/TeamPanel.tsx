import { useStore } from "@/store";
import LocalHeroImg from "../components/LocalHeroImg";

function TeamCol({ team }: { team: 1 | 2 }) {
  const heroes = useStore((s) => s.heroes);
  const picks = useStore((s) => (team === 1 ? s.team1 : s.team2));
  const setRole = useStore((s) => s.setRoleForPick);

  const getHero = (id: number) => heroes.find((h) => h.id === id);

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>Team {team}</strong>
        <span style={{ opacity: 0.7 }}>{picks.length}/5</span>
      </div>
      <div></div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0,1fr))",
          gap: 8,
          marginTop: 8,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const p = picks[i];
          if (!p)
            return (
              <div
                key={i}
                style={{
                  border: "1px dashed #30363d",
                  borderRadius: 8,
                  height: 140,
                  display: "grid",
                  placeItems: "center",
                  opacity: 0.5,
                }}
              >
                Empty
              </div>
            );
          const hero = getHero(p.hero_id)!;
          return (
            <div
              key={i}
              style={{
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <LocalHeroImg
                  hero={hero}
                  kind="icon"
                  style={{ width: 24, height: 24, borderRadius: 4 }}
                />
                <div style={{ fontWeight: 600 }}>{hero.localized_name}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setRole(team, i, pos)}
                    style={{
                      padding: "2px 6px",
                      border: "1px solid #30363d",
                      borderRadius: 999,
                      background: p.role === pos ? "#1f6feb22" : "#0d1117",
                      color: "#e6edf3",
                      fontSize: 12,
                    }}
                  >
                    Pos {pos}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// export default function TeamPanel() {
//   return (
//     <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

export default function TeamPanel(props: any) {
  const { team, heroes, title, active = false, teamId } = props;
  // container style:
  return (
    <div
      style={{
        padding: "8px",
        background: active ? "#0f1a12" : "#111",
        borderRadius: "6px",
        border: active ? "1px solid #1f6f3e" : "1px solid #30363d",
        boxShadow: active ? "0 0 0 2px rgba(46,160,67,.15) inset" : "none",
      }}
    >
      <h3 style={{ marginBottom: "8px", color: "#fff", fontSize: "1.1em" }}>
        {title || (teamId ? `Team ${teamId}` : "Team")}
      </h3>
      <TeamCol team={1} />
      <TeamCol team={2} />
    </div>
  );
}
