import { useEffect, useMemo, useState, useCallback } from "react";
import { useStore } from "@/store";
import LocalHeroImg from "@/ui/components/LocalHeroImg";
import { useAdvisorSuggest } from "@/lib/api-hooks";

type AdvisorTab = "synergy" | "counter" | "bans";

export default function DraftAdvisor() {
  const heroes = useStore((s) => s.heroes);
  const pickHero = useStore((s) => s.pickHero);
  const banHero = useStore((s) => s.banHero);

  const minute = useStore((s: any) => s.minute ?? 15);
  const team1 = useStore((s: any) => s.team1 ?? []);
  const team2 = useStore((s: any) => s.team2 ?? []);
  const banned = useStore((s: any) => (s.bans ?? []).map((b: any) => b.hero_id ?? b));

  // Roles live inline on each pick (p.role), not as a separate store field.
  // Derive the { team1: number[], team2: number[] } shape the API expects.
  const roles = useMemo(
    () => ({
      team1: team1.map((p: any) => p.role ?? null),
      team2: team2.map((p: any) => p.role ?? null),
    }),
    [team1, team2]
  );

  // Perspective: whose turn is it?
  const manualActive = useStore((s: any) => {
    const n = (s.team1?.length ?? 0) + (s.team2?.length ?? 0);
    return n % 2 === 0 ? "team1" : "team2";
  });
  const activeTeam = useStore((s: any) => s.activeTeam ?? manualActive);
  const perspective = activeTeam === "team2" ? "team2" : "team1";

  const draftMode = useStore((s: any) => s.draftMode ?? "manual");
  const cmSequence = useStore((s: any) => s.cmSequence ?? null);
  const cmStep = useStore((s: any) => s.cmStep ?? 0);
  const currentCmStep = draftMode === "cm" ? (cmSequence?.[cmStep] ?? null) : null;

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
  const [tab, setTab] = useState<AdvisorTab>("synergy");

  const run = useCallback(async () => {
    const res = await suggest({
      minute,
      teams: { team1, team2 },
      picked,
      banned,
      roles,
      perspective,
    });
    setData(res);
  }, [suggest, minute, team1, team2, picked, banned, roles, perspective]);

  // Re-run when inputs change (debounced)
  useEffect(() => {
    const t = setTimeout(() => { run().catch(() => {}); }, 200);
    return () => clearTimeout(t);
  }, [minute, team1.length, team2.length, banned.length, perspective, JSON.stringify(roles)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render lists from API data (fallback to empty arrays)
  const ally       = data?.allySuggestions   ?? [];
  const deny       = data?.banSuggestions    ?? [];
  const counters   = data?.counterSuggestions ?? [];
  const coverage   = data?.coverage          ?? [];
  const matrixAvailable = data?.matrixAvailable !== false;

  // Enemy picks (from perspective)
  const enemyPicks = perspective === "team2" ? team1 : team2;

  const canPick = !(draftMode === "cm" && currentCmStep?.type !== "pick");
  const canBan  = !(draftMode === "cm" && currentCmStep?.type !== "ban");

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>Draft Advisor</strong>
        <button
          onClick={() => run().catch((e: any) => alert(e.message))}
          disabled={isPending}
          style={{ padding: "4px 10px", border: "1px solid #30363d", borderRadius: 8, background: "#0d1117", color: "#e6edf3", fontSize: 12 }}
        >
          {isPending ? "Computing…" : "Refresh"}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: "#f85149", marginBottom: 8 }}>Server unreachable.</div>}
      {!error && data && !matrixAvailable && (
        <div style={{ fontSize: 11, color: "#d29922", marginBottom: 8, opacity: 0.85 }}>
          Matrix not loaded — run Sync &amp; Reload for data-driven suggestions.
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {(["synergy", "counter", "bans"] as AdvisorTab[]).map((t) => {
          const labels: Record<AdvisorTab, string> = {
            synergy: "Synergy",
            counter: `Counter${counters.length ? ` (${counters.length})` : ""}`,
            bans: "Deny Bans",
          };
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "3px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer",
              border: `1px solid ${active ? "#58a6ff" : "#30363d"}`,
              background: active ? "#1f6feb22" : "transparent",
              color: active ? "#58a6ff" : "#8b949e",
            }}>
              {labels[t]}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.45, alignSelf: "center" }}>
          for {perspective === "team2" ? "T2" : "T1"}
        </span>
      </div>

      {/* ── Synergy tab ── */}
      {tab === "synergy" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ally.length === 0 && !isPending && (
            <div style={{ fontSize: 12, opacity: 0.4 }}>Pick a hero to see suggestions.</div>
          )}
          {ally.map((s: any) => {
            const h = heroes.find((x: any) => x.id === s.hero_id);
            return (
              <div key={s.hero_id} style={{ border: "1px solid #30363d", borderRadius: 8, padding: "6px 8px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {h && <LocalHeroImg hero={h} kind="icon" style={{ width: 32, height: 32, borderRadius: 5, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name || nameById(s.hero_id)}</span>
                      {s.counterScore > 0 && (
                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 999, background: "#f8514918", border: "1px solid #f8514944", color: "#f85149" }}>
                          ↯ counter
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 2 }}>
                      Fight {fmt(s.deltas?.fight)} · Push {fmt(s.deltas?.push)} · Pick {fmt(s.deltas?.pickoff)}
                    </div>
                    <SmallBadges reasons={s.reasons} />
                    {Array.isArray(s.itemsLikely) && s.itemsLikely.length > 0 && (
                      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>
                        {s.itemsLikely
                          .filter((it: any) => it.minute >= (minute || 15))
                          .sort((a: any, b: any) => a.minute - b.minute)
                          .slice(0, 2)
                          .map((it: any) => `${it.label} @${it.minute}m`)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => pickHero(s.hero_id)}
                    disabled={!canPick}
                    title={canPick ? "Queue pick" : "Not a pick step"}
                    style={{
                      padding: "3px 8px", fontSize: 11, borderRadius: 6, flexShrink: 0,
                      border: "1px solid #30363d", background: "#0d1117",
                      color: canPick ? "#e6edf3" : "#484f58", cursor: canPick ? "pointer" : "not-allowed",
                    }}
                  >
                    Pick
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Counter Picks tab ── */}
      {tab === "counter" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {enemyPicks.length === 0 ? (
            <div style={{ fontSize: 12, color: "#8b949e", opacity: 0.6, padding: "8px 0" }}>
              No enemy picks yet. Counter suggestions appear as the opponent drafts.
            </div>
          ) : counters.length === 0 && !isPending ? (
            <div style={{ fontSize: 12, opacity: 0.4 }}>No matrix data — run Sync &amp; Reload.</div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>
                Best heroes vs {enemyPicks.map((p: any) => heroes.find((h: any) => h.id === p.hero_id)?.localized_name ?? `#${p.hero_id}`).join(", ")}
              </div>
              {counters.map((s: any, rank: number) => {
                const h = heroes.find((x: any) => x.id === s.hero_id);
                return (
                  <div key={s.hero_id} style={{ border: "1px solid #30363d", borderRadius: 8, padding: "6px 8px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      {/* Rank */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: rank < 3 ? "#f0883e" : "#484f58", width: 16, flexShrink: 0, paddingTop: 8, textAlign: "center" }}>
                        {rank + 1}
                      </div>
                      {h && <LocalHeroImg hero={h} kind="icon" style={{ width: 32, height: 32, borderRadius: 5, flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name || nameById(s.hero_id)}</span>
                          {s.roleFit && (
                            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 999, background: "#3fb95018", border: "1px solid #3fb95044", color: "#3fb950" }}>
                              fits role
                            </span>
                          )}
                        </div>
                        {/* Per-enemy matchup chips */}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(s.counterVs ?? []).map((v: any) => {
                            const advantage = v.wr - 50;
                            const chipColor = advantage >= 5 ? "#f85149" : advantage >= 2 ? "#d29922" : "#8b949e";
                            const enemyHero = heroes.find((x: any) => x.id === v.hero_id);
                            return (
                              <div key={v.hero_id} title={`${v.name}: ${v.wr}% win rate`} style={{
                                display: "flex", alignItems: "center", gap: 3,
                                padding: "2px 6px", borderRadius: 999,
                                background: `${chipColor}12`, border: `1px solid ${chipColor}44`,
                              }}>
                                {enemyHero && (
                                  <LocalHeroImg hero={enemyHero} kind="icon" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} />
                                )}
                                <span style={{ fontSize: 10, color: chipColor, fontWeight: 600 }}>
                                  {v.name.split(" ")[0]}
                                </span>
                                <span style={{ fontSize: 10, color: chipColor, opacity: 0.8 }}>
                                  {v.wr}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => pickHero(s.hero_id)}
                        disabled={!canPick}
                        title={canPick ? "Queue pick" : "Not a pick step"}
                        style={{
                          padding: "3px 8px", fontSize: 11, borderRadius: 6, flexShrink: 0,
                          border: "1px solid #30363d", background: "#0d1117",
                          color: canPick ? "#e6edf3" : "#484f58", cursor: canPick ? "pointer" : "not-allowed",
                        }}
                      >
                        Pick
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Deny Bans tab ── */}
      {tab === "bans" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {deny.length === 0 && !isPending && (
            <div style={{ fontSize: 12, opacity: 0.4 }}>No ban suggestions yet.</div>
          )}
          {deny.map((s: any) => {
            const h = heroes.find((x: any) => x.id === s.hero_id);
            return (
              <div key={s.hero_id} style={{ border: "1px solid #30363d", borderRadius: 8, padding: "6px 8px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {h && (
                    <LocalHeroImg hero={h} kind="icon" style={{ width: 32, height: 32, borderRadius: 5, flexShrink: 0, filter: "grayscale(80%) brightness(.75)" }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{s.name || nameById(s.hero_id)}</div>
                    <SmallBadges reasons={s.reasons} />
                    <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>
                      Enemy gain if picked: {(s.enemyContextGain ?? 0) >= 0 ? "+" : ""}{s.enemyContextGain ?? 0}
                    </div>
                  </div>
                  <button
                    onClick={() => banHero(s.hero_id)}
                    disabled={!canBan}
                    title={canBan ? "Queue ban" : "Not a ban step"}
                    style={{
                      padding: "3px 8px", fontSize: 11, borderRadius: 6, flexShrink: 0,
                      border: "1px solid #30363d", background: "#0d1117",
                      color: canBan ? "#e6edf3" : "#484f58", cursor: canBan ? "pointer" : "not-allowed",
                    }}
                  >
                    Ban
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Coverage strip — always visible */}
      <div style={{ marginTop: 10, borderTop: "1px solid #21262d", paddingTop: 8 }}>
        <YouLack coverage={coverage} ally={ally} />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {coverage.map((c: any) => (
            <span key={c.tag} style={{
              padding: "1px 7px", border: "1px solid #30363d", borderRadius: 999, fontSize: 10,
              background: c.ok ? "#12361f" : "#361212", color: c.ok ? "#3fb950" : "#f85149",
            }}>
              {c.tag} {c.ok ? "✓" : "✗"}
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