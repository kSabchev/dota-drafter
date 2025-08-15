import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import LocalHeroImg from "@/ui/components/LocalHeroImg";

export default function MatrixTab() {
  const loadMatrix = useStore((s) => s.loadMatrix);
  const matrix = useStore((s) => s.matrix);
  const heroes = useStore((s) => s.heroes);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!matrix) loadMatrix().catch(() => {});
  }, [matrix, loadMatrix]);

  const filtered = useMemo(
    () =>
      heroes.filter((h) =>
        h.localized_name.toLowerCase().includes(q.toLowerCase())
      ),
    [heroes, q]
  );
  const selected = selId ?? filtered[0]?.id;
  const topAllies = (selected && matrix?.topAllies[selected]) || [];
  const topOpp = (selected && matrix?.topOpponents[selected]) || [];

  const nameById = (id: number) =>
    heroes.find((h) => h.id === id)?.localized_name || "#" + id;

  return (
    <div
      style={{
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: 8,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find hero..."
          style={{
            padding: "6px 8px",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "#0d1117",
            color: "#e6edf3",
          }}
        />
        <select
          value={selected}
          onChange={(e) => setSelId(Number(e.target.value))}
          style={{
            padding: "6px 8px",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "#0d1117",
            color: "#e6edf3",
          }}
        >
          {filtered.map((h) => (
            <option key={h.id} value={h.id}>
              {h.localized_name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Col
          title="Best With"
          items={topAllies.slice(0, 8)}
          nameById={nameById}
        />
        <Col
          title="Best Against"
          items={topOpp.slice(0, 8)}
          nameById={nameById}
        />
      </div>
    </div>
  );
}

function Col({
  title,
  items,
  nameById,
}: {
  title: string;
  items: { id: number; score: number }[];
  nameById: (id: number) => string;
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {items.map((x) => (
        <div
          key={x.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              overflow: "hidden",
              borderRadius: 4,
              border: "1px solid #30363d",
            }}
          ></div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
              }}
            >
              <span>{nameById(x.id)}</span>
              <span style={{ opacity: 0.8 }}>
                {x.score > 0 ? `+${x.score}` : x.score}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: "#222",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, Math.max(0, (x.score + 20) / 0.6))}%`,
                }}
              />
            </div>
          </div>
        </div>
      ))}
      {items.length === 0 && <div style={{ opacity: 0.7 }}>No data.</div>}
    </div>
  );
}
