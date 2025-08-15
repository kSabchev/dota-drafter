import { useMemo } from "react";
import { useStore } from "@/store";

type Props = { mode: "manual" | "captains" };
export default function TurnBanner({ mode }: Props) {
  const t1 = useStore((s) => s.team1);
  const t2 = useStore((s) => s.team2);
  const bans = useStore((s) => s.bans);

  const state = useMemo(() => {
    const p1 = t1.length,
      p2 = t2.length;
    const full1 = p1 >= 5,
      full2 = p2 >= 5;
    let team: 1 | 2 = 1;
    let action: "PICK" | "BAN" = "PICK";

    // simplified: manual flow always picks; in captains tab we still let the user toggle in grid
    if (mode === "manual") {
      if (!full1 || !full2) {
        team = p1 <= p2 ? 1 : 2;
      }
      return { team, action };
    }

    // captains (lite): decide action from user’s grid toggle? we don’t have global,
    // so infer: until each side has 5 picks, we say PICK (bans shown in grid toggle anyway)
    if (!full1 || !full2) {
      team = p1 <= p2 ? 1 : 2;
      action = "PICK";
    } else {
      // after full picks, any further bans from UI are user-driven — keep label neutral
      action = "BAN";
    }
    return { team, action };
  }, [mode, t1.length, t2.length, bans.length]);

  return (
    <div
      style={{
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#0d1117",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontWeight: 700 }}>Turn</span>
        <span style={{ opacity: 0.9 }}>Team {state.team}</span>
      </div>
      <div
        style={{
          padding: "2px 10px",
          border: "1px solid #30363d",
          borderRadius: 999,
        }}
      >
        {state.action}
      </div>
      <div style={{ opacity: 0.7, fontSize: 12 }}>
        Mode: {mode === "manual" ? "Manual" : "Captains (lite)"}
      </div>
    </div>
  );
}

// simple helper for parent to know which team is active
export function useActiveTeam(): 1 | 2 {
  const t1 = useStore((s) => s.team1).length;
  const t2 = useStore((s) => s.team2).length;
  const full1 = t1 >= 5,
    full2 = t2 >= 5;
  if (full1 && !full2) return 2;
  if (!full1 && full2) return 1;
  return t1 <= t2 ? 1 : 2;
}
