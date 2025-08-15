import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceArea,
  ReferenceDot,
} from "recharts";

export function CompositionBars({
  data,
}: {
  data: { axis: string; t1: number; t2: number }[];
}) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="axis" />
          <YAxis />
          <RTooltip />
          <Bar dataKey="t1" name="Team 1" />
          <Bar dataKey="t2" name="Team 2" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TimingChart({
  points,
  windows,
  spikes,
}: {
  points: { minute: number; t1: number; t2: number }[];
  windows: { start: number; end: number; label: string }[];
  spikes: { minute: number; label: string }[];
}) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="minute" />
          <YAxis />
          <RTooltip />
          <Line type="monotone" dataKey="t1" name="Team 1 Push" />
          <Line type="monotone" dataKey="t2" name="Team 2 Push" />
          {windows.map((w, i) => (
            <ReferenceArea key={i} x1={w.start} x2={w.end} label={w.label} />
          ))}
          {spikes.map((s, i) => (
            <ReferenceDot
              key={"s" + i}
              x={s.minute}
              y={0}
              r={4}
              label={s.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
