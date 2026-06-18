// src/ui/parts/StoryView.tsx
import { useEffect, useMemo } from "react";
import { useStore } from "@/store";
import { CompositionBars, TimingChart } from "./Charts";
import ApplyPositionsButton from "../components/ApplyPositionsButton";
import { exportDraftReportPDF } from "../reports/exportDraftReport";
import { useMatrixTopK } from "@/lib/api-hooks";

const T1 = "#58a6ff";
const T2 = "#f0883e";

const LANE_COLORS: Record<string, string> = {
  "T1 favored":     T1,
  "T1 mid":         T1,
  "T1 off threat":  T1,
  "T2 pressure":    T2,
  "T2 mid":         T2,
  "T2 scales free": T2,
  "Even":           "#8b949e",
  "Contested":      "#8b949e",
  "Risk/Reward":    "#d29922",
};

function laneColor(label: string): string {
  return LANE_COLORS[label] ?? "#8b949e";
}

export default function StoryView({ tab = "composition" }: { tab?: "composition" | "timings" | "lanes" }) {
  const buildStory = useStore((s) => s.buildStory);
  const story      = useStore((s) => s.story);
  const team1      = useStore((s) => s.team1);
  const team2      = useStore((s) => s.team2);
  const minute     = useStore((s: any) => s.minute ?? 15);

  const { isLoading, error, refetch } = useMatrixTopK(50);

  // Fire on any pick change or minute slider move (debounced so slider doesn't spam).
  // No minimum team-size gate — partial composition is useful during the draft.
  useEffect(() => {
    if (team1.length === 0 && team2.length === 0) return;
    const t = setTimeout(() => { buildStory().catch(() => {}); }, 350);
    return () => clearTimeout(t);
  }, [team1.length, team2.length, minute, buildStory]);

  const composition = (story as any)?.composition ?? { team1: {}, team2: {} };
  const lanes       = (story as any)?.lanes   ?? [];
  const windows     = (story as any)?.windows ?? [];
  const spikes      = (story as any)?.spikes  ?? [];

  const compRows = useMemo(() => {
    const axes = ["fight", "pickoff", "push", "rosh", "sustain", "defense", "scale"];
    return axes.map((axis) => ({
      axis,
      t1: Math.round((composition.team1 as any)[axis] || 0),
      t2: Math.round((composition.team2 as any)[axis] || 0),
    }));
  }, [composition]);

  const verdict = useMemo(() => {
    const s1 = ((composition.team1 as any).fight || 0) + ((composition.team1 as any).scale || 0);
    const s2 = ((composition.team2 as any).fight || 0) + ((composition.team2 as any).scale || 0);
    const diff = s1 - s2;
    if (Math.abs(diff) < 20) return { label: "Even draft", color: "#8b949e", diff: 0 };
    return diff > 0
      ? { label: "Team 1 stronger overall", color: T1, diff }
      : { label: "Team 2 stronger overall", color: T2, diff };
  }, [composition]);

  const timingPoints = useMemo(() => {
    const s   = (story as any)?.__series || {};
    const f1  = s.team1?.fight   || {};
    const po1 = s.team1?.pickoff || {};
    const pu1 = s.team1?.push    || {};
    const f2  = s.team2?.fight   || {};
    const po2 = s.team2?.pickoff || {};
    const pu2 = s.team2?.push    || {};
    return Array.from({ length: 8 }, (_, i) => {
      const m = (i + 1) * 5;
      return {
        minute:   m,
        t1Combat: Math.round(((f1[m] || 0) + (po1[m] || 0)) / 2),
        t2Combat: Math.round(((f2[m] || 0) + (po2[m] || 0)) / 2),
        t1Push:   Number(pu1[m] ?? 0),
        t2Push:   Number(pu2[m] ?? 0),
      };
    });
  }, [story]);

  const draftComplete = team1.length === 5 && team2.length === 5;
  const hasAnyPicks   = team1.length > 0 || team2.length > 0;
  const hasStoryData  = hasAnyPicks && compRows.some((r) => r.t1 > 0 || r.t2 > 0);

  if (error) {
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: "#f85149", marginBottom: 6 }}>Matrix unavailable. Have you run the OpenDota sync?</div>
        <button onClick={() => refetch()} style={{ padding: "6px 10px", border: "1px solid #30363d", borderRadius: 6 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {isLoading && <div style={{ fontSize: 12, opacity: 0.5 }}>loading matrix…</div>}

      {/* ── Composition tab ── */}
      {tab === "composition" && (
        <>
          {!hasStoryData ? (
            <Placeholder>Pick at least 1 hero to see composition analysis.</Placeholder>
          ) : (
            <>
              {/* Overall verdict */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px",
                background: `${verdict.color}10`,
                border: `1px solid ${verdict.color}44`,
                borderRadius: 10,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: verdict.color }}>{verdict.label}</div>
                  <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>
                    Fight + late-scale combined at {minute}m
                  </div>
                </div>
                {!draftComplete && (
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 999,
                    border: "1px solid #d2992244", background: "#d2992210", color: "#d29922",
                  }}>
                    {team1.length}v{team2.length} — in progress
                  </span>
                )}
              </div>

              {draftComplete && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <ApplyPositionsButton />
                  <ExportPDFButton />
                </div>
              )}

              <CompositionBars data={compRows} />
            </>
          )}
        </>
      )}

      {/* ── Lanes tab ── */}
      {tab === "lanes" && (
        <>
          {/* LaneMatchupPanel is rendered above (hero icons) — this section
              adds the axis-computed verdict cards below it */}
          {hasAnyPicks && lanes.length > 0 && (
            <SectionDivider label="Computed Lane Verdicts" />
          )}
          {!hasAnyPicks ? (
            <Placeholder>Pick at least 1 hero with a role to see lane verdicts.</Placeholder>
          ) : lanes.length === 0 ? (
            <Placeholder>Assign roles to get lane verdicts.</Placeholder>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {(lanes as any[]).map((l, i) => {
                const incomplete = l.incomplete as boolean;
                const col = incomplete ? "#484f58" : laneColor(l.label);
                return (
                  <div key={i} style={{
                    padding: "10px 12px",
                    background: incomplete ? "#ffffff06" : `${col}0c`,
                    border: `1px solid ${incomplete ? "#30363d" : col + "44"}`,
                    borderRadius: 8,
                    opacity: incomplete ? 0.65 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {l.lane}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: col }}>
                        {incomplete ? "TBD" : l.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {(l.reasons || []).map((r: string) => (
                        <span key={r} style={{ fontSize: 10, color: incomplete ? "#484f58" : "#8b949e", lineHeight: 1.4 }}>{r}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Timings tab ── */}
      {tab === "timings" && (
        <>
          {/* TeamTimingPanel (per-hero heatmap) is rendered above — this section
              adds the team-level trajectory line chart below it */}
          {hasStoryData ? (
            <>
              <SectionDivider label="Team Trajectory">
                {!draftComplete && (
                  <span style={{ fontSize: 11, color: "#d29922", opacity: 0.8 }}>
                    {team1.length}v{team2.length} in progress
                  </span>
                )}
              </SectionDivider>
              <TimingChart points={timingPoints} windows={windows} spikes={spikes} />
            </>
          ) : hasAnyPicks ? (
            <div style={{ fontSize: 12, color: "#8b949e", opacity: 0.5, padding: "4px 0" }}>
              Loading trajectory…
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: "#8b949e", opacity: 0.7, padding: "16px 0" }}>{children}</div>
  );
}

function SectionDivider({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      margin: "4px 0 2px",
      borderTop: "1px solid #21262d", paddingTop: 12,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
        color: "#484f58", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "#21262d" }} />
      {children}
    </div>
  );
}

function ExportPDFButton() {
  const heroes = useStore((s) => s.heroes);
  const team1  = useStore((s) => s.team1);
  const team2  = useStore((s) => s.team2);
  const story  = useStore((s) => s.story);
  const minute = useStore((s) => s.minute);

  const onClick = () => {
    try {
      exportDraftReportPDF({ heroes, team1, team2, story, minute, matchTitle: "Draft Report" });
    } catch (e: any) {
      alert("Failed to export PDF: " + (e?.message || String(e)));
      console.error(e); // eslint-disable-line no-console
    }
  };

  return (
    <button
      onClick={onClick}
      style={{ padding: "6px 10px", border: "1px solid #30363d", borderRadius: 8, background: "#0d1117", color: "#e6edf3" }}
    >
      Export PDF
    </button>
  );
}
