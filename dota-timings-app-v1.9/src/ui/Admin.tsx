import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/store";
import type { Hero, PosEntry } from "@/store";
import LocalHeroImg from "./components/LocalHeroImg";
import { PillButton } from "@/ui/primitives";
import { useUniqueItems, useItemConstants } from "@/lib/api-hooks";
import { useQueryClient } from "@tanstack/react-query";

type PosMap = Record<number, PosEntry[]>;

const POS_LABELS = ["Carry", "Mid", "Off", "Soft", "Hard"];

// tier: 0=main  1=secondary  2=suboptimal  3=undesirable
const TIER_LABEL  = ["★ Main", "Secondary", "Suboptimal", "Undesirable"] as const;
const TIER_COLOR  = ["#3fb950", "#58a6ff", "#d29922", "#f85149"] as const;
const TIER_SYMBOL = ["★", "○", "△", "✕"] as const;

export default function Admin() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <SeedPanel />
      <BulkFetchPanel />
      <UniqueItemsEditor />
      <BulkPositionEditor />
    </div>
  );
}

// ─── Seed Panel ────────────────────────────────────────────────────────────────

function SeedPanel() {
  const apiBase = useStore((s) => s.apiBase);
  const setHeroPositions = useStore((s) => s.setHeroPositions);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seed = async (overwrite: boolean) => {
    if (overwrite && !confirm("This will delete all existing hero positions and replace with seed data. Continue?")) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await fetch(`${apiBase}/admin/seed/positions?overwrite=${overwrite}`, { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setStatus(`Done — ${j.inserted} of ${j.total} rows inserted${overwrite ? " (overwrite)" : " (merge)"}`);
      // Reload positions into the store — response is { positions: { [heroId]: PosEntry[] } }
      const { positions } = await fetch(`${apiBase}/heroes/positions`).then((r) => r.json());
      setHeroPositions(positions ?? {});
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Seed Data</div>
      <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 12 }}>
        Apply the bundled seed-positions.json (~65 heroes) to the database.
        <b> Merge</b> adds missing rows only. <b>Overwrite</b> clears all positions first.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => seed(false)}
          disabled={busy}
          style={{ padding: "5px 14px", background: "#238636", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
        >
          {busy ? "…" : "Merge seed"}
        </button>
        <button
          onClick={() => seed(true)}
          disabled={busy}
          style={{ padding: "5px 14px", background: "#da3633", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
        >
          {busy ? "…" : "Overwrite with seed"}
        </button>
        {status && <span style={{ fontSize: 12, color: status.startsWith("Error") ? "#f85149" : "#3fb950" }}>{status}</span>}
      </div>
    </div>
  );
}

// ─── Bulk Fetch Panel ──────────────────────────────────────────────────────────

type FetchStatus = "idle" | "running" | "done" | "error";

const BTN = {
  padding: "5px 14px", border: "none", borderRadius: 6,
  color: "#fff", cursor: "pointer", fontSize: 13,
} as const;

function BulkFetchPanel() {
  const apiBase = useStore((s) => s.apiBase);
  const qc = useQueryClient();

  const [status, setStatus] = useState<FetchStatus>("idle");
  const [prog, setProg] = useState({ done: 0, total: 0, failed: 0, skipped: 0 });
  const [log, setLog] = useState<{ text: string; kind: "ok" | "err" | "info" }[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const startedAt = useRef<number>(0);

  const pushLog = (text: string, kind: "ok" | "err" | "info" = "info") =>
    setLog((prev) => [{ text, kind }, ...prev].slice(0, 80));

  const start = (onlyMissing: boolean) => {
    esRef.current?.close();
    setStatus("running");
    setProg({ done: 0, total: 0, failed: 0, skipped: 0 });
    setLog([]);
    startedAt.current = Date.now();

    const es = new EventSource(
      `${apiBase}/admin/heroes/fetch-all-items?onlyMissing=${onlyMissing}`
    );
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "start") {
        setProg((p) => ({ ...p, total: msg.total, skipped: msg.skipped }));
        pushLog(
          `Starting: ${msg.total} heroes to fetch${msg.skipped ? `, ${msg.skipped} already have builds (skipped)` : ""}`,
          "info"
        );
      } else if (msg.type === "hero") {
        setProg((p) => ({ ...p, done: msg.done }));
        pushLog(`${msg.name}: ${msg.items.length ? msg.items.join(", ") : "(no items)"}`, "ok");
      } else if (msg.type === "skip") {
        setProg((p) => ({ ...p, done: msg.done }));
      } else if (msg.type === "fail") {
        setProg((p) => ({ ...p, done: msg.done, failed: p.failed + 1 }));
        pushLog(`${msg.name}: ${msg.error}`, "err");
      } else if (msg.type === "done") {
        setStatus("done");
        pushLog(
          `Complete — ${msg.fetched} fetched, ${msg.failed} failed, ${msg.skipped} skipped`,
          "info"
        );
        es.close();
        esRef.current = null;
        qc.invalidateQueries({ queryKey: ["items", "builds"] });
      } else if (msg.type === "fatal") {
        setStatus("error");
        pushLog(`Fatal: ${msg.error}`, "err");
        es.close();
        esRef.current = null;
      }
    };

    es.onerror = () => {
      if (status !== "done") {
        setStatus("error");
        pushLog("Stream disconnected", "err");
      }
      es.close();
      esRef.current = null;
    };
  };

  const stop = () => {
    esRef.current?.close();
    esRef.current = null;
    setStatus("idle");
    pushLog("Stopped by user", "info");
  };

  useEffect(() => () => { esRef.current?.close(); }, []);

  const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
  const elapsedSec = (Date.now() - startedAt.current) / 1000;
  const rate = prog.done > 1 ? prog.done / elapsedSec : 0; // need at least 2 samples for a stable rate
  const etaSec = rate > 0 ? Math.round((prog.total - prog.done) / rate) : null;

  const barColor =
    status === "error" ? "#f85149" : status === "done" ? "#3fb950" : "#58a6ff";

  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Bulk Item Fetch</div>
      <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 12 }}>
        Pulls generic item builds from OpenDota for all heroes (~130).{" "}
        <b>Fetch Missing</b> skips heroes that already have a build.
        Rate-limited to ~1 hero/sec — takes 2–3 minutes for a full run.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {status !== "running" ? (
          <>
            <button onClick={() => start(true)} style={{ ...BTN, background: "#238636" }}>
              Fetch Missing
            </button>
            <button onClick={() => start(false)} style={{ ...BTN, background: "#9e6a03" }}>
              Fetch All (overwrite)
            </button>
          </>
        ) : (
          <button onClick={stop} style={{ ...BTN, background: "#da3633" }}>
            Stop
          </button>
        )}

        {prog.total > 0 && (
          <span style={{ fontSize: 12, color: "#8b949e" }}>
            {prog.done} / {prog.total}
            {prog.failed > 0 && (
              <span style={{ color: "#f85149" }}> · {prog.failed} failed</span>
            )}
            {etaSec != null && status === "running" && (
              <span> · ~{etaSec}s left</span>
            )}
          </span>
        )}
      </div>

      {prog.total > 0 && (
        <div style={{ height: 5, background: "#21262d", borderRadius: 3, marginBottom: 10, overflow: "hidden" }}>
          <div
            style={{
              height: "100%", borderRadius: 3,
              background: barColor,
              width: `${pct}%`,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}

      {log.length > 0 && (
        <div style={{
          fontFamily: "monospace", fontSize: 11,
          maxHeight: 140, overflowY: "auto",
          background: "#0d1117", borderRadius: 4, padding: "6px 8px",
          display: "flex", flexDirection: "column", gap: 1,
        }}>
          {log.map((l, i) => (
            <div key={i} style={{
              color: l.kind === "err" ? "#f85149" : l.kind === "ok" ? "#3fb950" : "#8b949e",
            }}>
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Unique Items Editor ───────────────────────────────────────────────────────

function UniqueItemsEditor() {
  const apiBase = useStore((s) => s.apiBase);
  const qc = useQueryClient();
  const { data: uniqueItems } = useUniqueItems();
  const { data: itemMap } = useItemConstants();

  const [local, setLocal] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uniqueItems) setLocal(uniqueItems);
  }, [uniqueItems]);

  const dirty = JSON.stringify(local) !== JSON.stringify(uniqueItems ?? []);

  const add = () => {
    const v = newItem.trim().toLowerCase().replace(/\s+/g, "_");
    if (v && !local.includes(v)) setLocal((p) => [...p, v]);
    setNewItem("");
  };

  const remove = (name: string) => setLocal((p) => p.filter((x) => x !== name));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/items/unique`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (!r.ok) throw new Error(await r.text());
      await qc.invalidateQueries({ queryKey: ["items", "unique"] });
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Unique Items</h3>
        <span style={{ fontSize: 12, opacity: 0.4 }}>Items that should only be built once per team</span>
        {dirty && (
          <>
            <PillButton onClick={() => setLocal(uniqueItems ?? [])} style={{ marginLeft: "auto", borderColor: "#30363d", color: "#8b949e" }}>Discard</PillButton>
            <PillButton onClick={save} disabled={saving} style={{ borderColor: "#3fb950", color: "#3fb950" }}>
              {saving ? "Saving…" : "Save"}
            </PillButton>
          </>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: "#f85149", marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {local.map((name) => {
          const it = itemMap?.[name];
          return (
            <div key={name} style={{
              display: "flex", alignItems: "center", gap: 5,
              border: "1px solid #30363d", borderRadius: 6, padding: "4px 8px",
              background: "#0d1117", fontSize: 12,
            }}>
              {it?.img && <img src={it.img} alt="" style={{ width: 20, height: 20, borderRadius: 2, objectFit: "contain" }} />}
              <span>{it?.dname ?? name}</span>
              <button onClick={() => remove(name)}
                style={{ background: "none", border: "none", color: "#f85149", cursor: "pointer", padding: "0 2px", fontSize: 13 }}>×</button>
            </div>
          );
        })}
        {local.length === 0 && <span style={{ fontSize: 12, opacity: 0.35 }}>No items configured.</span>}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="item internal name (e.g. radiance, pipe)"
          list="admin-item-datalist"
          style={{ flex: 1, padding: "5px 8px", border: "1px solid #30363d", borderRadius: 6, background: "#0d1117", color: "#e6edf3", fontSize: 12 }}
        />
        <datalist id="admin-item-datalist">
          {itemMap && Object.keys(itemMap).map((k) => <option key={k} value={k}>{itemMap[k].dname}</option>)}
        </datalist>
        <PillButton onClick={add} style={{ borderColor: "#58a6ff", color: "#58a6ff" }}>Add</PillButton>
      </div>
    </div>
  );
}

function BulkPositionEditor() {
  const heroes = useStore((s) => s.heroes);
  const apiBase = useStore((s) => s.apiBase);
  const setHeroPositions = useStore((s: any) => s.setHeroPositions);
  const [saved, setSaved] = useState<PosMap>({});
  const [local, setLocal] = useState<PosMap>({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/heroes/positions`);
      const j = await r.json();
      const m: PosMap = j.positions ?? {};
      setSaved(m);
      setLocal(JSON.parse(JSON.stringify(m)));
      setLoaded(true);
    } catch (e: any) {
      setSaveError("Failed to load positions: " + e.message);
    }
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const heroPositions = (heroId: number): PosEntry[] => local[heroId] ?? [];

  /**
   * Click cycles tier: unassigned → main(0) → secondary(1) → suboptimal(2) → undesirable(3) → remove.
   * Shift+click removes immediately.
   */
  const toggle = (heroId: number, pos: number, shiftKey = false) => {
    const current = heroPositions(heroId);
    const idx = current.findIndex((e) => e.position === pos);
    let next: PosEntry[];

    if (idx === -1) {
      // New position — always start at Main (tier 0)
      next = [...current, { position: pos, tier: 0 }].sort((a, b) => a.position - b.position);
    } else if (shiftKey) {
      next = current.filter((_, i) => i !== idx);
    } else {
      // Cycle: 0 → 1 → 2 → 3 → 0 (wrap back to Main, never auto-remove)
      // Guard against NaN/null/undefined from stale data
      const curTier = Number.isFinite(current[idx].tier) ? current[idx].tier : 0;
      const nextTier = curTier >= 3 ? 0 : curTier + 1;
      next = current.map((e, i) => i === idx ? { ...e, tier: nextTier } : e);
    }

    setLocal((prev) => ({ ...prev, [heroId]: next }));
    setSaveError(null);
  };

  const isDirty = (heroId: number): boolean =>
    JSON.stringify(local[heroId] ?? []) !== JSON.stringify(saved[heroId] ?? []);

  const dirtyHeroes = heroes.filter((h) => isDirty(h.id));

  const saveAll = async () => {
    setSaving(true);
    setSaveError(null);
    const results = await Promise.allSettled(
      dirtyHeroes.map((h) =>
        fetch(`${apiBase}/heroes/${h.id}/positions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(local[h.id] ?? []),
        })
      )
    );
    const newSaved = { ...saved };
    let failed = 0;
    dirtyHeroes.forEach((h, i) => {
      if (results[i].status === "fulfilled") {
        newSaved[h.id] = JSON.parse(JSON.stringify(local[h.id] ?? []));
      } else {
        failed++;
      }
    });
    setSaved(newSaved);
    setHeroPositions(newSaved);
    if (failed > 0) setSaveError(`${failed} hero(es) failed to save`);
    setSaving(false);
  };

  const resetAll = () => {
    setLocal(JSON.parse(JSON.stringify(saved)));
    setSaveError(null);
  };

  const filtered = q.trim()
    ? heroes.filter((h) => h.localized_name.toLowerCase().includes(q.toLowerCase()))
    : heroes;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Bulk Position Editor</h3>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter heroes…"
          style={{ padding: "5px 9px", border: "1px solid #30363d", borderRadius: 6, background: "#0d1117", color: "#e6edf3", fontSize: 13, width: 180 }}
        />
        <span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.5 }}>
          {dirtyHeroes.length > 0 ? `${dirtyHeroes.length} unsaved` : loaded ? "All saved" : ""}
        </span>
        {dirtyHeroes.length > 0 && (
          <PillButton onClick={resetAll} style={{ borderColor: "#30363d", color: "#8b949e" }}>Discard</PillButton>
        )}
        <PillButton
          onClick={saveAll}
          disabled={saving || dirtyHeroes.length === 0}
          style={{ borderColor: dirtyHeroes.length > 0 ? "#3fb950" : "#30363d", color: dirtyHeroes.length > 0 ? "#3fb950" : "#555" }}
        >
          {saving ? "Saving…" : dirtyHeroes.length > 0 ? `Save (${dirtyHeroes.length})` : "Save"}
        </PillButton>
      </div>

      {saveError && (
        <div style={{ marginBottom: 10, fontSize: 13, color: "#f85149", padding: "6px 10px", border: "1px solid #f8514933", borderRadius: 6 }}>
          {saveError}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        {TIER_LABEL.map((l, t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, opacity: 0.65 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, border: `2px solid ${TIER_COLOR[t]}`, display: "inline-block" }} />
            {TIER_SYMBOL[t]} {l}
          </div>
        ))}
        <div style={{ fontSize: 11, opacity: 0.35, alignSelf: "center" }}>
          · click empty to add · click assigned to cycle tier (wraps back to ★) · shift+click to remove
        </div>
      </div>

      <div style={{ border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "32px 1fr repeat(5, 44px)", padding: "6px 10px", background: "#0d1117", borderBottom: "1px solid #30363d", alignItems: "end" }}>
          <span />
          <span style={{ fontSize: 11, opacity: 0.45, letterSpacing: "0.06em" }}>HERO</span>
          {POS_LABELS.map((l, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.8 }}>{i + 1}</div>
              <div style={{ fontSize: 10, opacity: 0.4 }}>{l}</div>
            </div>
          ))}
        </div>

        {!loaded && <div style={{ padding: 16, opacity: 0.4, fontSize: 13 }}>Loading…</div>}
        {loaded && filtered.length === 0 && <div style={{ padding: 16, opacity: 0.35, fontSize: 13 }}>No heroes match.</div>}

        {loaded && filtered.map((hero) => (
          <HeroRow
            key={hero.id}
            hero={hero}
            positions={heroPositions(hero.id)}
            dirty={isDirty(hero.id)}
            onToggle={(pos, shiftKey) => toggle(hero.id, pos, shiftKey)}
          />
        ))}
      </div>
    </div>
  );
}

function HeroRow({
  hero, positions, dirty, onToggle,
}: {
  hero: Hero;
  positions: PosEntry[];
  dirty: boolean;
  onToggle: (pos: number, shiftKey: boolean) => void;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "32px 1fr repeat(5, 44px)",
      padding: "3px 10px",
      borderBottom: "1px solid #21262d",
      background: dirty ? "#161e2e" : "transparent",
      alignItems: "center",
      minHeight: 36,
    }}>
      <LocalHeroImg hero={hero} kind="icon" style={{ width: 28, height: 28, borderRadius: 4, display: "block" }} />
      <span style={{ fontSize: 13, paddingLeft: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {hero.localized_name}
        {dirty && <span style={{ marginLeft: 6, fontSize: 10, color: "#d29922", opacity: 0.8 }}>●</span>}
      </span>
      {[1, 2, 3, 4, 5].map((pos) => {
        const entry = positions.find((e) => e.position === pos);
        return (
          <div key={pos} style={{ display: "flex", justifyContent: "center" }}>
            <TierButton pos={pos} tier={entry?.tier} onClick={(e) => onToggle(pos, e.shiftKey)} />
          </div>
        );
      })}
    </div>
  );
}

function TierButton({
  pos, tier, onClick,
}: {
  pos: number;
  tier: number | undefined;
  onClick: (e: React.MouseEvent) => void;
}) {
  const assigned = tier !== undefined;
  const borderColor = assigned ? TIER_COLOR[tier!] : "#2d333b";
  const bg          = assigned ? `${TIER_COLOR[tier!]}18` : "transparent";
  const color       = assigned ? TIER_COLOR[tier!] : "#3a3f48";
  const symbol      = assigned ? TIER_SYMBOL[tier!] : String(pos);

  const safeTier = assigned && Number.isFinite(tier) ? tier! : 0;
  const nextTierLabel = !assigned
    ? `Add pos ${pos} as Main`
    : safeTier >= 3
    ? `Undesirable → wrap back to Main`
    : `${TIER_LABEL[safeTier]} → ${TIER_LABEL[safeTier + 1]}`;

  return (
    <button
      onClick={onClick}
      title={`${nextTierLabel}  (shift+click to remove)`}
      style={{
        width: 30, height: 30, borderRadius: 6,
        border: `2px solid ${borderColor}`,
        background: bg, color, cursor: "pointer",
        fontSize: assigned && tier === 0 ? 14 : 13,
        fontWeight: assigned && tier === 0 ? 700 : 500,
        transition: "border-color 0.1s, background 0.1s",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {symbol}
    </button>
  );
}
