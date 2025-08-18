import React, { useMemo, useState, useEffect } from "react";
import { useStore } from "@/store";
import HeroGrid from "@/ui/parts/HeroGrid";
import TeamPanel from "@/ui/parts/TeamPanel";
import DraftAdvisor from "@/ui/parts/DraftAdvisor";
import StoryView from "@/ui/parts/StoryView";
import { colors, space } from "@/ui/theme";
import { Card, TurnBadge, PillButton } from "@/ui/primitives";

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
            on={activeTeam === "team2"}
            label="Team 2 Turn"
            variant="dire"
          />
          <div style={{ flex: 1 }} />
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
        </div>
        <Card>
          <TeamPanel />
        </Card>

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
