import { useState } from "react";
import { useStore } from "@/store";
import LocalHeroImg from "../components/LocalHeroImg";

function TeamCol({ team }: { team: 1 | 2 }) {
  const heroes = useStore((s) => s.heroes);
  const picks = useStore((s) => (team === 1 ? s.team1 : s.team2));
  const setRole = useStore((s) => s.setRoleForPick);
  const replacePickAt = useStore((s: any) => s.replacePickAt);
  const pickHero = useStore((s) => s.pickHero);
  const draftMode = useStore((s: any) => s.draftMode ?? "manual");

  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const getHero = (id: number) => heroes.find((h) => h.id === id);

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverIdx(idx);
  };
  const onDragLeave = () => setDragOverIdx(null);
  const onDrop = (e: React.DragEvent, idx: number, hasPick: boolean) => {
    e.preventDefault();
    setDragOverIdx(null);
    const heroId = Number(e.dataTransfer.getData("hero_id"));
    if (!heroId) return;
    if (hasPick) {
      replacePickAt?.(team, idx, heroId);
    } else if (draftMode === "cm") {
      pickHero(heroId);
    } else {
      pickHero(heroId, team);
    }
  };

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>Team {team}</strong>
        <span style={{ opacity: 0.7 }}>{picks.length}/5</span>
      </div>
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
          const over = dragOverIdx === i;
          if (!p)
            return (
              <div
                key={i}
                onDragOver={(e) => onDragOver(e, i)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, i, false)}
                style={{
                  border: `1px dashed ${over ? "#58a6ff" : "#30363d"}`,
                  borderRadius: 8,
                  height: 140,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  opacity: over ? 1 : 0.5,
                  background: over ? "#1f6feb14" : "transparent",
                  transition: "background .1s, border-color .1s",
                  color: over ? "#58a6ff" : undefined,
                }}
              >
                {over ? "Drop to pick" : "Empty"}
              </div>
            );
          const hero = getHero(p.hero_id);
          if (!hero) return (
            <div key={i} style={{ border: "1px solid #30363d", borderRadius: 8, height: 140, display: "grid", placeItems: "center", fontSize: 11, opacity: 0.5 }}>
              #{p.hero_id}
            </div>
          );
          return (
            <div
              key={i}
              onDragOver={(e) => onDragOver(e, i)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, i, true)}
              style={{
                border: `1px solid ${over ? "#58a6ff" : "#30363d"}`,
                borderRadius: 8,
                padding: 6,
                background: over ? "#1f6feb14" : "transparent",
                transition: "background .1s, border-color .1s",
                outline: over ? "2px dashed #58a6ff" : undefined,
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
                <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.2 }}>
                  {hero.localized_name}
                </div>
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
                      cursor: "pointer",
                    }}
                  >
                    Pos {pos}
                  </button>
                ))}
              </div>
              {over && (
                <div style={{ fontSize: 11, color: "#58a6ff", marginTop: 4 }}>
                  Drop to replace
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TeamPanel() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <TeamCol team={1} />
      <TeamCol team={2} />
    </div>
  );
}
