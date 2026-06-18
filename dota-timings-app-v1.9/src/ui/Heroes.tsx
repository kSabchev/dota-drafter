import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/store";
import type { Hero } from "@/store";
import LocalHeroImg from "./components/LocalHeroImg";
import { useHeroLore, useHeroMatchups, useHeroSynergies, useHeroItems, useItemConstants, useHeroTimings } from "@/lib/api-hooks";
import { DESIRE_KEYS } from "@/lib/api-hooks";
import type { HeroMatchup, HeroSynergy, DesireKey, HeroTimings } from "@/lib/api-hooks";
import { PillButton } from "@/ui/primitives";

type DetailTab = "overview" | "timings" | "matchups" | "synergies" | "guides";
type SortKey = "score" | "winrate" | "games";

export default function Heroes() {
  const heroes = useStore((s) => s.heroes);
  const [selected, setSelected] = useState<Hero | null>(null);
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? heroes.filter((h) => h.localized_name.toLowerCase().includes(q.toLowerCase()))
    : heroes;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, height: "calc(100vh - 80px)" }}>
      {/* Sidebar */}
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
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "5px 10px", border: "none", borderBottom: "1px solid #21262d", background: selected?.id === h.id ? "#161b22" : "transparent", color: "#e6edf3", cursor: "pointer", textAlign: "left" }}
            >
              <LocalHeroImg hero={h} kind="icon" style={{ width: 26, height: 26, borderRadius: 4, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13 }}>{h.localized_name}</span>
              {h.primary_attr && <AttrDot attr={h.primary_attr} />}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ overflow: "auto" }}>
        {selected
          ? <HeroDetail hero={selected} heroes={heroes} />
          : <div style={{ display: "grid", placeItems: "center", height: "100%", opacity: 0.35, fontSize: 14 }}>Select a hero to view details</div>
        }
      </div>
    </div>
  );
}

function AttrDot({ attr }: { attr: string }) {
  const c: Record<string, string> = { str: "#e84a5f", agi: "#4caf50", int: "#2196f3", all: "#9c27b0" };
  return <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: c[attr] ?? "#888", flexShrink: 0 }} />;
}

function HeroDetail({ hero, heroes }: { hero: Hero; heroes: Hero[] }) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const tabs: { key: DetailTab; label: string }[] = [
    { key: "overview",  label: "Overview" },
    { key: "timings",   label: "Timings" },
    { key: "matchups",  label: "Matchups" },
    { key: "synergies", label: "Synergies" },
    { key: "guides",    label: "Guides" },
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <HeroHeader hero={hero} />
      <div style={{ display: "flex", gap: 6 }}>
        {tabs.map((t) => (
          <PillButton key={t.key} onClick={() => setTab(t.key)}
            style={{ background: tab === t.key ? "#161b22" : "transparent", borderColor: tab === t.key ? "#58a6ff" : "#30363d", color: tab === t.key ? "#58a6ff" : "#8b949e" }}>
            {t.label}
          </PillButton>
        ))}
      </div>
      {tab === "overview"  && <OverviewTab hero={hero} />}
      {tab === "timings"   && <TimingsTab hero={hero} />}
      {tab === "matchups"  && <MatchupsTab hero={hero} heroes={heroes} />}
      {tab === "synergies" && <SynergiesTab hero={hero} heroes={heroes} />}
      {tab === "guides"    && <GuidesTab hero={hero} />}
    </div>
  );
}

