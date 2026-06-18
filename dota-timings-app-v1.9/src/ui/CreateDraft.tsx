import React, { useMemo, useState, useEffect } from "react";
import { useStore } from "@/store";
import HeroGrid from "@/ui/parts/HeroGrid";
import TeamPanel from "@/ui/parts/TeamPanel";
import DraftAdvisor from "@/ui/parts/DraftAdvisor";
import StoryView from "@/ui/parts/StoryView";
import { colors, space } from "@/ui/theme";
import { Card, TurnBadge, PillButton } from "@/ui/primitives";
import LocalHeroImg from "@/ui/components/LocalHeroImg";
import { cmPhaseName } from "@/ui/draftUtils";
import { useUniqueItems, useAllHeroItems, useItemConstants, useAllHeroTimings } from "@/lib/api-hooks";
import { DESIRE_KEYS } from "@/lib/api-hooks";
import type { DesireKey, HeroTimings } from "@/lib/api-hooks";

export default function CreateDraft() {
  // const activeTeam = useStore((s: any) => s.activeTeam ?? null);
  const manualActiveTeam = useStore((s: any) => {
    const picks = (s.team1?.length ?? 0) + (s.team2?.length ?? 0);
    return picks % 2 === 0 ? "team1" : "team2"; // Team1 first, then alternate
  });
  const activeTeam = useStore((s: any) => s.activeTeam ?? manualActiveTeam);
  const resetDraft = useStore((s: any) => {
    for (const k of [
      "resetDraft",
      "clearDraft",
      "cmReset",
      "reset",
      "clearBoard",
    ]) {
      if (typeof s[k] === "function") return s[k];
    }
    return null;
  });
  const undo = useStore((s: any) => {
    for (const k of ["undo", "historyUndo", "cmUndo", "undoLast"]) {
      if (typeof s[k] === "function") return s[k];
    }
    return null;
  });

  // a cheap "can undo" detector that works with common store shapes
  const canUndo = useStore((s: any) => {
    if (typeof s.canUndo === "boolean") return s.canUndo;
    if (typeof s.historyIdx === "number") return s.historyIdx > 0;
    if (Array.isArray(s.history)) return s.history.length > 1;
    // fallback: if any picks exist, allow (store will no-op if not supported)
    const t1 = s.team1?.length ?? 0;
    const t2 = s.team2?.length ?? 0;
    return t1 + t2 > 0;
  });

  const draftMode = useStore((s: any) => s.draftMode ?? "manual");
  const setDraftMode = useStore((s: any) => s.setDraftMode ?? null);
  const minute = useStore((s: any) => s.minute ?? 15);
  const setMinute = useStore((s: any) => s.setMinute ?? null);
  const [cmFirstPick, setCmFirstPick] = useState<"team1" | "team2">("team1");

  // Draft completion: fall back to counts if you don't have a flag
  const t1Len = useStore((s: any) => s.team1?.length ?? 0);
  const t2Len = useStore((s: any) => s.team2?.length ?? 0);
  const isDraftDone = useStore(
    (s: any) => s.isDraftComplete ?? t1Len + t2Len >= 10
  );

  // Story tab UI only
  const [storyTab, setStoryTab] = useState<"composition" | "timings" | "lanes">(
    "composition"
  );

  // Expandable advisor panel (persisted)
  const [advisorExpanded, setAdvisorExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ui.advisorExpanded") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("ui.advisorExpanded", advisorExpanded ? "1" : "0");
    } catch {}
  }, [advisorExpanded]);

  // Auto-collapse on narrow screens
  useEffect(() => {
    const onResize = () => {
      if (innerWidth < 1024 && advisorExpanded) setAdvisorExpanded(false);
    };
    addEventListener("resize", onResize);
    onResize();
    return () => removeEventListener("resize", onResize);
  }, [advisorExpanded]);

  // Grid columns: when draft complete, hide right column
  const gridCols = useMemo(() => {
    const left = 320;
    if (isDraftDone) return `${left}px 1fr`;
    const right = advisorExpanded ? 720 : 360;
    return `${left}px minmax(640px, 2fr) ${right}px`;
  }, [advisorExpanded, isDraftDone]);

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: space.md,
        padding: space.md,
        background: colors.bg,
        color: colors.text,
        minHeight: "100vh",
        transition: "grid-template-columns .22s ease",
      }}
    >
      {/* LEFT */}
      <aside
        style={{
          position: "sticky",
          top: space.md,
          alignSelf: "start",
          height: "calc(100vh - 24px)",
          overflow: "auto",
        }}
      >
        <Card title="Find Heroes">
          <HeroGrid mode={draftMode as any} />
        </Card>
        <Card title="Team Coverage">
          <CoveragePanel />
        </Card>
      </aside>

      {/* CENTER */}
      <section style={{ minHeight: "100vh", overflow: "auto" }}>
        {/* ACTION ROW: always visible */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <TurnBadge
            on={activeTeam === "team1" && !isDraftDone}
            label="Team 1 Turn"
            variant="radiant"
          />
          <TurnBadge
            on={activeTeam === "team2" && !isDraftDone}
            label="Team 2 Turn"
            variant="dire"
          />
          <div style={{ flex: 1 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.75 }}>
            <span>Min</span>
            <input
              type="range"
              min={5}
              max={40}
              step={5}
              value={minute}
              onChange={(e) => setMinute?.(Number(e.target.value))}
              style={{ width: 70 }}
            />
            <span style={{ minWidth: 18 }}>{minute}</span>
          </label>
          <PillButton
            type="button"
            onClick={() => undo?.()}
            disabled={!undo || !canUndo}
            title={
              !undo
                ? "Undo not available in store"
                : !canUndo
                ? "Nothing to undo"
                : "Undo last action"
            }
          >
            Undo
          </PillButton>
          <PillButton
            type="button"
            onClick={() => resetDraft?.()}
            disabled={!resetDraft}
            style={{ borderColor: "#f85149", color: "#f85149" }}
            title={
              !resetDraft
                ? "Reset action not available in store"
                : "Clear all picks/bans"
            }
          >
            Clear Board
          </PillButton>
          {setDraftMode && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, opacity: 0.5 }}>1st:</span>
              {(["team1", "team2"] as const).map((t) => (
                <PillButton
                  key={t}
                  type="button"
                  onClick={() => {
                    setCmFirstPick(t);
                    if (draftMode === "cm") setDraftMode("cm", t);
                  }}
                  style={{
                    padding: "2px 7px",
                    fontSize: 11,
                    borderColor:
                      cmFirstPick === t
                        ? t === "team1" ? "#3fb950" : "#f85149"
                        : "#30363d",
                    color:
                      cmFirstPick === t
                        ? t === "team1" ? "#3fb950" : "#f85149"
                        : "#8b949e",
                  }}
                >
                  {t === "team1" ? "T1" : "T2"}
                </PillButton>
              ))}
              <PillButton
                type="button"
                onClick={() =>
                  setDraftMode(draftMode === "cm" ? "manual" : "cm", cmFirstPick)
                }
                style={{
                  borderColor: draftMode === "cm" ? "#58a6ff" : "#30363d",
                  color: draftMode === "cm" ? "#58a6ff" : "#e6edf3",
                }}
                title={
                  draftMode === "cm"
                    ? "Switch to manual draft mode"
                    : `Activate Captain's Mode (${cmFirstPick === "team1" ? "Team 1" : "Team 2"} picks first)`
                }
              >
                {draftMode === "cm" ? "CM Mode" : "Manual"}
              </PillButton>
            </div>
          )}
        </div>
        <BanStrip />
        <Card>
          <TeamPanel />
        </Card>

        <DraftStateBanner />
        <LaneMatchupPanel />
        <UniqueItemsTracker />
        <TeamTimingPanel />

        <Card>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            {(["composition", "timings", "lanes"] as const).map((k) => (
              <PillButton
                key={k}
                onClick={() => setStoryTab(k)}
                style={{
                  background: storyTab === k ? "#161b22" : "transparent",
                  borderColor: storyTab === k ? "#30363d" : undefined,
                }}
              >
                {k === "composition"
                  ? "Composition"
                  : k === "timings"
                  ? "Timings"
                  : "Lanes"}
              </PillButton>
            ))}
          </div>
          <StoryView />
        </Card>
      </section>

      {/* RIGHT: Advisor (hidden after draft complete) */}
      {!isDraftDone && (
        <aside
          style={{
            position: "sticky",
            top: space.md,
            alignSelf: "start",
            height: "calc(100vh - 24px)",
            overflow: "auto",
            transition: "width .22s ease",
          }}
        >
          <Card
            title={`Draft Advisor${advisorExpanded ? " (expanded)" : ""}`}
            right={
              <PillButton
                aria-label={
                  advisorExpanded
                    ? "Collapse advisor panel"
                    : "Expand advisor panel"
                }
                onClick={() => setAdvisorExpanded((v) => !v)}
                style={{ padding: "4px 10px" }}
              >
                <span
                  style={{
                    display: "inline-block",
                    transform: advisorExpanded ? "rotate(180deg)" : "none",
                    transition: "transform .15s ease",
                  }}
                >
                  ⟩
                </span>
              </PillButton>
            }
          >
            <DraftAdvisor />
          </Card>
        </aside>
      )}
    </main>
  );
}

