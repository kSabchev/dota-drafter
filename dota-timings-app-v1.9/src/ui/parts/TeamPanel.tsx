import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store";
import type { PosEntry } from "@/store";
import LocalHeroImg from "../components/LocalHeroImg";

const POS_LABEL: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Off", 4: "Soft", 5: "Hard" };

// ─── Tag display ──────────────────────────────────────────────────────────────
const TAG_META: Record<string, { label: string; color: string }> = {
  global:       { label: "Global",      color: "#8b5cf6" },
  blink_init:   { label: "Blink Init",  color: "#3b82f6" },
  split_pusher: { label: "Split Push",  color: "#22c55e" },
  flash_farmer: { label: "Flash Farm",  color: "#f59e0b" },
  radiance:     { label: "Radiance",    color: "#ef4444" },
  refresher:    { label: "Refresher",   color: "#ec4899" },
  physical:     { label: "Phys",        color: "#94a3b8" },
  magical:      { label: "Magical",     color: "#6366f1" },
};
// Tags where >max on the same team is a composition problem
const TAG_CONFLICT_MAX: Record<string, number> = {
  radiance: 1, global: 2, flash_farmer: 2, refresher: 1,
};

function TeamTagBar({ team }: { team: 1 | 2 }) {
  const picks    = useStore((s) => team === 1 ? s.team1 : s.team2);
  const heroTags = useStore((s: any) => s.heroTags ?? {}) as Record<number, string[]>;

  if (!picks.length) return null;

  const counts: Record<string, number> = {};
  for (const pick of picks) {
    for (const tag of heroTags[pick.hero_id] ?? []) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }

  const entries = Object.entries(counts)
    .filter(([tag]) => TAG_META[tag])
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 2px 2px" }}>
      {entries.map(([tag, count]) => {
        const meta     = TAG_META[tag];
        const limit    = TAG_CONFLICT_MAX[tag];
        const conflict = limit != null && count > limit;
        const color    = conflict ? "#ef4444" : meta.color;
        return (
          <span
            key={tag}
            title={
              conflict
                ? `⚠ ${count}× ${meta.label} — team usually wants at most ${limit}`
                : `${count > 1 ? count + "× " : ""}${meta.label}`
            }
            style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "1px 7px", borderRadius: 999,
              fontSize: 10, fontWeight: 600,
              background: `${color}18`,
              border: `1px solid ${color}55`,
              color,
            }}
          >
            {count > 1 && <span style={{ opacity: 0.65, fontSize: 9 }}>{count}×</span>}
            {meta.label}
            {conflict && <span style={{ fontSize: 9 }}>⚠</span>}
          </span>
        );
      })}
    </div>
  );
}
const POS_COLOR: Record<number, string> = {
  1: "#f85149", 2: "#58a6ff", 3: "#d29922", 4: "#3fb950", 5: "#a371f7",
};
const TIER_SYMBOL: Record<number, string> = { 0: "★", 1: "○", 2: "△", 3: "✕" };