function HeroHeader({ hero }: { hero: Hero }) {
  const attrLabel: Record<string, string> = { str: "Strength", agi: "Agility", int: "Intelligence", all: "Universal" };
  const attrColor: Record<string, string> = { str: "#e84a5f", agi: "#4caf50", int: "#2196f3", all: "#9c27b0" };
  const attr = hero.primary_attr ?? null;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", border: "1px solid #30363d", borderRadius: 8, padding: 14, background: "#0f141a" }}>
      <LocalHeroImg hero={hero} kind="portrait" style={{ width: 88, height: 88, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{hero.localized_name}</h2>
          {attr && (
            <span style={{ fontSize: 11, padding: "2px 8px", border: `1px solid ${attrColor[attr]}44`, borderRadius: 999, color: attrColor[attr], background: `${attrColor[attr]}11`, fontWeight: 600 }}>
              {attrLabel[attr] ?? attr}
            </span>
          )}
          {hero.attack_type && (
            <span style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #30363d", borderRadius: 999, opacity: 0.7 }}>{hero.attack_type}</span>
          )}
          {hero.cm_enabled === false && (
            <span style={{ fontSize: 11, color: "#d29922", padding: "2px 8px", border: "1px solid #d2992233", borderRadius: 999 }}>Not in CM</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(hero.roles ?? []).map((r) => (
            <span key={r} style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #30363d", borderRadius: 999, opacity: 0.75 }}>{r}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ hero }: { hero: Hero }) {
  const { data: loreMap } = useHeroLore();
  const lore = loreMap?.[hero.id] ?? null;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {(hero.base_str != null || hero.move_speed != null) && (
        <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 14, background: "#0f141a" }}>
          <SectionLabel>Base Stats</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {hero.base_str != null && <StatItem label="Strength"      value={`${hero.base_str}  +${hero.str_gain?.toFixed(1)}`}  color="#e84a5f" />}
            {hero.base_agi != null && <StatItem label="Agility"       value={`${hero.base_agi}  +${hero.agi_gain?.toFixed(1)}`}  color="#4caf50" />}
            {hero.base_int != null && <StatItem label="Intelligence"  value={`${hero.base_int}  +${hero.int_gain?.toFixed(1)}`}  color="#2196f3" />}
            {hero.move_speed    != null && <StatItem label="Move Speed"    value={String(hero.move_speed)} />}
            {hero.attack_range  != null && <StatItem label="Attack Range"  value={String(hero.attack_range)} />}
            {hero.attack_rate   != null && <StatItem label="Attack Rate"   value={String(hero.attack_rate)} />}
            {hero.base_armor    != null && <StatItem label="Base Armor"    value={String(hero.base_armor)} />}
            {hero.base_health_regen != null && <StatItem label="HP Regen"  value={String(hero.base_health_regen)} />}
            {hero.base_mana_regen   != null && <StatItem label="Mana Regen" value={String(hero.base_mana_regen)} />}
          </div>
        </div>
      )}

      <PositionEditor hero={hero} />

      <ItemBuildsEditor hero={hero} />

      {lore ? (
        <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 14, background: "#0f141a" }}>
          <SectionLabel>Lore</SectionLabel>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, opacity: 0.85, fontStyle: "italic" }}>{lore}</p>
        </div>
      ) : (
        <div style={{ opacity: 0.3, fontSize: 13, padding: "4px 0" }}>Lore unavailable — restart the server to load lore data.</div>
      )}
    </div>
  );
}

// tier: 0=main  1=secondary  2=suboptimal  3=undesirable
const PE_TIER_COLOR  = ["#3fb950", "#58a6ff", "#d29922", "#f85149"] as const;
const PE_TIER_SYMBOL = ["★", "○", "△", "✕"] as const;
const PE_TIER_LABEL  = ["Main", "Secondary", "Suboptimal", "Undesirable"] as const;
const PE_POS_LABEL   = ["Carry", "Mid", "Off", "Soft Sup", "Hard Sup"] as const;

