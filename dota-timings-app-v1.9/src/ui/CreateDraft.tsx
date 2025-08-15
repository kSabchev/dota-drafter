import React from "react";
import { useStore } from "@/store";
import HeroGrid from "@/ui/parts/HeroGrid";
import TeamPanel from "@/ui/parts/TeamPanel";
import DraftAdvisor from "@/ui/parts/DraftAdvisor";
import StoryView from "@/ui/parts/StoryView";

export default function CreateDraft() {
  // Access store fields defensively to avoid TS interface errors
  const activeTeam = useStore((s: any) => s.activeTeam ?? null); // 'team1' | 'team2' | null
  const resetDraft = useStore((s: any) => s.resetDraft ?? (() => {}));
  const undo = useStore((s: any) => s.undo ?? (() => {}));
  const draftMode = useStore((s: any) => s.draftMode ?? "manual"); // <-- get mode

  return (
    <main style={styles.page}>
      {/* LEFT column: find heroes + coverage */}
      <aside style={{ ...styles.col, ...styles.stick }}>
        <section style={styles.card}>
          <h3 style={styles.h3}>Find Heroes</h3>
          {/* If your HeroGrid supports a 'compact' prop, great; otherwise it’s ignored */}
          <HeroGrid mode={draftMode as any} />
        </section>

        <section style={styles.card}>
          <h4 style={styles.h4}>Team Coverage</h4>
          <CoveragePanel />
        </section>
      </aside>

      {/* CENTER column: main stage (scrolls) */}
      <section style={{ ...styles.col, ...styles.center }}>
        <div style={styles.rowbar}>
          <div
            style={{
              ...styles.turn,
              ...(activeTeam === "team1" ? styles.turnOn : null),
            }}
          >
            Team 1 Turn
          </div>
          <div
            style={{
              ...styles.turn,
              ...(activeTeam === "team2" ? styles.turnOn : null),
            }}
          >
            Team 2 Turn
          </div>
          <div style={{ flex: 1 }} />
          <div>
            <button style={styles.btnGhost} onClick={undo}>
              Undo
            </button>
            <button style={styles.btnDanger} onClick={resetDraft}>
              Clear Board
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <TeamPanel />
        </div>

        {/* Keep Story visible inline so it’s not hidden below the fold */}
        <div style={styles.card}>
          <h3 style={styles.h3}>Story Snapshot</h3>
          {/* If your StoryView supports 'compact', it’s used; else ignored */}
          <StoryView />
        </div>
      </section>

      {/* RIGHT column: advisor (sticky) */}
      <aside style={{ ...styles.col, ...styles.stick }}>
        <div style={styles.card}>
          <DraftAdvisor />
        </div>
      </aside>
    </main>
  );
}

