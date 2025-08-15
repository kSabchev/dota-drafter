import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import LocalHeroImg from "@/ui/components/LocalHeroImg";

type DraftMode = "manual" | "captains";

export default function HeroGrid({ mode = "manual" }: { mode: DraftMode }) {
  const heroes = useStore((s) => s.heroes);
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const bans = useStore((s) => s.bans);
  const pickHero = useStore((s) => s.pickHero);
  const banHero = useStore((s) => s.banHero);
  const loadMeta = useStore((s) => s.loadMeta);
  const meta = useStore((s) => s.metaByRole);
  useEffect(() => {
    if (!meta) loadMeta().catch(() => {});
  }, [meta, loadMeta]);

  const [metaOn, setMetaOn] = useState(false);
  const [role, setRole] = useState<1 | 2 | 3 | 4 | 5>(1);
  const ctxScore = useStore((s) => s.contextScoreFor);

  const [q, setQ] = useState("");
  // in "captains" mode, let the user choose whether clicks do Pick or Ban (since real CM sequencing is skipped)
  const [capAction, setCapAction] = useState<"pick" | "ban">("pick");

  const taken = useMemo(
    () => new Set(team1.concat(team2).map((p) => p.hero_id)),
    [team1, team2]
  );
  const banned = useMemo(() => new Set(bans), [bans]);

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
    if (mode === "captains") {
      if (capAction === "ban") return banHero(id);
      return pickHero(id);
    }
    // manual mode
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

        {mode === "captains" && (
          <div
            style={{
              display: "flex",
              gap: 6,
              border: "1px solid #30363d",
              borderRadius: 999,
              padding: 2,
              background: "#0d1117",
            }}
          >
            <button
              onClick={() => setCapAction("pick")}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "none",
                background: capAction === "pick" ? "#161b22" : "transparent",
                color: "#e6edf3",
                cursor: "pointer",
              }}
            >
              Pick
            </button>
            <button
              onClick={() => setCapAction("ban")}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "none",
                background: capAction === "ban" ? "#161b22" : "transparent",
                color: "#e6edf3",
                cursor: "pointer",
              }}
            >
              Ban
            </button>
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
              onClick={() => onHeroClick(h.id)}
              style={{
                border: "1px solid #30363d",
                borderRadius: 8,
                overflow: "hidden",
                cursor: disabled ? "not-allowed" : "pointer",
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
