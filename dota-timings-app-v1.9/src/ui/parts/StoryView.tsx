// src/ui/parts/StoryView.tsx
import { useEffect, useMemo } from "react";
import { useStore } from "@/store";
import { CompositionBars, TimingChart } from "./Charts";
import ApplyPositionsButton from "../components/ApplyPositionsButton";
import { exportDraftReportPDF } from "../reports/exportDraftReport";
import { useMatrixTopK } from "@/lib/api-hooks";

export default function StoryView() {
  // Hooks (always called, in the same order)
  const buildStory = useStore((s) => s.buildStory);
  const story = useStore((s) => s.story);
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);

  const { data: matrix, isLoading, error, refetch } = useMatrixTopK(50);

  // Build server story once both teams are complete
  useEffect(() => {
    if (team1.length === 5 && team2.length === 5) {
      // don't await; we keep UI responsive
      buildStory().catch(() => {});
    }
  }, [team1.length, team2.length, buildStory]);

  // Safe accessors so we don't conditionally call hooks later
  // doublecheck
  // const error = (story as any)?.error ?? null;
  const composition = (story as any)?.composition ?? { team1: {}, team2: {} };
  const lanes = (story as any)?.lanes ?? [];
  const windows = (story as any)?.windows ?? [];
  const spikes = (story as any)?.spikes ?? [];

  // Derived rows (always memoized, even if empty)
  const compRows = useMemo(() => {
    const axes = [
      "fight",
      "pickoff",
      "push",
      "rosh",
      "sustain",
      "defense",
      "scale",
    ];
    return axes.map((axis) => ({
      axis,
      t1: Math.round((composition.team1 as any)[axis] || 0),
      t2: Math.round((composition.team2 as any)[axis] || 0),
    }));
  }, [composition]);

  // Timing graph points (always memoized)
  const timingPoints = useMemo(() => {
    const series = (story as any)?.__series || {};
    const t1 = series.team1?.push || {};
    const t2 = series.team2?.push || {};
    const rows: { minute: number; t1: number; t2: number }[] = [];
    for (let m = 5; m <= 35; m += 5) {
      rows.push({
        minute: m,
        t1: Number(t1[m] ?? composition.team1.push ?? 0),
        t2: Number(t2[m] ?? composition.team2.push ?? 0),
      });
    }
    return rows;
  }, [story, composition]);

  // Render
  const draftComplete = team1.length === 5 && team2.length === 5;

  if (error) {
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: "#f85149", marginBottom: 6 }}>
          Matrix unavailable. Have you run the OpenDota sync?
        </div>
        <button
          onClick={() => refetch()}
          style={{
            padding: "6px 10px",
            border: "1px solid #30363d",
            borderRadius: 6,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>loading matrix…</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: "#f85149" }}>
          failed to load matrix
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {!draftComplete && (
          <div style={{ opacity: 0.7 }}>
            Build a complete draft (5 heroes per team) to see the story.
          </div>
        )}

        {error && (
          <div
            style={{
              color: "#f88",
              border: "1px solid #803",
              padding: 8,
              borderRadius: 8,
            }}
          >
            Failed to build story: {String(error)}
          </div>
        )}

        {draftComplete && !error && (
          <>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <ApplyPositionsButton />
              <ExportPDFButton />
            </div>
            {/* Lanes */}
            <div style={{ display: "grid", gap: 8 }}>
              <h3>Lanes</h3>
              {(lanes as any[]).map((l, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #30363d",
                    borderRadius: 8,
                    padding: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>
                    <strong>{l.lane}</strong>
                  </div>
                  <div style={{ opacity: 0.85 }}>{l.label}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(l.reasons || []).map((r: string) => (
                      <span
                        key={r}
                        style={{
                          padding: "2px 8px",
                          border: "1px solid #30363d",
                          borderRadius: 999,
                        }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Composition bars */}
            <div>
              <h3>Composition</h3>
              <CompositionBars data={compRows} />
            </div>

            {/* Timing graph */}
            <div>
              <h3>Objective Windows & Spikes</h3>
              <TimingChart
                points={timingPoints}
                windows={windows}
                spikes={spikes}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ExportPDFButton() {
  const heroes = useStore((s) => s.heroes);
  const team1 = useStore((s) => s.team1);
  const team2 = useStore((s) => s.team2);
  const story = useStore((s) => s.story);
  const minute = useStore((s) => s.minute);

  const onClick = () => {
    try {
      exportDraftReportPDF({
        heroes,
        team1,
        team2,
        story,
        minute,
        matchTitle: "Draft Report",
      });
    } catch (e: any) {
      alert("Failed to export PDF: " + (e?.message || String(e)));
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        border: "1px solid #30363d",
        borderRadius: 8,
        background: "#0d1117",
        color: "#e6edf3",
      }}
    >
      Export Draft Report (PDF)
    </button>
  );
}
