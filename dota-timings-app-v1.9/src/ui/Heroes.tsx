import { useState } from "react";
import { useStore } from "@/store";
import type { Hero } from "@/store";
import LocalHeroImg from "./components/LocalHeroImg";
import { useHeroMatchups, useHeroSynergies } from "@/lib/api-hooks";

export default function Heroes() {
  const heroes = useStore((s) => s.heroes);
  const [selected, setSelected] = useState<Hero | null>(null);
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? heroes.filter((h) => h.localized_name.toLowerCase().includes(q.toLowerCase()))
    : heroes;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, height: "calc(100vh - 80px)" }}>
      {/* Sidebar — hero list */}
      <div style={{ border: "1px solid #30363d", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #30363d" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search heroes…"
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #30363d", borderRadius: 6, background: "#0d1117", color: "#e6edf3", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          {filtered.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelected(h)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 10px",
                border: "none",
                borderBottom: "1px solid #21262d",
                background: selected?.id === h.id ? "#161b22" : "transparent",
                color: "#e6edf3",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <LocalHeroImg hero={h} kind="icon" style={{ width: 28, height: 28, borderRadius: 4, flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{h.localized_name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ overflow: "auto" }}>
        {selected ? (
          <HeroDetail hero={selected} heroes={heroes} />
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", opacity: 0.4, fontSize: 14 }}>
            Select a hero to view details
          </div>
        )}
      </div>
    </div>
  );
}

function HeroDetail({ hero, heroes }: { hero: Hero; heroes: Hero[] }) {
  const { data: matchupData, isLoading: mLoading } = useHeroMatchups(hero.id, { limit: 15, minGames: 50 });
  const { data: synergyData, isLoading: sLoading } = useHeroSynergies(hero.id, { limit: 15, minGames: 20 });

  const getHero = (id: number) => heroes.find((h) => h.id === id);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Hero header */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", border: "1px solid #30363d", borderRadius: 8, padding: 12 }}>
        <LocalHeroImg hero={hero} kind="portrait" style={{ width: 96, height: 96, borderRadius: 8, objectFit: "cover" }} />
        <div>
          <h2 style={{ margin: 0 }}>{hero.localized_name}</h2>
          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(hero.roles || []).map((r) => (
              <span key={r} style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #30363d", borderRadius: 999, opacity: 0.8 }}>{r}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Good against (hero wins vs these) */}
        <MatchupTable
          title="Good Against"
          color="#3fb950"
          rows={matchupData?.counters ?? []}
          loading={mLoading}
          getHero={getHero}
          wrLabel="hero WR vs"
          empty="Run Sync & Reload to populate matchup data."
        />
        {/* Bad against (these heroes beat this hero) */}
        <MatchupTable
          title="Bad Against"
          color="#f85149"
          rows={matchupData?.counteredBy ?? []}
          loading={mLoading}
          getHero={getHero}
          wrLabel="counter WR vs"
          empty="Run Sync & Reload to populate matchup data."
        />
        {/* Best allies */}
        <SynergyTable
          title="Best With"
          rows={synergyData?.allies ?? []}
          loading={sLoading}
          getHero={getHero}
          empty="Run Sync & Reload to populate synergy data."
        />
      </div>
    </div>
  );
}

function MatchupTable({
  title,
  color,
  rows,
  loading,
  getHero,
  wrLabel,
  empty,
}: {
  title: string;
  color: string;
  rows: { opponent_id?: number; counter_id?: number; winrate: number; games: number; score: number }[];
  loading: boolean;
  getHero: (id: number) => Hero | undefined;
  wrLabel: string;
  empty: string;
}) {
  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #30363d", fontWeight: 600, color, fontSize: 13 }}>
        {title}
      </div>
      {loading ? (
        <div style={{ padding: 12, opacity: 0.5, fontSize: 12 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 12, opacity: 0.4, fontSize: 12 }}>{empty}</div>
      ) : (
        <div>
          {rows.map((r) => {
            const id = r.opponent_id ?? r.counter_id ?? 0;
            const h = getHero(id);
            const wr = (r.winrate * 100).toFixed(1);
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid #21262d" }}>
                {h && <LocalHeroImg hero={h} kind="icon" style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 12 }}>{h?.localized_name ?? `#${id}`}</span>
                <span style={{ fontSize: 12, color, opacity: 0.9 }}>{wr}%</span>
                <span style={{ fontSize: 11, opacity: 0.4 }}>{r.games.toLocaleString()}g</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SynergyTable({
  title,
  rows,
  loading,
  getHero,
  empty,
}: {
  title: string;
  rows: { ally_id: number; wr: number; games: number; score: number }[];
  loading: boolean;
  getHero: (id: number) => Hero | undefined;
  empty: string;
}) {
  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #30363d", fontWeight: 600, color: "#58a6ff", fontSize: 13 }}>
        {title}
      </div>
      {loading ? (
        <div style={{ padding: 12, opacity: 0.5, fontSize: 12 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 12, opacity: 0.4, fontSize: 12 }}>{empty}</div>
      ) : (
        <div>
          {rows.map((r) => {
            const h = getHero(r.ally_id);
            const wr = (r.wr * 100).toFixed(1);
            return (
              <div key={r.ally_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid #21262d" }}>
                {h && <LocalHeroImg hero={h} kind="icon" style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 12 }}>{h?.localized_name ?? `#${r.ally_id}`}</span>
                <span style={{ fontSize: 12, color: "#58a6ff", opacity: 0.9 }}>{wr}%</span>
                <span style={{ fontSize: 11, opacity: 0.4 }}>{r.games.toLocaleString()}g</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