/** Small inline coverage panel; reads whatever the Advisor last produced (if available). */
function CoveragePanel() {
  const coverage = useStore((s: any) => s.lastCoverage ?? s.coverage ?? []);
  // expect shape: [{ tag: string, ok: boolean }, ...]
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
              <span key={t} style={styles.lackPill}>
                {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: colors.muted }}>
          Coverage looks good.
        </div>
      )}

      {/* Optional: a very light bar meter using coverage length */}
      <div style={{ marginTop: 10 }}>
        <div style={styles.meterOuter}>
          <div
            style={{
              ...styles.meterInner,
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

/* ───────────────── styles ───────────────── */

const colors = {
  bg: "#0d1117",
  card: "#0f141a",
  border: "#2b2f36",
  text: "#e6edf3",
  muted: "#9aa4b2",
  accent: "#2ea043",
  danger: "#f85149",
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gridTemplateColumns: "320px minmax(680px, 1fr) 360px",
    gap: 12,
    padding: 12,
    background: colors.bg,
    color: colors.text,
    minHeight: "100vh",
    boxSizing: "border-box",
  },
  col: { minHeight: 0 },
  center: { minHeight: "100vh", overflow: "auto" },
  stick: {
    position: "sticky",
    top: 12,
    alignSelf: "start",
    height: "calc(100vh - 24px)",
    overflow: "auto",
  },
  card: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  rowbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  turn: {
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    color: colors.muted,
  },
  turnOn: {
    background:
      "linear-gradient(180deg, rgba(46,160,67,.14), rgba(46,160,67,.06))",
    color: colors.text,
    borderColor: "#2ea04366",
    boxShadow: "0 0 0 1px #2ea04322 inset",
  },
  btnGhost: {
    background: "transparent",
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    marginRight: 8,
  },
  btnDanger: {
    background: "transparent",
    color: colors.danger,
    border: `1px solid ${colors.danger}`,
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
  },
  h3: { margin: "0 0 10px 0", fontSize: 16 },
  h4: { margin: "0 0 8px 0", fontSize: 14, color: colors.muted },
  lackPill: {
    fontSize: 12,
    padding: "2px 8px",
    border: `1px dashed #d29922`,
    color: "#d29922",
    borderRadius: 999,
  },
  meterOuter: {
    height: 8,
    background: "#121821",
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    overflow: "hidden",
  },
  meterInner: {
    height: "100%",
    background: "#2ea043",
    transition: "width .25s ease",
  },
};

// import { useState } from "react";
// import { useStore } from "@/store";
// import DraftAdvisor from "./parts/DraftAdvisor";
// import TeamPanel from "./parts/TeamPanel";
// import HeroGrid from "./parts/HeroGrid";
// import Timeline from "./parts/Timeline";
// import StoryView from "./parts/StoryView";
// import MatrixTab from "./parts/MatrixTab";

// export default function CreateDraft() {
//   // store state/actions that actually exist now
//   const team1 = useStore((s) => s.team1);
//   const team2 = useStore((s) => s.team2);
//   const clearBoard = useStore((s) => s.clearBoard);
//   const buildStory = useStore((s) => s.buildStory);

//   // local UI state
//   const [subtab, setSubtab] = useState<"draft" | "story" | "matrix">("draft");
//   const [mode, setMode] = useState<"manual" | "captains">("manual");

//   const draftDone = team1.length === 5 && team2.length === 5;

//   return (
//     <div style={{ display: "grid", gap: 12 }}>
//       {/* Page subtabs */}
//       <div style={{ display: "flex", gap: 8 }}>
//         <button
//           onClick={() => setSubtab("draft")}
//           style={{
//             padding: "6px 10px",
//             borderRadius: 8,
//             border: "1px solid #30363d",
//             background: subtab === "draft" ? "#161b22" : "#0d1117",
//             color: "#e6edf3",
//           }}
//         >
//           Draft
//         </button>
//         <button
//           onClick={() => setSubtab("story")}
//           style={{
//             padding: "6px 10px",
//             borderRadius: 8,
//             border: "1px solid #30363d",
//             background: subtab === "story" ? "#161b22" : "#0d1117",
//             color: "#e6edf3",
//           }}
//         >
//           Story
//         </button>
//         <button
//           onClick={() => setSubtab("matrix")}
//           style={{
//             padding: "6px 10px",
//             borderRadius: 8,
//             border: "1px solid #30363d",
//             background: subtab === "story" ? "#161b22" : "#0d1117",
//             color: "#e6edf3",
//           }}
//         >
//           Matrix
//         </button>
//       </div>

//       {subtab === "draft" && (
//         <div style={{ display: "grid", gap: 12 }}>
//           {/* Mode tabs */}
//           <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
//             <button
//               onClick={() => setMode("manual")}
//               style={{
//                 padding: "6px 10px",
//                 borderRadius: 8,
//                 border: "1px solid #30363d",
//                 background: mode === "manual" ? "#161b22" : "#0d1117",
//                 color: "#e6edf3",
//               }}
//             >
//               Manual
//             </button>
//             <button
//               onClick={() => setMode("captains")}
//               style={{
//                 padding: "6px 10px",
//                 borderRadius: 8,
//                 border: "1px solid #30363d",
//                 background: mode === "captains" ? "#161b22" : "#0d1117",
//                 color: "#e6edf3",
//               }}
//             >
//               Captains
//             </button>

//             {/* Manual controls */}
//             {mode === "manual" && (
//               <button
//                 onClick={clearBoard}
//                 style={{
//                   marginLeft: "auto",
//                   padding: "6px 10px",
//                   borderRadius: 8,
//                   border: "1px solid #30363d",
//                   background: "#0d1117",
//                   color: "#e6edf3",
//                 }}
//               >
//                 Clear Board
//               </button>
//             )}

//             {/* Captains placeholder notice (no store cm state anymore) */}
//             {mode === "captains" && (
//               <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
//                 CM sequencing disabled for now (using manual pick/ban logic).
//               </span>
//             )}
//           </div>

//           {/* Main layout */}
//           <div
//             style={{
//               display: "grid",
//               gridTemplateColumns: "360px 1fr",
//               gap: 12,
//             }}
//           >
//             <div style={{ display: "grid", gap: 12 }}>
//               {/* HeroGrid gets the selected mode; in captains we still let you click to pick/ban using simple rules */}
//               <HeroGrid mode={mode} />
//             </div>
//             <div style={{ display: "grid", gap: 12 }}>
//               <TeamPanel />
//               {/* DraftAdvisor is draft-only */}
//               {!draftDone && <DraftAdvisor />}
//               <Timeline />
//             </div>
//           </div>

//           {/* Finish → Story */}
//           {draftDone && (
//             <button
//               onClick={() => {
//                 setSubtab("story");
//                 buildStory().catch((e) => alert(e.message));
//               }}
//               style={{
//                 padding: "8px 12px",
//                 border: "1px solid #30363d",
//                 borderRadius: 8,
//                 background: "#0d1117",
//                 color: "#e6edf3",
//               }}
//             >
//               Finish Draft → Story
//             </button>
//           )}
//         </div>
//       )}

//       {subtab === "story" && <StoryView />}

//       {subtab === "matrix" && <MatrixTab />}
//     </div>
//   );
// }