function PositionBadge({
  role, roleManual, heroId, team, idx,
}: {
  role: number | null | undefined;
  roleManual?: boolean;
  heroId: number;
  team: 1 | 2;
  idx: number;
}) {
  const setRole     = useStore((s) => s.setRoleForPick);
  const heroPositions = useStore((s: any) => s.heroPositions ?? {}) as Record<number, PosEntry[]>;
  const picks       = useStore((s) => team === 1 ? s.team1 : s.team2);
  const heroes      = useStore((s) => s.heroes);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  // Close on any scroll so the fixed-position menu doesn't go stale
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const positions = heroPositions[heroId] ?? [];
  const isAuto = role != null && !roleManual;

  // Map position → name of the hero that currently holds it (excluding self)
  const takenBy: Record<number, string> = {};
  picks.forEach((p, i) => {
    if (i !== idx && p.role != null) {
      const h = heroes.find((hh) => hh.id === p.hero_id);
      takenBy[p.role as number] = h?.localized_name ?? `Pick ${i + 1}`;
    }
  });

  const color = role ? POS_COLOR[role] : "#555";
  const label = role ? POS_LABEL[role] : "—";

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.left + r.width / 2 });
    }
    setOpen((o) => !o);
  };

  const pick = (pos: number) => { setRole(team, idx, pos); setOpen(false); };
  const clear = () => { setRole(team, idx, 0); setOpen(false); };

  return (
    <div>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title={
          role
            ? `Pos ${role} · ${label}${isAuto ? " (auto)" : " (manual)"} — click to change`
            : "Click to assign a role"
        }
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 7px",
          border: `1px ${isAuto ? "dashed" : "solid"} ${open ? color : color + "88"}`,
          borderRadius: 999,
          background: role ? `${color}15` : "transparent",
          color, fontSize: 11, fontWeight: 600, cursor: "pointer",
        }}
      >
        {role ? `${role} · ${label}` : "? · —"}
        <span style={{ fontSize: 8, opacity: 0.4 }}>▾</span>
      </button>

      {open && (
        <>
          {/* Full-screen backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />

          {/* Menu — fixed so it escapes any overflow:hidden ancestor */}
          <div style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            transform: "translateX(-50%)",
            zIndex: 200,
            background: "#161b22", border: "1px solid #30363d", borderRadius: 8,
            padding: 4, minWidth: 160,
            boxShadow: "0 4px 20px #000a",
          }}>
            {[1, 2, 3, 4, 5].map((pos) => {
              const isCurrent = pos === role;
              const takenName = takenBy[pos];
              const isTaken   = takenName !== undefined;
              const dbEntry   = positions.find((e) => e.position === pos);
              const posColor  = POS_COLOR[pos];
              return (
                <button
                  key={pos}
                  onClick={() => isCurrent ? clear() : pick(pos)}
                  title={isTaken && !isCurrent ? `Swap with ${takenName}` : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "5px 8px", borderRadius: 5, border: "none",
                    background: isCurrent ? `${posColor}22` : "transparent",
                    color: isCurrent ? posColor : "#c9d1d9",
                    cursor: "pointer", fontSize: 12, textAlign: "left",
                  }}
                >
                  <span style={{ width: 14, fontWeight: 700, color: posColor, flexShrink: 0 }}>{pos}</span>
                  <span style={{ flex: 1 }}>{POS_LABEL[pos]}</span>
                  {dbEntry && !isCurrent && (
                    <span style={{ fontSize: 10, opacity: 0.45 }}>{TIER_SYMBOL[dbEntry.tier]}</span>
                  )}
                  {isCurrent && <span style={{ fontSize: 10, color: posColor, opacity: 0.8 }}>✓</span>}
                  {isTaken && !isCurrent && (
                    <span style={{ fontSize: 9, color: "#58a6ff44" }}>↔</span>
                  )}
                </button>
              );
            })}
            {role && (
              <>
                <div style={{ height: 1, background: "#21262d", margin: "2px 4px" }} />
                <button
                  onClick={clear}
                  style={{
                    display: "block", width: "100%", padding: "4px 8px", borderRadius: 5,
                    border: "none", background: "transparent", color: "#555",
                    cursor: "pointer", fontSize: 11, textAlign: "left",
                  }}
                >
                  Auto-assign
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TeamCol({ team }: { team: 1 | 2 }) {
  const heroes = useStore((s) => s.heroes);
  const picks = useStore((s) => (team === 1 ? s.team1 : s.team2));
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
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Team {team}</strong>
        <span style={{ opacity: 0.5, fontSize: 12 }}>{picks.length}/5</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 6 }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const p = picks[i];
          const over = dragOverIdx === i;

          if (!p) return (
            <div
              key={i}
              onDragOver={(e) => onDragOver(e, i)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, i, false)}
              style={{
                border: `1px dashed ${over ? "#58a6ff" : "#30363d"}`,
                borderRadius: 8, height: 108,
                display: "grid", placeItems: "center",
                fontSize: 11, opacity: over ? 1 : 0.4,
                background: over ? "#1f6feb14" : "transparent",
                color: over ? "#58a6ff" : undefined,
                transition: "background .1s, border-color .1s",
              }}
            >
              {over ? "Drop" : "Empty"}
            </div>
          );

          const hero = getHero(p.hero_id);
          if (!hero) return (
            <div key={i} style={{ border: "1px solid #30363d", borderRadius: 8, height: 108, display: "grid", placeItems: "center", fontSize: 11, opacity: 0.4 }}>
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
                // no overflow:hidden here — that would clip the role dropdown
                background: over ? "#1f6feb14" : "transparent",
                outline: over ? "2px dashed #58a6ff" : undefined,
                transition: "background .1s, border-color .1s",
              }}
            >
              {/* Image gets its own overflow:hidden wrapper so it clips to rounded corners */}
              <div style={{ borderRadius: "7px 7px 0 0", overflow: "hidden" }}>
                <LocalHeroImg
                  hero={hero}
                  kind="portrait"
                  style={{ width: "100%", display: "block", height: 72, objectFit: "cover" }}
                />
              </div>
              <div style={{ padding: "3px 4px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: "center", opacity: 0.85, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {hero.localized_name}
                </span>
                <PositionBadge role={p.role} roleManual={p.roleManual} heroId={p.hero_id} team={team} idx={i} />
              </div>
              {over && (
                <div style={{ fontSize: 10, color: "#58a6ff", textAlign: "center", paddingBottom: 3 }}>
                  Replace
                </div>
              )}
            </div>
          );
        })}
      </div>
      <TeamTagBar team={team} />
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
