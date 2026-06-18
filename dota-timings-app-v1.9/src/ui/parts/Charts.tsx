import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from "recharts";

const T1 = "#58a6ff";
const T2 = "#f0883e";

const AXIS_LABEL: Record<string, string> = {
  fight:   "Teamfight",
  pickoff: "Pickoff",
  push:    "Push",
  rosh:    "Roshan",
  sustain: "Sustain",
  defense: "Defense",
  scale:   "Late Scale",
};

// ── Composition comparison bars (stacked-pct per axis) ───────────────────────

export function CompositionBars({
  data,
}: {
  data: { axis: string; t1: number; t2: number }[];
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 3, background: T1, display: "inline-block", borderRadius: 2 }} />
          Team 1
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 3, background: T2, display: "inline-block", borderRadius: 2 }} />
          Team 2
        </span>
      </div>

      {data.map((row) => {
        const total = row.t1 + row.t2;
        const pct1 = total > 0 ? (row.t1 / total) * 100 : 50;
        const pct2 = 100 - pct1;
        const diff = row.t1 - row.t2;
        const winner = Math.abs(diff) < 8 ? "even" : diff > 0 ? "t1" : "t2";

        return (
          <div key={row.axis} style={{ display: "grid", gridTemplateColumns: "88px 1fr 52px", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#8b949e", textAlign: "right" }}>
              {AXIS_LABEL[row.axis] ?? row.axis}
            </span>

            {/* stacked percentage bar */}
            <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", background: "#21262d" }}>
              <div style={{ width: `${pct1}%`, background: T1, transition: "width .3s" }} />
              <div style={{ width: `${pct2}%`, background: T2, transition: "width .3s" }} />
            </div>

            {/* delta chip */}
            <span style={{
              fontSize: 11, fontWeight: 600, textAlign: "center",
              color: winner === "t1" ? T1 : winner === "t2" ? T2 : "#8b949e",
            }}>
              {winner === "even" ? "Even" : winner === "t1" ? `T1 +${diff}` : `T2 +${Math.abs(diff)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Timing / combat chart ─────────────────────────────────────────────────────

type SeriesMode = "combat" | "push";

export function TimingChart({
  points,
  windows,
  spikes,
}: {
  points: { minute: number; t1Combat: number; t2Combat: number; t1Push: number; t2Push: number }[];
  windows: { start: number; end: number; label: string }[];
  spikes: { minute: number; label: string }[];
}) {
  const [mode, setMode] = useState<SeriesMode>("combat");

  const d1Key = mode === "combat" ? "t1Combat" : "t1Push";
  const d2Key = mode === "combat" ? "t2Combat" : "t2Push";
  const d1Label = mode === "combat" ? "T1 Threat" : "T1 Push";
  const d2Label = mode === "combat" ? "T2 Threat" : "T2 Push";

  // For spike dot y-value: find the higher of the two teams at that minute
  const valAtMinute = (key: string, min: number) => {
    const pt = points.find((p) => p.minute === min);
    return pt ? (pt as any)[key] ?? 0 : 0;
  };

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["combat", "push"] as SeriesMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "3px 10px", fontSize: 11, borderRadius: 6,
              border: `1px solid ${mode === m ? "#58a6ff" : "#30363d"}`,
              background: mode === m ? "#1f6feb22" : "transparent",
              color: mode === m ? "#58a6ff" : "#8b949e",
              cursor: "pointer",
            }}
          >
            {m === "combat" ? "Fight / Pickoff" : "Push Power"}
          </button>
        ))}
      </div>

      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis
              dataKey="minute"
              tickFormatter={(v) => `${v}m`}
              tick={{ fontSize: 11, fill: "#8b949e" }}
              axisLine={{ stroke: "#30363d" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#8b949e" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <RTooltip
              contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 }}
              labelFormatter={(v) => `Minute ${v}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* Objective windows */}
            {windows.map((w, i) => (
              <ReferenceArea
                key={i}
                x1={w.start} x2={w.end}
                fill={w.label.startsWith("T1") ? T1 : T2}
                fillOpacity={0.08}
                stroke={w.label.startsWith("T1") ? T1 : T2}
                strokeOpacity={0.3}
                strokeDasharray="4 4"
              />
            ))}

            {/* Power spikes */}
            {spikes.map((s, i) => {
              const y1 = valAtMinute(d1Key, s.minute);
              const y2 = valAtMinute(d2Key, s.minute);
              const isT1Spike = s.label.startsWith("T1");
              const color = isT1Spike ? T1 : T2;
              const peakY = Math.max(y1, y2);
              return (
                <ReferenceLine
                  key={"sp" + i}
                  x={s.minute}
                  stroke={color}
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                  label={{
                    value: s.label.replace(/ peak$/, "").replace(/ surge$/, "↑"),
                    position: peakY > 120 ? "insideTopLeft" : "insideBottomLeft",
                    fontSize: 10,
                    fill: color,
                  }}
                />
              );
            })}

            <Line
              type="monotone"
              dataKey={d1Key}
              name={d1Label}
              stroke={T1}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: T1 }}
            />
            <Line
              type="monotone"
              dataKey={d2Key}
              name={d2Label}
              stroke={T2}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: T2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Window legend */}
      {windows.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          {windows.map((w, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "1px 8px", borderRadius: 999,
              background: `${w.label.startsWith("T1") ? T1 : T2}18`,
              border: `1px solid ${w.label.startsWith("T1") ? T1 : T2}44`,
              color: w.label.startsWith("T1") ? T1 : T2,
            }}>
              {w.start}–{w.end}m {w.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
