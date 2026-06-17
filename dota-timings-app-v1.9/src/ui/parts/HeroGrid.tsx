import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import LocalHeroImg from "@/ui/components/LocalHeroImg";
import { cmPhaseName } from "@/ui/draftUtils";

type DraftMode = "manual" | "cm";

export default function HeroGrid({ mode = "manual" }: { mode: DraftMode }) {
  const heroes = useStore((s) => s.heroes);
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const bans = useStore((s) => s.bans);
  const pickHero = useStore((s) => s.pickHero);
  const banHero = useStore((s) => s.banHero);
  const loadMeta = useStore((s) => s.loadMeta);
  const meta = useStore((s) => s.metaByRole);
  const cmSequence = useStore((s: any) => s.cmSequence ?? null);
  const cmStep = useStore((s: any) => s.cmStep ?? 0);
  useEffect(() => {
    if (!meta) loadMeta().catch(() => {});
  }, [meta, loadMeta]);

  const [metaOn, setMetaOn] = useState(false);
  const [role, setRole] = useState<1 | 2 | 3 | 4 | 5>(1);
  const ctxScore = useStore((s) => s.contextScoreFor);

  const [q, setQ] = useState("");

  const currentStep = mode === "cm" ? cmSequence?.[cmStep] : null;

  const taken = useMemo(
    () => new Set(team1.concat(team2).map((p) => p.hero_id)),
    [team1, team2]
  );
  const banned = useMemo(() => new Set(bans.map((b) => b.hero_id)), [bans]);

  // const filtered = useMemo(
  //   () =>
  //     heroes.filter((h) =>
  //       h.localized_name.toLowerCase().includes(q.toLowerCase().trim())
  //     ),
  //   [heroes, q]
  // );

  const filtered = useMemo(() => {
    const list = heroes.filter((h) =>
      h.localized_name.toLowerCase().includes(q.toLowerCase().trim())
    );
    if (metaOn && meta && meta[role]) {
      const rank = new Map(meta[role].map((m, i) => [m.hero_id, i])); // smaller i = higher rank
      return list
        .slice()
        .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    }
    return list;
  }, [heroes, q, metaOn, meta, role]);

  const onHeroClick = (id: number) => {
    if (taken.has(id) || banned.has(id)) return;
    if (mode === "cm") {
      if (currentStep?.type === "ban") return banHero(id);
      return pickHero(id);
    }
    pickHero(id);
  };

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={metaOn}
            onChange={(e) => setMetaOn(e.target.checked)}
          />
          META
        </label>
        {metaOn && (
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => setRole(r as any)}
                style={{
                  padding: "4px 8px",
                  border: "1px solid #30363d",
                  borderRadius: 999,
                  background: role === r ? "#161b22" : "#0d1117",
                  color: "#e6edf3",
                }}
              >
                Pos {r}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <strong>Heroes</strong>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search..."
          style={{
            padding: "6px 8px",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "#0d1117",
            color: "#e6edf3",
            minWidth: 180,
          }}
        />

        {mode === "cm" && currentStep && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, opacity: 0.45, fontStyle: "italic" }}>
              {cmPhaseName(cmStep)}
            </span>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: "3px 10px",
                border: "1px solid #30363d",
                borderRadius: 999,
                background: "#0d1117",
                fontSize: 12,
              }}
            >
              <span style={{ color: currentStep.team === "team1" ? "#3fb950" : "#f85149" }}>
                {currentStep.team === "team1" ? "Team 1" : "Team 2"}
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ color: currentStep.type === "ban" ? "#d29922" : "#58a6ff" }}>
                {currentStep.type === "ban" ? "BAN" : "PICK"}
              </span>
              <span style={{ opacity: 0.4, marginLeft: 2 }}>#{cmStep + 1}</span>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
          gap: 8,
        }}
      >
        {filtered.map((h) => {
          const isTaken = taken.has(h.id);
          const isBanned = banned.has(h.id);
          const disabled = isTaken || isBanned;
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
              title={
                isTaken
                  ? "Already picked"
                  : isBanned
                  ? "Banned"
                  : h.localized_name
              }
            >
              {" "}
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  fontSize: 11,
                  opacity: 0.85,
                  padding: "1px 6px",
                  border: "1px solid #30363d",
                  borderRadius: 999,
                }}
              >
                {(() => {
                  const v = ctxScore(h.id);
                  return (v > 0 ? "+" : "") + v;
                })()}
              </div>
              <LocalHeroImg
                hero={h}
                kind="portrait"
                style={{
                  width: "100%",
                  display: "block",
                  filter: isTaken
                    ? "blur(1.5px) saturate(.5) brightness(.6)"
                    : "none",
                  opacity: isBanned ? 0.5 : 1,
                }}
              />
              {/* tiny footer label */}
              <div
                style={{
                  padding: 4,
                  textAlign: "center",
                  fontSize: 12,
                  background: "#0d1117",
                  borderTop: "1px solid #30363d",
                }}
              >
                {h.localized_name}
              </div>
              {/* banned overlay slash */}
              {isBanned && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                      "repeating-linear-gradient(135deg, rgba(220,0,0,.25) 0 6px, transparent 6px 12px)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

