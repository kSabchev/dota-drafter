import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import LocalHeroImg from "@/ui/components/LocalHeroImg";

export default function DraftAdvisor() {
  const matrix = useStore((s) => s.matrix);
  const loadMatrix = useStore((s) => s.loadMatrix);
  useEffect(() => {
    if (!matrix) loadMatrix().catch(() => {});
  }, [matrix, loadMatrix]);

  const ctxScore = useStore((s) => s.contextScoreFor);
  const ctxContrib = useStore((s) => s.contextContribFor);
  const run = useStore((s) => s.runAdvisor);
  const ally = useStore((s) => s.allySuggestions);
  const deny = useStore((s) => s.banSuggestions);
  const coverage = useStore((s) => s.coverage);
  const explainRows = useStore((s) => s.explainRows);
  const explain = useStore((s) => s.explain);
  const heroes = useStore((s) => s.heroes);
  const pickHero = useStore((s) => s.pickHero);
  const banHero = useStore((s) => s.banHero);
  const minute = useStore((s) => s.minute);
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const nameById = (id: number) =>
    heroes.find((h) => h.id === id)?.localized_name || "#" + id;
  const enemyGain = useStore((s) => s.enemyGainIfTheyPick);

  useEffect(() => {
    // debounce: run 200ms after changes
    const t = setTimeout(() => {
      run().catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [minute, team1.length, team2.length]);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<string>("Why?");
  const [activeReasons, setActiveReasons] = useState<string[] | undefined>(
    undefined
  );
  const [activeItems, setActiveItems] = useState<any[] | undefined>(undefined);

  const heroById = (id: number) => heroes.find((h) => h.id === id);

  function DenyBanCard({ s }: { s: any }) {
    const heroes = useStore((st) => st.heroes);
    const banHero = useStore((st) => st.banHero);
    const h = heroes.find((h) => h.id === s.hero_id);

    return (
      <div
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
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <SmallBadges reasons={s.reasons} />
            </div>

            {/* deltas + sparkline */}
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
                Enemy Ctx{" "}
                {(() => {
                  const v = enemyGain(s.hero_id);
                  return (v > 0 ? "+" : "") + v;
                })()}
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
  }

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
          style={{
            padding: "6px 10px",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "#0d1117",
            color: "#e6edf3",
          }}
        >
          Run
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Ally picks */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Ally Suggestions
          </div>
          {ally.map((s) => {
            const h = heroById(s.hero_id);
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
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  Ctx{" "}
                  {(() => {
                    const v = ctxScore(s.hero_id);
                    return (v > 0 ? "+" : "") + v;
                  })()}
                </div>

                {(() => {
                  const c = ctxContrib(s.hero_id, 3);
                  if (!c.allies.length && !c.enemies.length) return null;
                  return (
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      <span style={{ marginRight: 6 }}>From:</span>
                      {c.allies.map((x) => (
                        <span key={"a" + x.id} style={{ marginRight: 6 }}>
                          +{x.score} {nameById(x.id)}
                        </span>
                      ))}
                      {c.enemies.map((x) => (
                        <span key={"e" + x.id} style={{ marginRight: 6 }}>
                          -{x.score} vs {nameById(x.id)}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {/* TODO: Check */}
                {/* <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {h && (
                    <LocalHeroImg
                      hero={h}
                      kind="icon"
                      style={{ width: 24, height: 24, borderRadius: 4 }}
                    />
                  )}
                  <div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <div>{s.name}</div>
                      <SmallBadges reasons={s.reasons} />
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      ΔFight {fmt(s.deltas?.fight)} • ΔPush{" "}
                      {fmt(s.deltas?.push)} • ΔPick {fmt(s.deltas?.pickoff)}
                    </div>
                  </div>
                </div> */}

                {Array.isArray(s.itemsLikely) && s.itemsLikely.length > 0 && (
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                    Likely:{" "}
                    {s.itemsLikely
                      .filter(
                        (it) => it.minute >= (useStore.getState().minute || 15)
                      )
                      .sort((a, b) => a.minute - b.minute)
                      .slice(0, 2)
                      .map((it) => `${it.label} @${it.minute}`)
                      .join(", ")}
                  </div>
                )}
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
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
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
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
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

                  <button
                    onClick={async () => {
                      setTitle(`Why ${s.name}?`);
                      await explain(s.hero_id);
                      setActiveReasons(s.reasons);
                      setOpen(true);
                      setActiveItems(s.itemsLikely);
                    }}
                  >
                    Why?
                  </button>

                  {open && (
                    <WhyModal
                      title={title}
                      rows={explainRows || []}
                      reasons={activeReasons}
                      items={activeItems}
                      onClose={() => setOpen(false)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Deny bans */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Deny Bans</div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Deny Bans</div>
            {deny.map((s) => (
              <DenyBanCard key={s.hero_id} s={s} />
            ))}
          </div>
        </div>
      </div>

      {/* Coverage row */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Coverage</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {coverage.map((c) => (
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

      <div style={{ marginTop: 8 }}>
        {/* NEW: You lack */}
        <YouLack />

        <div style={{ fontWeight: 600, marginBottom: 4 }}>Coverage</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {coverage.map((c) => (
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

function WhyModal({
  title,
  rows,
  reasons,
  items,
  onClose,
}: {
  title: string;
  rows: any[];
  reasons?: string[];
  items?: any[];
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,.5)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0d1117",
          border: "1px solid #30363d",
          borderRadius: 12,
          padding: 12,
          width: 560,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <strong>{title}</strong>
          {items && items.length > 0 && (
            <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.9 }}>
              Items:{" "}
              {items
                .slice(0, 3)
                .map((it) => `${it.label} @${it.minute}`)
                .join(", ")}
            </div>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "4px 8px",
              border: "1px solid #30363d",
              borderRadius: 6,
              background: "#0d1117",
              color: "#e6edf3",
            }}
          >
            Close
          </button>
        </div>

        {/* Reasons first */}
        {reasons && reasons.length > 0 && (
          <div
            style={{
              marginBottom: 8,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {reasons.map((r) => (
              <span
                key={r}
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  border: "1px solid #30363d",
                  borderRadius: 999,
                }}
              >
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Minute table */}
        {rows?.length ? (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>
                  Minute
                </th>
                <th style={{ textAlign: "center" }}>Fight</th>
                <th style={{ textAlign: "center" }}>Pick</th>
                <th style={{ textAlign: "center" }}>Push</th>
                <th style={{ textAlign: "center" }}>Rosh</th>
                <th style={{ textAlign: "center" }}>Scale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: "4px 6px", opacity: 0.9 }}>
                    {r.minute}
                  </td>
                  {["fight", "pickoff", "push", "rosh", "scale"].map((k) => (
                    <td key={k} style={{ textAlign: "center" }}>
                      {Math.round(r[k] || 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ opacity: 0.7 }}>No details.</div>
        )}
      </div>
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

function YouLack() {
  const coverage = useStore((s) => s.coverage);
  const ally = useStore((s) => s.allySuggestions);
  const missing = coverage.filter((c) => !c.ok).map((c) => c.tag);
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
    // suggestions from current ally list that include the tag
    const fromSuggestions = ally
      .filter((a) => (a.profile?.tags || []).includes(tag))
      .slice(0, 3)
      .map((a) => a.name);
    // fallback generic hints
    const generic = HINTS[tag] || [];
    fixesMap[tag] = fromSuggestions.length ? fromSuggestions : generic;
  }

  return (
    <div style={{ marginBottom: 6, fontSize: 13 }}>
      <span style={{ opacity: 0.9, marginRight: 6 }}>You lack:</span>
      {top.map((t) => (
        <Tooltip
          key={t}
          content={
            fixesMap[t]?.length
              ? `Try: ${fixesMap[t].join(", ")}`
              : "Pick profiles with this tag"
          }
        >
          <span
            style={{
              marginRight: 6,
              padding: "2px 8px",
              border: "1px solid #803",
              color: "#f88",
              borderRadius: 999,
              cursor: "help",
            }}
          >
            {t}
          </span>
        </Tooltip>
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

// super lightweight tooltip
function Tooltip({
  content,
  children,
}: {
  content: string;
  children: React.ReactNode;
}) {
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      <span
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "125%",
          whiteSpace: "nowrap",
          background: "#161b22",
          border: "1px solid #30363d",
          color: "#e6edf3",
          padding: "4px 8px",
          borderRadius: 6,
          fontSize: 12,
          opacity: 0,
          pointerEvents: "none",
        }}
        className="tt"
      >
        {content}
      </span>
      <style>
        {`
        span:hover > .tt { opacity: 1; }
        `}
      </style>
    </span>
  );
}

function getAxisAtMinute(
  s: { deltasByMinute?: Record<string | number, any> },
  minute: number,
  axis: "fight" | "pickoff" | "push" | "rosh" | "scale"
): number {
  const d = s?.deltasByMinute?.[minute];
  if (d == null) return 0;
  // handle both shapes:
  if (typeof d === "number") return d; // legacy: direct number
  const v = d?.[axis];
  return typeof v === "number" ? v : 0;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        margin: "6px 0 8px 0",
      }}
    >
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>Top 6</div>
    </div>
  );
}
