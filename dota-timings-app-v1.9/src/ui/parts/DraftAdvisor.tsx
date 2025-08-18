import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import LocalHeroImg from "@/ui/components/LocalHeroImg";
import { useAdvisorSuggest } from "@/lib/api-hooks";

export default function DraftAdvisor() {
  const heroes = useStore((s) => s.heroes);
  const pickHero = useStore((s) => s.pickHero);
  const banHero = useStore((s) => s.banHero);

  const minute = useStore((s: any) => s.minute ?? 15);
  const team1 = useStore((s: any) => s.team1 ?? []);
  const team2 = useStore((s: any) => s.team2 ?? []);
  const roles = useStore((s: any) => s.roles ?? { team1: [], team2: [] });
  const banned = useStore((s: any) => s.banned ?? []);

  // Perspective: whose turn is it?
  const manualActive = useStore((s: any) => {
    const n = (s.team1?.length ?? 0) + (s.team2?.length ?? 0);
    return n % 2 === 0 ? "team1" : "team2";
  });
  const activeTeam = useStore((s: any) => s.activeTeam ?? manualActive);
  const perspective = activeTeam === "team2" ? "team2" : "team1";

  // picked list (both teams)
  const picked = useMemo(
    () => [
      ...team1.map((p: any) => p.hero_id),
      ...team2.map((p: any) => p.hero_id),
    ],
    [team1, team2]
  );

  const nameById = (id: number) =>
    heroes.find((h) => h.id === id)?.localized_name || "#" + id;

  const { mutateAsync: suggest, isPending, error } = useAdvisorSuggest();
  const [data, setData] = useState<any>(null);

  async function run() {
    const res = await suggest({
      minute,
      teams: { team1, team2 },
      picked,
      banned,
      roles,
      perspective,
    });
    setData(res);
  }

  // Re-run when inputs change (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      run().catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [minute, team1.length, team2.length, perspective]); // include perspective

  // Render lists from API data (fallback to empty arrays)
  const ally = data?.allySuggestions ?? [];
  const deny = data?.banSuggestions ?? [];
  const coverage = data?.coverage ?? [];

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <strong>Draft Advisor</strong>
        <button
          onClick={() => run().catch((e) => alert(e.message))}
          disabled={isPending}
          style={{
            padding: "6px 10px",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "#0d1117",
            color: "#e6edf3",
          }}
        >
          {isPending ? "Computing…" : "Run"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#f85149", marginBottom: 8 }}>
          Failed to fetch suggestions.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Ally picks */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Suggestions for{" "}
            {perspective === "team2" ? "Team 2 (Dire)" : "Team 1 (Radiant)"}
          </div>
          {ally.map((s: any) => {
            const h = heroes.find((x) => x.id === s.hero_id);
            return (
              <div
                key={s.hero_id}
                style={{
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  padding: 6,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {h && (
                    <LocalHeroImg
                      hero={h}
                      kind="icon"
                      style={{ width: 28, height: 28, borderRadius: 4 }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        marginBottom: 2,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {s.name || nameById(s.hero_id)}
                      </div>
                      <SmallBadges reasons={s.reasons} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        opacity: 0.85,
                      }}
                    >
                      <div>
                        ΔFight {fmt(s.deltas?.fight)} • ΔPush{" "}
                        {fmt(s.deltas?.push)} • ΔPick {fmt(s.deltas?.pickoff)}
                      </div>
                      <Sparkline
                        points={[
                          getAxisAtMinute(s, 10, "push"),
                          getAxisAtMinute(s, 15, "push"),
                          getAxisAtMinute(s, 20, "push"),
                          getAxisAtMinute(s, 25, "push"),
                        ]}
                      />
                    </div>
                    {Array.isArray(s.itemsLikely) &&
                      s.itemsLikely.length > 0 && (
                        <div
                          style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}
                        >
                          Likely:{" "}
                          {s.itemsLikely
                            .filter((it: any) => it.minute >= (minute || 15))
                            .sort((a: any, b: any) => a.minute - b.minute)
                            .slice(0, 2)
                            .map((it: any) => `${it.label} @${it.minute}`)
                            .join(", ")}
                        </div>
                      )}
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button
                      onClick={() => pickHero(s.hero_id)}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid #30363d",
                        borderRadius: 6,
                        background: "#0d1117",
                        color: "#e6edf3",
                      }}
                    >
                      Queue Pick
                    </button>
                    {/* Future: Why? modal from /advisor/explain */}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Deny bans */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Deny Bans</div>
          {deny.map((s: any) => {
            const h = heroes.find((x) => x.id === s.hero_id);
            return (
              <div
                key={s.hero_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  padding: 6,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {h && (
                    <LocalHeroImg
                      hero={h}
                      kind="icon"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        filter: "grayscale(100%) brightness(.85)",
                      }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        marginBottom: 2,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {s.name || nameById(s.hero_id)}
                      </div>
                      <SmallBadges reasons={s.reasons} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        opacity: 0.85,
                      }}
                    >
                      <div>
                        Enemy Ctx {(s.enemyContextGain ?? 0) >= 0 ? "+" : ""}
                        {s.enemyContextGain ?? 0}
                      </div>
                      <Sparkline
                        points={[
                          getAxisAtMinute(s, 10, "push"),
                          getAxisAtMinute(s, 15, "push"),
                          getAxisAtMinute(s, 20, "push"),
                          getAxisAtMinute(s, 25, "push"),
                        ]}
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => banHero(s.hero_id)}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    background: "#0d1117",
                    color: "#e6edf3",
                  }}
                >
                  Queue Ban
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coverage from API response */}
      <div style={{ marginTop: 8 }}>
        <YouLack coverage={coverage} ally={ally} />
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Coverage</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {coverage.map((c: any) => (
            <span
              key={c.tag}
              style={{
                padding: "2px 8px",
                border: "1px solid #30363d",
                borderRadius: 999,
                background: c.ok ? "#12361f" : "#361212",
              }}
            >
              {c.tag}
              {c.ok ? " ✓" : " ✗"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- helpers (unchanged or slightly tweaked)
function fmt(n?: number) {
  if (typeof n !== "number") return "0";
  return (n > 0 ? "+" : "") + Math.round(n);
}
function SmallBadges({ reasons }: { reasons?: string[] }) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {reasons.slice(0, 3).map((r) => (
        <span
          key={r}
          style={{
            fontSize: 11,
            padding: "1px 6px",
            border: "1px solid #30363d",
            borderRadius: 999,
          }}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
function Sparkline({ points }: { points: number[] }) {
  const w = 80,
    h = 24;
  if (!points || points.length === 0) return null;
  const max = Math.max(1, ...points),
    min = Math.min(...points);
  const span = Math.max(1, max - min);
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ opacity: 0.8 }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function getAxisAtMinute(
  s: { deltasByMinute?: Record<string | number, any> },
  minute: number,
  axis: "fight" | "pickoff" | "push" | "rosh" | "scale"
): number {
  const d = s?.deltasByMinute?.[minute];
  if (d == null) return 0;
  if (typeof d === "number") return d;
  const v = d?.[axis];
  return typeof v === "number" ? v : 0;
}
function YouLack({ coverage, ally }: { coverage: any[]; ally: any[] }) {
  const missing = (coverage || []).filter((c) => !c.ok).map((c) => c.tag);
  if (missing.length === 0) return null;
  const priority = [
    "stun",
    "dispel",
    "save",
    "waveclear",
    "vision",
    "initiator",
    "roshan",
    "tower_damage",
    "mobility",
    "aura_carrier",
    "scale",
  ];
  const score = (tag: string) => {
    const i = priority.indexOf(tag);
    return i < 0 ? 999 : i;
  };
  const top = [...missing].sort((a, b) => score(a) - score(b)).slice(0, 4);
  const fixesMap: Record<string, string[]> = {};
  for (const tag of top) {
    const fromSuggestions = (ally || [])
      .filter((a: any) => (a.profile?.tags || []).includes(tag))
      .slice(0, 3)
      .map((a: any) => a.name);
    fixesMap[tag] = fromSuggestions.length ? fromSuggestions : HINTS[tag] || [];
  }
  return (
    <div style={{ marginBottom: 6, fontSize: 13 }}>
      <span style={{ opacity: 0.9, marginRight: 6 }}>You lack:</span>
      {top.map((t) => (
        <span
          key={t}
          style={{
            marginRight: 6,
            padding: "2px 8px",
            border: "1px solid #803",
            color: "#f88",
            borderRadius: 999,
          }}
        >
          {t}
        </span>
      ))}
      {missing.length > top.length && (
        <span style={{ opacity: 0.6 }}>
          +{missing.length - top.length} more
        </span>
      )}
    </div>
  );
}

const HINTS: Record<string, string[]> = {
  stun: ["Sven", "Lion", "Shadow Shaman", "Centaur"],
  dispel: ["Oracle", "Abaddon", "Legion Commander", "Keeper of the Light"],
  save: ["Oracle", "Dazzle", "Vengeful Spirit", "Tusk"],
  waveclear: ["Lina", "Zeus", "KotL", "Sven"],
  vision: ["Beastmaster", "Night Stalker", "Treant"],
  initiator: ["Centaur", "Magnus", "Axe", "Earthshaker"],
  roshan: ["Ursa", "TA", "Drow", "AC carrier"],
  tower_damage: ["TA", "Drow", "Lycan", "DK", "AC carrier"],
  mobility: ["Storm", "QoP", "Pangolier", "Earth Spirit"],
  aura_carrier: ["Greaves/Pipe/AC builders"],
  scale: ["Spectre", "Medusa", "Naga", "TB"],
};