function PositionEditor({ hero }: { hero: Hero }) {
  const apiBase = useStore((s) => s.apiBase);
  const [positions, setPositions] = useState<{ position: number; tier: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/heroes/${hero.id}/positions`);
      const j = await r.json();
      setPositions(j.positions ?? []);
      setDirty(false);
    } catch {}
  }, [apiBase, hero.id]);

  useEffect(() => { load(); }, [load]);

  const getTier = (p: number): number | undefined =>
    positions.find((x) => x.position === p)?.tier;

  /** Click cycles: unassigned → main(0) → secondary(1) → suboptimal(2) → undesirable(3) → remove */
  const cyclePos = (p: number) => {
    setDirty(true);
    const cur = getTier(p);
    if (cur === undefined) {
      const defaultTier = positions.length === 0 ? 0 : 1;
      setPositions((prev) => [...prev, { position: p, tier: defaultTier }].sort((a, b) => a.position - b.position));
    } else if (cur >= 3) {
      setPositions((prev) => prev.filter((x) => x.position !== p));
    } else {
      setPositions((prev) => prev.map((x) => x.position === p ? { ...x, tier: x.tier + 1 } : x));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${apiBase}/heroes/${hero.id}/positions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(positions),
      });
      setDirty(false);
    } catch {}
    setSaving(false);
  };

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 14, background: "#0f141a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <SectionLabel style={{ marginBottom: 0 }}>Positions</SectionLabel>
        {dirty && (
          <PillButton onClick={save} disabled={saving} style={{ padding: "2px 10px", fontSize: 11, borderColor: "#58a6ff", color: "#58a6ff" }}>
            {saving ? "Saving…" : "Save"}
          </PillButton>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((p) => {
          const tier = getTier(p);
          const assigned = tier !== undefined;
          const color = assigned ? PE_TIER_COLOR[tier!] : "#8b949e";
          return (
            <button
              key={p}
              onClick={() => cyclePos(p)}
              title={
                !assigned
                  ? `Click to add pos ${p} (${PE_POS_LABEL[p - 1]})`
                  : tier! >= 3
                  ? "Click to remove"
                  : `${PE_TIER_LABEL[tier!]} → click to downgrade`
              }
              style={{
                width: 64, height: 64,
                border: `2px solid ${assigned ? color : "#30363d"}`,
                borderRadius: 10,
                background: assigned ? `${color}18` : "transparent",
                color, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
              }}
            >
              <span style={{ fontSize: assigned ? 18 : 16, fontWeight: 700 }}>
                {assigned ? PE_TIER_SYMBOL[tier!] : p}
              </span>
              <span style={{ fontSize: 9, opacity: 0.7, lineHeight: 1.1 }}>
                {PE_POS_LABEL[p - 1]}
              </span>
              {assigned && (
                <span style={{ fontSize: 8, opacity: 0.6 }}>{PE_TIER_LABEL[tier!]}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 10, opacity: 0.3, lineHeight: 1.6 }}>
        Click to cycle: unassigned → ★ Main → ○ Secondary → △ Suboptimal → ✕ Undesirable → remove
      </div>
    </div>
  );
}

// ─── Item Builds ──────────────────────────────────────────────────────────────

const POS_LABEL_SHORT: Record<string, string> = {
  "1": "Carry", "2": "Mid", "3": "Off", "4": "Soft Sup", "5": "Hard Sup", "generic": "Generic",
};

function ItemBuildsEditor({ hero }: { hero: Hero }) {
  const apiBase = useStore((s) => s.apiBase);
  const { data: builds, refetch } = useHeroItems(hero.id);
  const { data: itemMap } = useItemConstants();

  // Which position tab is open in the editor
  const heroPositions = useStore((s: any) => s.heroPositions ?? {});
  const assignedPositions: string[] = (heroPositions[hero.id] ?? [])
    .filter((e: any) => e.tier <= 1)
    .map((e: any) => String(e.position));
  if (!assignedPositions.includes("generic")) assignedPositions.push("generic");

  const [posTab, setPosTab] = useState<string>("generic");
  const [editItems, setEditItems] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync edit state when tab or builds change
  useEffect(() => {
    setEditItems(builds?.[posTab] ?? []);
    setEditing(false);
  }, [posTab, builds]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/heroes/${hero.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: posTab === "generic" ? "generic" : Number(posTab), items: editItems }),
      });
      if (!r.ok) throw new Error(await r.text());
      await refetch();
      setEditing(false);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const fetchFromOpenDota = async () => {
    setFetching(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/admin/heroes/${hero.id}/fetch-items`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await refetch();
      setPosTab("generic");
    } catch (e: any) { setError(e.message); }
    setFetching(false);
  };

  const addItem = () => {
    const v = newItem.trim().toLowerCase().replace(/\s+/g, "_");
    if (v && !editItems.includes(v)) setEditItems((p) => [...p, v]);
    setNewItem("");
  };

  const displayItems = editing ? editItems : (builds?.[posTab] ?? []);

  const lookupItem = (name: string) => itemMap?.[name];

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 14, background: "#0f141a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <SectionLabel style={{ marginBottom: 0 }}>Item Builds</SectionLabel>
        <div style={{ display: "flex", gap: 4 }}>
          {assignedPositions.map((p) => (
            <button
              key={p}
              onClick={() => setPosTab(p)}
              style={{
                padding: "2px 8px", fontSize: 11, borderRadius: 999, border: "1px solid #30363d",
                background: posTab === p ? "#161b22" : "transparent",
                color: posTab === p ? "#58a6ff" : "#8b949e",
                borderColor: posTab === p ? "#58a6ff" : "#30363d",
                cursor: "pointer",
              }}
            >
              {POS_LABEL_SHORT[p] ?? `Pos ${p}`}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {!editing && (
            <PillButton onClick={fetchFromOpenDota} disabled={fetching}
              style={{ fontSize: 11, borderColor: "#30363d", color: "#8b949e" }}>
              {fetching ? "Fetching…" : "↓ Auto-fill"}
            </PillButton>
          )}
          {!editing
            ? <PillButton onClick={() => { setEditing(true); setEditItems(builds?.[posTab] ?? []); }}
                style={{ fontSize: 11, borderColor: "#30363d", color: "#8b949e" }}>Edit</PillButton>
            : <>
                <PillButton onClick={() => setEditing(false)} style={{ fontSize: 11, borderColor: "#30363d", color: "#8b949e" }}>Cancel</PillButton>
                <PillButton onClick={save} disabled={saving}
                  style={{ fontSize: 11, borderColor: "#3fb950", color: "#3fb950" }}>
                  {saving ? "Saving…" : "Save"}
                </PillButton>
              </>
          }
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "#f85149", marginBottom: 8 }}>{error}</div>}

      {/* Item display / edit */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 40 }}>
        {displayItems.length === 0 && !editing && (
          <span style={{ fontSize: 12, opacity: 0.35 }}>No items. Click Edit or Auto-fill to add.</span>
        )}
        {displayItems.map((name) => {
          const it = lookupItem(name);
          return (
            <div key={name} style={{
              display: "flex", alignItems: "center", gap: 4,
              border: "1px solid #30363d", borderRadius: 6, padding: "3px 6px",
              background: "#0d1117", fontSize: 12,
            }}>
              {it?.img && <img src={it.img} alt="" style={{ width: 20, height: 20, borderRadius: 2, objectFit: "contain" }} />}
              <span>{it?.dname ?? name}</span>
              {editing && (
                <button
                  onClick={() => setEditItems((p) => p.filter((x) => x !== name))}
                  style={{ background: "none", border: "none", color: "#f85149", cursor: "pointer", padding: "0 2px", fontSize: 12 }}
                >×</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add item input */}
      {editing && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
            placeholder="item internal name (e.g. manta, power_treads)"
            list="item-datalist"
            style={{ flex: 1, padding: "5px 8px", border: "1px solid #30363d", borderRadius: 6, background: "#0d1117", color: "#e6edf3", fontSize: 12 }}
          />
          <datalist id="item-datalist">
            {itemMap && Object.keys(itemMap).map((k) => <option key={k} value={k}>{itemMap[k].dname}</option>)}
          </datalist>
          <PillButton onClick={addItem} style={{ fontSize: 12, borderColor: "#58a6ff", color: "#58a6ff" }}>Add</PillButton>
        </div>
      )}
    </div>
  );
}

// ─── Timings ──────────────────────────────────────────────────────────────────

const DESIRE_META: Record<DesireKey, { label: string; color: string; desc: string }> = {
  teamfight: { label: "Team Fight",  color: "#f85149", desc: "Contributes to 5v5 teamfights" },
  pickoff:   { label: "Pick Off",    color: "#d29922", desc: "Creates solo/duo kill opportunities" },
  push:      { label: "Push",        color: "#3fb950", desc: "Sieges towers and threatens objectives" },
  split:     { label: "Split Push",  color: "#58a6ff", desc: "Pushes a separate lane solo" },
  objective: { label: "Objective",   color: "#a371f7", desc: "Roshan, neutrals, outposts" },
  farm:      { label: "Farm",        color: "#79c0ff", desc: "Needs uninterrupted gold income" },
  early_end: { label: "Early End",   color: "#ffa657", desc: "Power peaks early; wants to close out" },
  late_scale:{ label: "Late Scale",  color: "#bc8cff", desc: "Becomes stronger per minute past 25" },
};

const MINUTES = [10, 15, 20, 25, 30] as const;

function hexRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const EMPTY_TIMINGS: Record<DesireKey, [number,number,number,number,number]> =
  Object.fromEntries(DESIRE_KEYS.map((k) => [k, [0,0,0,0,0]])) as any;

function TimingsTab({ hero }: { hero: Hero }) {
  const apiBase = useStore((s) => s.apiBase);
  const { data: serverTimings, refetch } = useHeroTimings(hero.id);

  const [timings, setTimings] = useState<Record<DesireKey, [number,number,number,number,number]>>(EMPTY_TIMINGS);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hoveredMin, setHoveredMin] = useState<number | null>(null);

  // sync from server
  useEffect(() => {
    if (serverTimings && Object.keys(serverTimings).length > 0) {
      setTimings({ ...EMPTY_TIMINGS, ...serverTimings } as typeof timings);
    } else {
      setTimings(EMPTY_TIMINGS);
    }
    setEditing(false);
  }, [serverTimings, hero.id]);

  const hasData = Object.values(timings).some((arr) => arr.some((v) => v > 0));

  const set = (key: DesireKey, idx: number, val: number) => {
    setTimings((prev) => {
      const arr = [...prev[key]] as [number,number,number,number,number];
      arr[idx] = Math.max(0, Math.min(100, val));
      return { ...prev, [key]: arr };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${apiBase}/heroes/${hero.id}/timings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(timings),
      });
      await refetch();
      setEditing(false);
    } catch {}
    setSaving(false);
  };

  // Dominant desire per time slot (highest value)
  const dominant = MINUTES.map((_, mi) => {
    let best: DesireKey = "teamfight";
    let bestVal = -1;
    for (const k of DESIRE_KEYS) {
      if (timings[k][mi] > bestVal) { bestVal = timings[k][mi]; best = k; }
    }
    return bestVal > 0 ? { key: best, val: bestVal } : null;
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* SVG Line Chart */}
      <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 14, background: "#0f141a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <SectionLabel style={{ marginBottom: 0 }}>Activity Desire Timeline</SectionLabel>
          {!editing
            ? <PillButton onClick={() => setEditing(true)} style={{ marginLeft: "auto", fontSize: 11, borderColor: "#30363d", color: "#8b949e" }}>Edit</PillButton>
            : <>
                <PillButton onClick={() => { setEditing(false); setTimings({ ...EMPTY_TIMINGS, ...(serverTimings ?? {}) } as typeof timings); }} style={{ marginLeft: "auto", fontSize: 11, borderColor: "#30363d", color: "#8b949e" }}>Cancel</PillButton>
                <PillButton onClick={save} disabled={saving} style={{ fontSize: 11, borderColor: "#3fb950", color: "#3fb950" }}>{saving ? "Saving…" : "Save"}</PillButton>
              </>
          }
        </div>

        {!hasData && !editing && (
          <div style={{ fontSize: 12, opacity: 0.35, padding: "16px 0" }}>
            No timing data yet. Click Edit to add activity profiles for this hero.
          </div>
        )}

        {/* Line Chart */}
        {hasData && (
          <DesireLineChart timings={timings} hoveredMin={hoveredMin} onHoverMin={setHoveredMin} />
        )}

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {DESIRE_KEYS.map((k) => {
            const m = DESIRE_META[k];
            return (
              <div key={k} title={m.desc} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, opacity: 0.75 }}>
                <span style={{ width: 12, height: 3, background: m.color, display: "inline-block", borderRadius: 2 }} />
                {m.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Heatmap Grid */}
      <div style={{ border: "1px solid #30363d", borderRadius: 8, overflow: "hidden", background: "#0f141a" }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "130px repeat(5, 1fr)", borderBottom: "1px solid #21262d" }}>
          <div style={{ padding: "8px 12px", fontSize: 11, opacity: 0.4 }}>DESIRE</div>
          {MINUTES.map((m, mi) => (
            <div key={m} style={{
              padding: "6px 0", textAlign: "center", fontSize: 11, fontWeight: 600,
              background: hoveredMin === mi ? "#161b22" : "transparent",
              cursor: "default",
              borderLeft: "1px solid #21262d",
            }}
            onMouseEnter={() => setHoveredMin(mi)}
            onMouseLeave={() => setHoveredMin(null)}
            >
              <div style={{ opacity: 0.7 }}>{m} min</div>
              {dominant[mi] && (
                <div style={{ fontSize: 9, color: DESIRE_META[dominant[mi]!.key].color, opacity: 0.9, marginTop: 1 }}>
                  {DESIRE_META[dominant[mi]!.key].label}
                </div>
              )}
            </div>
          ))}
        </div>

        {DESIRE_KEYS.map((key) => {
          const m = DESIRE_META[key];
          return (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "130px repeat(5, 1fr)", borderBottom: "1px solid #21262d" }}>
              <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, opacity: 0.85 }} title={m.desc}>{m.label}</span>
              </div>
              {MINUTES.map((_, mi) => {
                const val = timings[key][mi];
                return (
                  <div key={mi} style={{
                    borderLeft: "1px solid #21262d",
                    background: hoveredMin === mi ? "#161b22" : "transparent",
                    position: "relative",
                    height: 36,
                  }}
                  onMouseEnter={() => setHoveredMin(mi)}
                  onMouseLeave={() => setHoveredMin(null)}
                  >
                    {/* Fill bar */}
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      height: `${val}%`,
                      background: hexRgba(m.color, 0.25 + (val / 100) * 0.55),
                      transition: "height 0.2s",
                    }} />
                    {editing ? (
                      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 4px" }}>
                        <input
                          type="range" min={0} max={100} step={5}
                          value={val}
                          onChange={(e) => set(key, mi, Number(e.target.value))}
                          style={{ width: "100%", accentColor: m.color, cursor: "pointer" }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                        height: "100%", fontSize: 12, fontWeight: 600,
                        color: val > 50 ? m.color : val > 20 ? "#8b949e" : "#484f58",
                      }}>
                        {val > 0 ? val : "—"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesireLineChart({
  timings, hoveredMin, onHoverMin,
}: {
  timings: Record<DesireKey, [number,number,number,number,number]>;
  hoveredMin: number | null;
  onHoverMin: (i: number | null) => void;
}) {
  const W = 460; const H = 120; const PAD_L = 6; const PAD_R = 6; const PAD_T = 8; const PAD_B = 20;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xOf = (i: number) => PAD_L + (i / 4) * innerW;
  const yOf = (v: number) => PAD_T + (1 - v / 100) * innerH;

  return (
    <svg
      width="100%" viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", cursor: "crosshair" }}
      onMouseLeave={() => onHoverMin(null)}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * W - PAD_L;
        const idx = Math.round(x / (innerW / 4));
        onHoverMin(Math.max(0, Math.min(4, idx)));
      }}
    >
      {/* Grid lines */}
      {[25, 50, 75].map((v) => (
        <line key={v} x1={PAD_L} x2={W - PAD_R} y1={yOf(v)} y2={yOf(v)}
          stroke="#30363d" strokeWidth={0.5} strokeDasharray="2 3" />
      ))}

      {/* Hovered column */}
      {hoveredMin !== null && (
        <line x1={xOf(hoveredMin)} x2={xOf(hoveredMin)} y1={PAD_T} y2={H - PAD_B}
          stroke="#58a6ff" strokeWidth={1} strokeOpacity={0.4} />
      )}

      {/* Lines per desire */}
      {DESIRE_KEYS.map((key) => {
        const m = DESIRE_META[key];
        const pts = timings[key].map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
        return (
          <g key={key}>
            <polyline points={pts} fill="none" stroke={m.color} strokeWidth={1.5} strokeOpacity={0.85} />
            {timings[key].map((v, i) => v > 0 && (
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r={hoveredMin === i ? 4 : 2.5}
                fill={m.color} fillOpacity={hoveredMin === i ? 1 : 0.7} />
            ))}
          </g>
        );
      })}

      {/* X axis labels */}
      {MINUTES.map((min, i) => (
        <text key={min} x={xOf(i)} y={H - 4} textAnchor="middle"
          fill={hoveredMin === i ? "#e6edf3" : "#8b949e"} fontSize={9}>
          {min}m
        </text>
      ))}

      {/* Hover tooltip values */}
      {hoveredMin !== null && (() => {
        const vals = DESIRE_KEYS.map((k) => ({ key: k, val: timings[k][hoveredMin] }))
          .filter((x) => x.val > 0)
          .sort((a, b) => b.val - a.val)
          .slice(0, 3);
        const tx = Math.min(xOf(hoveredMin) + 8, W - 80);
        return (
          <g>
            <rect x={tx} y={PAD_T} width={78} height={vals.length * 13 + 6} rx={4}
              fill="#161b22" stroke="#30363d" strokeWidth={0.5} />
            {vals.map((x, i) => (
              <text key={x.key} x={tx + 5} y={PAD_T + 11 + i * 13} fontSize={9}
                fill={DESIRE_META[x.key].color}>
                {DESIRE_META[x.key].label}: {x.val}
              </text>
            ))}
          </g>
        );
      })()}
    </svg>
  );
}

// ─── Matchups ─────────────────────────────────────────────────────────────────

function MatchupsTab({ hero, heroes }: { hero: Hero; heroes: Hero[] }) {
  const { data, isLoading } = useHeroMatchups(hero.id, { limit: 20 });
  const getHero = (id: number) => heroes.find((h) => h.id === id);

  if (isLoading) return <LoadingPlaceholder />;
  if (!data || (data.counters.length === 0 && data.counteredBy.length === 0))
    return <EmptyState message="No matchup data yet. Run Sync & Reload to populate." />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <SortableMatchupTable
        title="Good Against"
        subtitle="Heroes this hero counters"
        color="#3fb950"
        rows={data.counters}
        getHero={getHero}
      />
      <SortableMatchupTable
        title="Bad Against"
        subtitle="Heroes that counter this hero"
        color="#f85149"
        rows={data.counteredBy}
        getHero={getHero}
      />
    </div>
  );
}

function SortableMatchupTable({
  title, subtitle, color, rows, getHero,
}: {
  title: string; subtitle: string; color: string;
  rows: HeroMatchup[];
  getHero: (id: number) => Hero | undefined;
}) {
  const [sort, setSort] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const v = (x: HeroMatchup) => sort === "winrate" ? x.winrate : sort === "games" ? x.games : x.score;
    return asc ? v(a) - v(b) : v(b) - v(a);
  });

  const toggleSort = (k: SortKey) => {
    if (sort === k) setAsc((v) => !v); else { setSort(k); setAsc(false); }
  };

  const indicator = (k: SortKey) => sort === k ? (asc ? " ↑" : " ↓") : "";

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #30363d", background: "#0f141a" }}>
        <div style={{ fontWeight: 600, color, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, borderBottom: "1px solid #21262d", padding: "4px 12px", background: "#0d1117" }}>
        <span style={{ fontSize: 11, opacity: 0.4 }}>Hero</span>
        {(["winrate", "games", "score"] as SortKey[]).map((k) => (
          <button key={k} onClick={() => toggleSort(k)} style={{ fontSize: 11, opacity: sort === k ? 0.9 : 0.4, background: "transparent", border: "none", color: "#e6edf3", cursor: "pointer", padding: "0 4px", textAlign: "right" }}>
            {k === "winrate" ? "WR%" : k === "games" ? "Games" : "Score"}{indicator(k)}
          </button>
        ))}
      </div>
      {sorted.map((r) => {
        const id = r.opponent_id ?? 0;
        const h = getHero(id);
        return (
          <div key={id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 0, padding: "5px 12px", borderBottom: "1px solid #21262d" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {h && <LocalHeroImg hero={h} kind="icon" style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0 }} />}
              <span style={{ fontSize: 12 }}>{h?.localized_name ?? `#${id}`}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color, textAlign: "right", padding: "0 8px" }}>{(r.winrate * 100).toFixed(1)}%</span>
            <span style={{ fontSize: 11, opacity: 0.35, textAlign: "right", padding: "0 8px" }}>{r.games.toLocaleString()}</span>
            <span style={{ fontSize: 11, opacity: 0.35, textAlign: "right" }}>{r.score}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Synergies ────────────────────────────────────────────────────────────────

function SynergiesTab({ hero, heroes }: { hero: Hero; heroes: Hero[] }) {
  const { data, isLoading } = useHeroSynergies(hero.id, { limit: 20 });
  const getHero = (id: number) => heroes.find((h) => h.id === id);
  const [sort, setSort] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);

  if (isLoading) return <LoadingPlaceholder />;
  if (!data || data.allies.length === 0)
    return <EmptyState message="No synergy data yet. Run Sync & Reload to populate." />;

  const sorted = [...data.allies].sort((a, b) => {
    const v = (x: HeroSynergy) => sort === "winrate" ? x.wr : sort === "games" ? x.games : x.score;
    return asc ? v(a) - v(b) : v(b) - v(a);
  });

  const toggleSort = (k: SortKey) => {
    if (sort === k) setAsc((v) => !v); else { setSort(k); setAsc(false); }
  };

  const indicator = (k: SortKey) => sort === k ? (asc ? " ↑" : " ↓") : "";

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: 8, overflow: "hidden", maxWidth: 520 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #30363d", background: "#0f141a" }}>
        <div style={{ fontWeight: 600, color: "#58a6ff", fontSize: 13 }}>Best Allies</div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>Heroes that synergize well in the same team</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, borderBottom: "1px solid #21262d", padding: "4px 12px", background: "#0d1117" }}>
        <span style={{ fontSize: 11, opacity: 0.4 }}>Hero</span>
        {(["winrate", "games", "score"] as SortKey[]).map((k) => (
          <button key={k} onClick={() => toggleSort(k)} style={{ fontSize: 11, opacity: sort === k ? 0.9 : 0.4, background: "transparent", border: "none", color: "#e6edf3", cursor: "pointer", padding: "0 4px", textAlign: "right" }}>
            {k === "winrate" ? "WR%" : k === "games" ? "Games" : "Score"}{indicator(k)}
          </button>
        ))}
      </div>
      {sorted.map((r) => {
        const h = getHero(r.ally_id);
        return (
          <div key={r.ally_id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 0, padding: "5px 12px", borderBottom: "1px solid #21262d" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {h && <LocalHeroImg hero={h} kind="icon" style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0 }} />}
              <span style={{ fontSize: 12 }}>{h?.localized_name ?? `#${r.ally_id}`}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#58a6ff", textAlign: "right", padding: "0 8px" }}>{(r.wr * 100).toFixed(1)}%</span>
            <span style={{ fontSize: 11, opacity: 0.35, textAlign: "right", padding: "0 8px" }}>{r.games.toLocaleString()}</span>
            <span style={{ fontSize: 11, opacity: 0.35, textAlign: "right" }}>{r.score}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Guides ───────────────────────────────────────────────────────────────────

function GuidesTab({ hero }: { hero: Hero }) {
  const apiBase = useStore((s) => s.apiBase);
  const [guides, setGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [fetched, setFetched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/heroes/${hero.id}/guides`);
      const j = await r.json();
      setGuides(j.guides ?? []);
      setFetched(true);
    } catch {}
    setLoading(false);
  }, [apiBase, hero.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    try {
      await fetch(`${apiBase}/heroes/${hero.id}/guides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, author: author || "anonymous" }) });
      setTitle(""); setBody(""); setAuthor(""); setShowForm(false);
      load();
    } catch {}
  };

  const del = async (id: number) => {
    await fetch(`${apiBase}/heroes/${hero.id}/guides/${id}`, { method: "DELETE" });
    load();
  };

  if (!fetched) return <LoadingPlaceholder />;

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, opacity: 0.6 }}>{guides.length} guide{guides.length !== 1 ? "s" : ""}</span>
        <PillButton onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Add Guide"}</PillButton>
      </div>

      {showForm && (
        <div style={{ border: "1px solid #30363d", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          <textarea placeholder="Guide content (tips, item build, playstyle…)" value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ ...inputStyle, resize: "vertical" }} />
          <input placeholder="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} style={inputStyle} />
          <PillButton onClick={submit} disabled={!title.trim() || !body.trim()}>Post Guide</PillButton>
        </div>
      )}

      {loading && <LoadingPlaceholder />}
      {!loading && guides.length === 0 && <EmptyState message="No guides yet. Be the first to add one!" />}

      {guides.map((g) => (
        <div key={g.id} style={{ border: "1px solid #30363d", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{g.title}</span>
            <button onClick={() => del(g.id)} style={{ fontSize: 11, border: "none", background: "transparent", color: "#f85149", cursor: "pointer", opacity: 0.7 }}>Delete</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.4, marginBottom: 8 }}>by {g.author} · {new Date(g.created_at).toLocaleDateString()}</div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{g.body}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, marginBottom: 10, letterSpacing: "0.07em", textTransform: "uppercase", ...style }}>
      {children}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, opacity: 0.45 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: color ?? "#e6edf3" }}>{value}</span>
    </div>
  );
}

function LoadingPlaceholder() {
  return <div style={{ padding: 12, opacity: 0.4, fontSize: 13 }}>Loading…</div>;
}

function EmptyState({ message }: { message: string }) {
  return <div style={{ padding: "12px 0", opacity: 0.35, fontSize: 13 }}>{message}</div>;
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #30363d",
  borderRadius: 6,
  background: "#0d1117",
  color: "#e6edf3",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};
