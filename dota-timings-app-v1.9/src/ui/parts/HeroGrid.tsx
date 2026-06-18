import { useMemo, useState } from "react";
import { useStore } from "@/store";
import type { PosEntry } from "@/store";
import LocalHeroImg from "@/ui/components/LocalHeroImg";
import { cmPhaseName } from "@/ui/draftUtils";
import { useHeroMeta } from "@/lib/api-hooks";

type DraftMode = "manual" | "cm";

export default function HeroGrid({ mode = "manual" }: { mode: DraftMode }) {
  const heroes = useStore((s) => s.heroes);
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const bans = useStore((s) => s.bans);
  const pickHero = useStore((s) => s.pickHero);
  const banHero = useStore((s) => s.banHero);
  const heroPositions: Record<number, PosEntry[]> = useStore((s: any) => s.heroPositions ?? {});
  const cmSequence = useStore((s: any) => s.cmSequence ?? null);
  const cmStep = useStore((s: any) => s.cmStep ?? 0);
  const ctxScore = useStore((s) => s.contextScoreFor);

  const { data: heroMeta } = useHeroMeta();

  const [metaOn, setMetaOn] = useState(false);
  const [posFilter, setPosFilter] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const currentStep = mode === "cm" ? cmSequence?.[cmStep] : null;

  const taken = useMemo(
    () => new Set(team1.concat(team2).map((p) => p.hero_id)),
    [team1, team2]
  );
  const banned = useMemo(() => new Set(bans.map((b) => b.hero_id)), [bans]);

  const filtered = useMemo(() => {
    let list = heroes.filter((h) =>
      h.localized_name.toLowerCase().includes(q.toLowerCase().trim())
    );

    // Position filter: only show heroes with tier 0 or 1 at that position
    if (posFilter !== null) {
      list = list.filter((h) =>
        (heroPositions[h.id] ?? []).some(
          (e) => e.position === posFilter && e.tier <= 1
        )
      );
    }

    // META sort: sort by overall meta score (descending)
    if (metaOn && heroMeta) {
      const score = (id: number) => heroMeta[id]?.score ?? 0;
      list = list.slice().sort((a, b) => score(b.id) - score(a.id));
    }

    return list;
  }, [heroes, q, posFilter, metaOn, heroMeta, heroPositions]);

  const onHeroClick = (id: number) => {
    if (taken.has(id) || banned.has(id)) return;
    if (mode === "cm") {
      if (currentStep?.type === "ban") return banHero(id);
      return pickHero(id);
    }
    pickHero(id);
  };

  const POS_LABEL: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Off", 4: "Soft", 5: "Hard" };

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 8 }}>
      {/* Controls row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={metaOn}
            onChange={(e) => setMetaOn(e.target.checked)}
          />
          META
        </label>

        {/* Position filter buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              onClick={() => setPosFilter(posFilter === p ? null : p)}
              title={`Filter to ${POS_LABEL[p]} (pos ${p})`}
              style={{
                padding: "3px 7px",
                border: "1px solid #30363d",
                borderRadius: 999,
                background: posFilter === p ? "#161b22" : "#0d1117",
                color: posFilter === p ? "#58a6ff" : "#8b949e",
                borderColor: posFilter === p ? "#58a6ff" : "#30363d",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* CM step indicator */}
        {mode === "cm" && currentStep && (
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 11, opacity: 0.45, fontStyle: "italic" }}>
              {cmPhaseName(cmStep)}
            </span>
            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "2px 9px", border: "1px solid #30363d", borderRadius: 999, background: "#0d1117", fontSize: 12 }}>
              <span style={{ color: currentStep.team === "team1" ? "#3fb950" : "#f85149" }}>
                {currentStep.team === "team1" ? "Team 1" : "Team 2"}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ color: currentStep.type === "ban" ? "#d29922" : "#58a6ff" }}>
                {currentStep.type === "ban" ? "BAN" : "PICK"}
              </span>
              <span style={{ opacity: 0.35 }}>#{cmStep + 1}</span>
            </div>
          </div>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          style={{ padding: "5px 8px", border: "1px solid #30363d", borderRadius: 8, background: "#0d1117", color: "#e6edf3", width: 150, fontSize: 12 }}
        />
      </div>

      {/* Count hint */}
      {(posFilter !== null || metaOn) && (
        <div style={{ fontSize: 11, opacity: 0.35, marginBottom: 6 }}>
          {filtered.length} heroes
          {posFilter !== null ? ` · Pos ${posFilter} (${POS_LABEL[posFilter]})` : ""}
          {metaOn ? " · sorted by meta score" : ""}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(82px, 1fr))", gap: 6 }}>
        {filtered.map((h) => {
          const isTaken  = taken.has(h.id);
          const isBanned = banned.has(h.id);
          const disabled = isTaken || isBanned;
          const meta = heroMeta?.[h.id];
          return (
            <div
              key={h.id}
              draggable={!disabled}
              onDragStart={(e) => {
                if (disabled) { e.preventDefault(); return; }
                e.dataTransfer.setData("hero_id", String(h.id));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onHeroClick(h.id)}
              style={{
                border: "1px solid #30363d",
                borderRadius: 8,
                overflow: "hidden",
                cursor: disabled ? "not-allowed" : "grab",
                position: "relative",
              }}
              title={isTaken ? "Already picked" : isBanned ? "Banned" : h.localized_name}
            >
              {/* Context / meta score badge */}
              <div style={{
                position: "absolute", top: 3, right: 3, fontSize: 10, opacity: 0.85,
                padding: "1px 5px", border: "1px solid #30363d", borderRadius: 999, background: "#0d111799",
              }}>
                {(() => {
                  const v = ctxScore(h.id);
                  return (v > 0 ? "+" : "") + v;
                })()}
              </div>

              {/* Meta score tier dot (top-left, only when META on) */}
              {metaOn && meta && meta.score > 0 && (
                <div style={{
                  position: "absolute", top: 3, left: 3,
                  width: 7, height: 7, borderRadius: "50%",
                  background: meta.score > 15 ? "#f85149" : meta.score > 8 ? "#d29922" : "#3fb95088",
                  boxShadow: meta.score > 15 ? "0 0 4px #f85149" : undefined,
                }} title={`Meta score ${meta.score} (${meta.pro_pick} pro picks)`} />
              )}

              <LocalHeroImg
                hero={h}
                kind="portrait"
                style={{
                  width: "100%",
                  display: "block",
                  filter: isTaken ? "blur(1.5px) saturate(.5) brightness(.6)" : "none",
                  opacity: isBanned ? 0.5 : 1,
                }}
              />
              <div style={{ padding: "3px 4px", textAlign: "center", fontSize: 11, background: "#0d1117", borderTop: "1px solid #30363d" }}>
                {h.localized_name}
              </div>
              {isBanned && (
                <div aria-hidden style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: "repeating-linear-gradient(135deg, rgba(220,0,0,.25) 0 6px, transparent 6px 12px)",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