function DraftStateBanner() {
  const draftMode = useStore((s: any) => s.draftMode ?? "manual");
  const activeTeam = useStore((s: any) => s.activeTeam ?? "team1");
  const cmSequence = useStore((s: any) => s.cmSequence ?? null);
  const cmStep = useStore((s: any) => s.cmStep ?? 0);
  const t1Len = useStore((s: any) => s.team1?.length ?? 0);
  const t2Len = useStore((s: any) => s.team2?.length ?? 0);
  const bansLen = useStore((s: any) => s.bans?.length ?? 0);
  const skipBan = useStore((s: any) => s.skipBan ?? null);

  const isDone = t1Len === 5 && t2Len === 5;
  if (isDone) {
    return (
      <div style={{
        margin: "8px 0",
        padding: "10px 16px",
        border: "1px solid #30363d",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#161b22",
      }}>
        <span style={{ fontSize: 18 }}>✓</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Draft Complete</span>
        <span style={{ fontSize: 12, opacity: 0.5, marginLeft: 4 }}>
          {bansLen} ban{bansLen !== 1 ? "s" : ""} · 10 picks
        </span>
      </div>
    );
  }

  let actionType: "BAN" | "PICK" = "PICK";
  let phase = "";
  let stepLabel = "";

  if (draftMode === "cm" && cmSequence) {
    const step = cmSequence[cmStep];
    if (step) {
      actionType = step.type === "ban" ? "BAN" : "PICK";
      phase = cmPhaseName(cmStep);
      stepLabel = `Step ${cmStep + 1} / ${cmSequence.length}`;
    }
  } else {
    actionType = "PICK";
  }

  const isTeam1 = activeTeam === "team1";
  const teamColor = isTeam1 ? "#3fb950" : "#f85149";
  const teamLabel = isTeam1 ? "Team 1" : "Team 2";
  const actionColor = actionType === "BAN" ? "#d29922" : "#58a6ff";

  return (
    <div style={{
      margin: "8px 0",
      padding: "10px 16px",
      borderRadius: 8,
      border: `1px solid ${teamColor}44`,
      borderLeft: `4px solid ${teamColor}`,
      background: `${teamColor}0d`,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      {/* Pulsing dot */}
      <span style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: teamColor,
        flexShrink: 0,
        animation: "pulse 1.6s ease-in-out infinite",
      }} />

      {/* Team */}
      <span style={{ fontWeight: 700, fontSize: 15, color: teamColor }}>
        {teamLabel}
      </span>

      <span style={{ opacity: 0.35, fontSize: 14 }}>·</span>

      {/* Action badge */}
      <span style={{
        fontWeight: 700,
        fontSize: 13,
        color: actionColor,
        padding: "2px 9px",
        border: `1px solid ${actionColor}55`,
        borderRadius: 999,
        background: `${actionColor}11`,
        letterSpacing: "0.06em",
      }}>
        {actionType}
      </span>

      {/* Phase + step (CM only) */}
      {phase && (
        <>
          <span style={{ opacity: 0.35, fontSize: 14 }}>·</span>
          <span style={{ fontSize: 13, opacity: 0.8 }}>{phase}</span>
          <span style={{ fontSize: 12, opacity: 0.4, marginLeft: 2 }}>{stepLabel}</span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Skip ban — only shown in CM mode on a ban step */}
      {actionType === "BAN" && draftMode === "cm" && skipBan && (
        <button
          onClick={() => skipBan()}
          title="Skip this ban — advances the draft without banning a hero"
          style={{
            padding: "3px 10px",
            fontSize: 12,
            border: "1px solid #30363d",
            borderRadius: 999,
            background: "transparent",
            color: "#8b949e",
            cursor: "pointer",
          }}
        >
          Skip Ban
        </button>
      )}

      {/* Pick counts */}
      <span style={{ fontSize: 12, opacity: 0.45 }}>
        {t1Len + t2Len}/10 picks · {bansLen} ban{bansLen !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

// ─── Lane Matchup Panel ──────────────────────────────────────────────────────

const LANE_DEFS = [
  { label: "Safe Lane",  t1Pos: [1, 5], t2Pos: [3, 4] },
  { label: "Mid Lane",   t1Pos: [2],    t2Pos: [2]    },
  { label: "Off Lane",   t1Pos: [3, 4], t2Pos: [1, 5] },
] as const;

const POS_COLORS: Record<number, string> = {
  1: "#f85149", 2: "#58a6ff", 3: "#d29922", 4: "#3fb950", 5: "#a371f7",
};
const POS_LABELS: Record<number, string> = {
  1: "Carry", 2: "Mid", 3: "Off", 4: "Soft", 5: "Hard",
};

function LaneMatchupPanel() {
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const heroes = useStore((s) => s.heroes);

  const byPos = (picks: typeof team1, positions: readonly number[]) =>
    picks.filter((p) => p.role != null && positions.includes(p.role as number));

  const hasAny = team1.some((p) => p.role) || team2.some((p) => p.role);
  if (!hasAny) return null;

  const getHero = (id: number) => heroes.find((h) => h.id === id);

  return (
    <div style={{ margin: "8px 0", border: "1px solid #30363d", borderRadius: 8, overflow: "hidden", background: "#0f141a" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
        {LANE_DEFS.map((lane, li) => {
          const t1 = byPos(team1, lane.t1Pos);
          const t2 = byPos(team2, lane.t2Pos);
          if (t1.length === 0 && t2.length === 0) return null;
          return (
            <div
              key={lane.label}
              style={{
                borderRight: li < 2 ? "1px solid #21262d" : undefined,
                padding: "8px 10px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>
                {lane.label}
              </div>
              <LaneSide picks={t1} side={1} getHero={getHero} />
              <div style={{ borderTop: "1px solid #21262d", margin: "5px 0" }} />
              <LaneSide picks={t2} side={2} getHero={getHero} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaneSide({
  picks, side, getHero,
}: {
  picks: { hero_id: number; role?: number | null }[];
  side: 1 | 2;
  getHero: (id: number) => import("@/store").Hero | undefined;
}) {
  const teamColor = side === 1 ? "#3fb950" : "#f85149";
  if (picks.length === 0) {
    return <div style={{ height: 28, opacity: 0.2, fontSize: 11, display: "flex", alignItems: "center" }}>—</div>;
  }
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
      {picks.map((p) => {
        const hero = getHero(p.hero_id);
        const posColor = p.role ? POS_COLORS[p.role] : teamColor;
        return (
          <div key={p.hero_id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {hero && (
              <LocalHeroImg
                hero={hero}
                kind="icon"
                style={{ width: 24, height: 24, borderRadius: 4, border: `1px solid ${posColor}55`, flexShrink: 0 }}
              />
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, opacity: 0.7, lineHeight: 1 }}>{hero?.localized_name ?? `#${p.hero_id}`}</span>
              {p.role && (
                <span style={{ fontSize: 9, color: posColor, lineHeight: 1.2 }}>{POS_LABELS[p.role]}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Unique Items Tracker ─────────────────────────────────────────────────────

function UniqueItemsTracker() {
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const heroes = useStore((s) => s.heroes);
  const { data: uniqueItems } = useUniqueItems();
  const { data: allBuilds } = useAllHeroItems();
  const { data: itemMap } = useItemConstants();

  if (!uniqueItems?.length) return null;
  if (team1.length + team2.length === 0) return null;

  // For a given pick, which unique items appear in their build (position-specific or generic)
  const pickUniqueItems = (heroId: number, role: number | null | undefined): string[] => {
    const builds = allBuilds?.[String(heroId)];
    if (!builds) return [];
    const pos = role ? String(role) : null;
    const items: string[] = (pos && builds[pos]) ? builds[pos] : (builds["generic"] ?? []);
    return items.filter((item) => uniqueItems.includes(item));
  };

  // Count how many heroes on a team claim each unique item → find duplicates
  const teamConflicts = (picks: typeof team1): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const p of picks) {
      for (const item of pickUniqueItems(p.hero_id, p.role)) {
        counts[item] = (counts[item] ?? 0) + 1;
      }
    }
    return counts;
  };

  const t1Conflicts = teamConflicts(team1);
  const t2Conflicts = teamConflicts(team2);

  const anyConflict =
    Object.values(t1Conflicts).some((n) => n > 1) ||
    Object.values(t2Conflicts).some((n) => n > 1);

  const hasData =
    team1.some((p) => pickUniqueItems(p.hero_id, p.role).length > 0) ||
    team2.some((p) => pickUniqueItems(p.hero_id, p.role).length > 0);

  const TeamColumn = ({
    picks,
    conflicts,
    teamColor,
    label,
  }: {
    picks: typeof team1;
    conflicts: Record<string, number>;
    teamColor: string;
    label: string;
  }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: teamColor, marginBottom: 8 }}>{label}</div>
      {picks.length === 0 && (
        <div style={{ fontSize: 11, opacity: 0.25 }}>No picks yet</div>
      )}
      {picks.map((p, i) => {
        const hero = heroes.find((h) => h.id === p.hero_id);
        const items = pickUniqueItems(p.hero_id, p.role);
        return (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 0",
              borderBottom: i < picks.length - 1 ? "1px solid #1c2128" : "none",
              minHeight: 30,
            }}
          >
            {hero ? (
              <LocalHeroImg
                hero={hero}
                kind="icon"
                style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0 }}
              />
            ) : (
              <div style={{ width: 22, height: 22, borderRadius: 4, background: "#21262d", flexShrink: 0 }} />
            )}
            <span style={{
              fontSize: 11, opacity: 0.65, flexShrink: 0,
              width: 82, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {hero?.localized_name ?? `#${p.hero_id}`}
            </span>

            {items.length === 0 ? (
              <span style={{ fontSize: 10, opacity: 0.2 }}>—</span>
            ) : (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {items.map((name) => {
                  const it = itemMap?.[name];
                  const conflict = (conflicts[name] ?? 0) > 1;
                  return (
                    <div
                      key={name}
                      title={`${it?.dname ?? name}${conflict ? " ⚠ duplicate on this team" : ""}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 3,
                        padding: "1px 6px 1px 3px",
                        borderRadius: 4,
                        background: conflict ? "#f8514918" : "#ffffff0a",
                        border: `1px solid ${conflict ? "#f85149" : "#30363d"}`,
                      }}
                    >
                      {it?.img && (
                        <img src={it.img} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 10, color: conflict ? "#f85149" : "#c9d1d9" }}>
                        {it?.dname ?? name}
                      </span>
                      {conflict && <span style={{ fontSize: 9, color: "#f85149" }}>⚠</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ margin: "8px 0", border: "1px solid #30363d", borderRadius: 8, background: "#0f141a", padding: "10px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, letterSpacing: "0.06em", marginBottom: 10, textTransform: "uppercase" }}>
        Unique Items
        {!hasData && (
          <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 11, color: "#484f58", textTransform: "none", letterSpacing: 0 }}>
            — add item builds in admin to enable tracking
          </span>
        )}
      </div>
      {hasData && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <TeamColumn picks={team1} conflicts={t1Conflicts} teamColor="#3fb950" label="Team 1" />
            <TeamColumn picks={team2} conflicts={t2Conflicts} teamColor="#f85149" label="Team 2" />
          </div>
          {anyConflict && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#f85149" }}>
              ⚠ Duplicate unique item on the same team — two heroes building the same singleton.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Team Timing Panel ────────────────────────────────────────────────────────

const TIMING_MINUTES = [10, 15, 20, 25, 30] as const;
const DESIRE_META_DRAFT: Record<DesireKey, { label: string; short: string; color: string }> = {
  teamfight: { label: "Team Fight",  short: "Fight",  color: "#f85149" },
  pickoff:   { label: "Pick Off",    short: "Gank",   color: "#d29922" },
  push:      { label: "Push",        short: "Push",   color: "#3fb950" },
  split:     { label: "Split Push",  short: "Split",  color: "#58a6ff" },
  objective: { label: "Objective",   short: "Obj",    color: "#a371f7" },
  farm:      { label: "Farm",        short: "Farm",   color: "#79c0ff" },
  early_end: { label: "Early End",   short: "Early",  color: "#ffa657" },
  late_scale:{ label: "Late Scale",  short: "Late",   color: "#bc8cff" },
};

function hexRgba2(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function TeamTimingPanel() {
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const { data: allTimings } = useAllHeroTimings();

  const hasPicks = team1.length > 0 || team2.length > 0;
  if (!hasPicks || !allTimings) return null;

  // Check if any picks have timing data
  const allPicks = [...team1, ...team2];
  const anyData = allPicks.some((p) => {
    const t = allTimings[String(p.hero_id)];
    return t && Object.values(t).some((arr) => (arr as number[]).some((v) => v > 0));
  });
  if (!anyData) return null;

  type TeamAggregate = { avg: number; max: number; heroes: number[] };

  // Build aggregate for a team: for each desire × minute → { avg, max, heroes[] }
  const aggregate = (picks: typeof team1): Record<DesireKey, TeamAggregate[]> => {
    const out = {} as Record<DesireKey, TeamAggregate[]>;
    for (const key of DESIRE_KEYS) {
      out[key] = TIMING_MINUTES.map((_, mi) => {
        const contributing: number[] = [];
        let sum = 0;
        let max = 0;
        for (const pick of picks) {
          const t = allTimings?.[String(pick.hero_id)] as HeroTimings | undefined;
          const val = t?.[key]?.[mi] ?? 0;
          if (val > 0) { sum += val; max = Math.max(max, val); contributing.push(pick.hero_id); }
        }
        return { avg: picks.length > 0 ? Math.round(sum / picks.length) : 0, max, heroes: contributing };
      });
    }
    return out;
  };

  const agg1 = aggregate(team1);
  const agg2 = aggregate(team2);

  const TeamGrid = ({ agg, teamLabel, teamColor }: { agg: ReturnType<typeof aggregate>; teamLabel: string; teamColor: string }) => {
    const [hovered, setHovered] = useState<number | null>(null);

    // Find dominant desire per minute
    const dominant = TIMING_MINUTES.map((_, mi) =>
      DESIRE_KEYS.reduce((best, k) => agg[k][mi].avg > agg[best][mi].avg ? k : best, DESIRE_KEYS[0] as DesireKey)
    );

    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: teamColor, marginBottom: 6 }}>{teamLabel}</div>
        <div style={{ border: "1px solid #30363d", borderRadius: 6, overflow: "hidden" }}>
          {/* Time headers */}
          <div style={{ display: "grid", gridTemplateColumns: "70px repeat(5, 1fr)", background: "#0d1117", borderBottom: "1px solid #21262d" }}>
            <div style={{ padding: "4px 6px", fontSize: 10, opacity: 0.4 }} />
            {TIMING_MINUTES.map((m, mi) => (
              <div key={m} style={{
                padding: "4px 0", textAlign: "center",
                background: hovered === mi ? "#161b22" : "transparent",
                borderLeft: "1px solid #21262d", cursor: "default",
              }}
              onMouseEnter={() => setHovered(mi)}
              onMouseLeave={() => setHovered(null)}
              >
                <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{m}m</div>
                <div style={{ fontSize: 9, color: DESIRE_META_DRAFT[dominant[mi]].color, opacity: 0.9 }}>
                  {DESIRE_META_DRAFT[dominant[mi]].short}
                </div>
              </div>
            ))}
          </div>

          {/* Desire rows */}
          {DESIRE_KEYS.map((key) => {
            const d = DESIRE_META_DRAFT[key];
            return (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "70px repeat(5, 1fr)", borderBottom: "1px solid #21262d" }}>
                <div style={{ padding: "0 6px", display: "flex", alignItems: "center", gap: 4, minHeight: 28 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{d.short}</span>
                </div>
                {agg[key].map((cell, mi) => (
                  <div key={mi} style={{
                    borderLeft: "1px solid #21262d", height: 28, position: "relative",
                    background: hovered === mi ? "#161b22" : "transparent",
                    cursor: "default",
                  }}
                  onMouseEnter={() => setHovered(mi)}
                  onMouseLeave={() => setHovered(null)}
                  >
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      height: `${cell.avg}%`,
                      background: hexRgba2(d.color, 0.15 + (cell.avg / 100) * 0.6),
                      transition: "height 0.2s",
                    }} />
                    <div style={{
                      position: "relative", zIndex: 1, height: "100%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 600,
                      color: cell.avg > 50 ? d.color : cell.avg > 20 ? "#8b949e" : "#484f58",
                    }}>
                      {cell.avg > 0 ? cell.avg : ""}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Incoherence signal: at each minute, if >1 hero wants to farm AND >1 hero wants to fight → tension
  const incoherence = TIMING_MINUTES.map((_, mi) => {
    const wantFight = (agg1.teamfight[mi].avg + agg1.pickoff[mi].avg) / 2;
    const wantFarm  = agg1.farm[mi].avg;
    return wantFight > 50 && wantFarm > 50 ? TIMING_MINUTES[mi] : null;
  }).filter(Boolean);

  return (
    <div style={{ margin: "8px 0", border: "1px solid #30363d", borderRadius: 8, background: "#0f141a", padding: "10px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, letterSpacing: "0.06em", marginBottom: 10, textTransform: "uppercase" }}>
        Team Activity Profile
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <TeamGrid agg={agg1} teamLabel="Team 1" teamColor="#3fb950" />
        <TeamGrid agg={agg2} teamLabel="Team 2" teamColor="#f85149" />
      </div>
      {incoherence.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#d29922", opacity: 0.8 }}>
          ⚠ Team 1 has role tension at {incoherence.join(", ")} min — some heroes want to fight while others need farm.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BanStrip() {
  const bans = useStore((s) => s.bans);
  const heroes = useStore((s) => s.heroes);
  if (bans.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "4px 0 8px" }}>
      {bans.map((ban, idx) => {
        const teamColor = ban.team === 1 ? "#3fb950" : "#f85149";
        if (ban.skipped) {
          return (
            <div
              key={`skip-${idx}`}
              title={`Team ${ban.team} skipped ban`}
              style={{
                width: 36,
                height: 36,
                border: `1px solid ${teamColor}55`,
                borderRadius: 6,
                flexShrink: 0,
                background: "#0d0d0d",
                display: "grid",
                placeItems: "center",
                position: "relative",
              }}
            >
              <span style={{ fontSize: 14, opacity: 0.35 }}>—</span>
              <div style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 3,
                background: teamColor,
                opacity: 0.4,
              }} />
            </div>
          );
        }
        const hero = heroes.find((h) => h.id === ban.hero_id);
        if (!hero) return null;
        return (
          <div
            key={ban.hero_id}
            title={`Banned by Team ${ban.team}: ${hero.localized_name}`}
            style={{
              width: 36,
              height: 36,
              border: `1px solid ${teamColor}`,
              borderRadius: 6,
              overflow: "hidden",
              flexShrink: 0,
              position: "relative",
            }}
          >
            <LocalHeroImg
              hero={hero}
              kind="icon"
              style={{ width: "100%", height: "100%", filter: "grayscale(80%) brightness(0.65)" }}
            />
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              background: teamColor,
              opacity: 0.7,
            }} />
          </div>
        );
      })}
    </div>
  );
}

function CoveragePanel() {
  const coverage = useStore((s: any) => s.lastCoverage ?? s.coverage ?? []);
  const lacks: string[] = Array.isArray(coverage)
    ? coverage
        .filter((c: any) => !c?.ok)
        .map((c: any) => String(c.tag))
        .slice(0, 6)
    : [];
  return (
    <div>
      {lacks.length > 0 ? (
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <div style={{ marginBottom: 6 }}>You lack:</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {lacks.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  border: "1px dashed #d29922",
                  color: "#d29922",
                  borderRadius: 999,
                }}
              >
                {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#9aa4b2" }}>
          Coverage looks good.
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            height: 8,
            background: "#121821",
            borderRadius: 6,
            border: "1px solid #2b2f36",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              background: "#2ea043",
              transition: "width .25s ease",
              width: `${Math.max(
                5,
                Math.min(
                  100,
                  100 -
                    (lacks.length / Math.max(1, coverage?.length || 10)) * 100
                )
              )}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
