import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { z } from "zod";
import pino from "pino";
import { syncOpenDotaAndBuildMatrices } from "./src/opendota-sync.mjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { loadMatrixSnapshot } from "./src/matrix-loader.mjs";
import {
  getDb,
  getPositions,
  setPositions,
  getGuides,
  addGuide,
  deleteGuide,
  dbStats,
} from "./src/db.mjs";

let __MATRIX_BUNDLE = null; // in-memory copy for fast reads

function etagFor(obj) {
  const json = JSON.stringify(obj);
  return `"W/${crypto.createHash("sha1").update(json).digest("base64")}"`;
}

function getMatrixBundle() {
  return __MATRIX_BUNDLE || app.locals?.matrixTopK || null;
}

// ---------- Minimal in‑memory cache helper ----------
const __CACHE = (global.__CACHE ||= new Map());
// Weight for matrix-driven context in advisor scoring
const CTX_WEIGHT = Number(process.env.CTX_WEIGHT ?? "0.25");

function memo(key, ms, fn) {
  const hit = __CACHE.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < ms) return hit.val;
  const val = fn();
  __CACHE.set(key, { ts: now, val });
  return val;
}

async function cached(key, fn, ttlMs = 60_000) {
  const hit = __CACHE.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < ttlMs) return hit.val;
  const val = await fn();
  __CACHE.set(key, { ts: now, val });
  return val;
}

// ----- Items Library (effects -> axes) & Aura classes -----
const ITEMS = {
  // ── Mobility / initiation
  blink:          { label: "Blink",     effects: { pickoff: +18, fight: +10 },              class: "mobility" },
  force_staff:    { label: "Force",     effects: { pickoff: +8,  defense: +6 },              class: "utility" },
  shadow_blade:   { label: "S-Blade",   effects: { pickoff: +12, fight: +8 },                class: "mobility" },
  silver_edge:    { label: "S-Edge",    effects: { pickoff: +14, fight: +10 },               class: "mobility" },
  // ── Core BKB / resistance
  bkb:            { label: "BKB",       effects: { fight: +15, push: +6 },                  class: "core" },
  blade_mail:     { label: "BladeMail", effects: { fight: +12, defense: +8 },               class: "core" },
  lotus_orb:      { label: "Lotus",     effects: { defense: +15, fight: +8 },               class: "utility" },
  // ── Economy / boots
  arcane_boots:   { label: "Arcanes",   effects: { sustain: +6 },                           class: "economy" },
  phase_boots:    { label: "Phase",     effects: { fight: +8 },                             class: "economy" },
  power_treads:   { label: "Treads",    effects: { fight: +6, scale: +4 },                  class: "economy" },
  // ── Auras (diminishing returns stacked)
  mekansm:        { label: "Mek",       effects: { sustain: +10, defense: +8 },             class: "aura" },
  greaves:        { label: "Greaves",   effects: { sustain: +20, defense: +15, push: +6 }, class: "aura" },
  pipe:           { label: "Pipe",      effects: { defense: +18 },                         class: "aura_magic" },
  crimson_guard:  { label: "Crimson",   effects: { defense: +14 },                         class: "aura_physical" },
  vladmir:        { label: "Vlad",      effects: { push: +10, rosh: +6 },                  class: "aura" },
  assault:        { label: "AC",        effects: { tower_damage: +18, push: +10, rosh: +8, defense: +6 }, class: "aura" },
  solar_crest:    { label: "Solar",     effects: { rosh: +8, fight: +6 },                  class: "aura" },
  ancient_janggo: { label: "Drum",      effects: { fight: +6, push: +6 },                  class: "utility" },
  // ── Anti-heal / burst
  shivas_guard:   { label: "Shiva",     effects: { defense: +12, fight: +8, anti_heal: +1 }, class: "core" },
  // ── Farming / push
  radiance:       { label: "Radiance",  effects: { scale: +8 },                            class: "core" },
  battle_fury:    { label: "BFury",     effects: { push: +12, scale: +6 },                 class: "core" },
  // ── Carry scaling
  manta_style:    { label: "Manta",     effects: { fight: +12, scale: +8 },                class: "core" },
  butterfly:      { label: "Butterfly", effects: { fight: +15, scale: +10 },               class: "core" },
  skull_basher:   { label: "Basher",    effects: { fight: +10, pickoff: +6 },              class: "core" },
  abyssal_blade:  { label: "Abyssal",   effects: { fight: +12, pickoff: +10 },             class: "core" },
  diffusal_blade: { label: "Diffusal",  effects: { fight: +10, pickoff: +8 },              class: "core" },
  // ── Caster / utility
  aether_lens:    { label: "A-Lens",    effects: { pickoff: +8, fight: +6 },               class: "utility" },
  cyclone:        { label: "Eul's",     effects: { pickoff: +10, fight: +6 },              class: "utility" },
  glimmer_cape:   { label: "Glimmer",   effects: { defense: +12, pickoff: +5 },            class: "utility" },
  rod_of_atos:    { label: "Atos",      effects: { pickoff: +12, fight: +6 },              class: "utility" },
  orchid_malevolence: { label: "Orchid", effects: { pickoff: +10, fight: +6 },             class: "core" },
  bloodthorn:     { label: "Bloodthorn",effects: { pickoff: +12, fight: +8 },              class: "core" },
  dragon_lance:   { label: "D-Lance",   effects: { fight: +8, scale: +5 },                 class: "utility" },
  mask_of_madness:{ label: "MoM",       effects: { fight: +10, scale: +6 },                class: "core" },
  // ── Late game / durability
  heart_of_tarrasque: { label: "Heart", effects: { scale: +12, defense: +8 },             class: "late" },
  eye_of_skadi:   { label: "Skadi",     effects: { fight: +10, scale: +8 },                class: "late" },
  satanic:        { label: "Satanic",   effects: { scale: +10, fight: +8 },                class: "late" },
  // ── Hero-specific upgrades
  aghanim_scepter:{ label: "Aghs",      effects: { fight: +8, pickoff: +8 },               class: "hero_specific" },
  aghanim_shard:  { label: "Shard",     effects: { pickoff: +6, fight: +4 },               class: "hero_specific" },
};
// auras count once per team for most value (diminishing after first)
const AURA_CLASSES = new Set(["aura", "aura_magic", "aura_physical"]);

// Maps OpenDota item names → our ITEMS catalog keys
const ITEM_KEY_MAP = {
  // ── Boots / economy
  arcane_boots:            "arcane_boots",
  phase_boots:             "phase_boots",
  power_treads:            "power_treads",
  // ── Mobility / pickoff
  blink:                   "blink",
  force_staff:             "force_staff",
  shadow_blade:            "shadow_blade",
  silver_edge:             "silver_edge",
  // ── Core resistance
  black_king_bar:          "bkb",
  blade_mail:              "blade_mail",
  lotus_orb:               "lotus_orb",
  // ── Aura / support
  mekansm:                 "mekansm",
  guardian_greaves:        "greaves",
  pipe:                    "pipe",
  crimson_guard:           "crimson_guard",
  vladmir:                 "vladmir",
  assault:                 "assault",
  shivas_guard:            "shivas_guard",
  solar_crest:             "solar_crest",
  ancient_janggo:          "ancient_janggo",
  // ── Core damage / carry
  radiance:                "radiance",
  bfury:                   "battle_fury",
  manta:                   "manta_style",
  butterfly:               "butterfly",
  skull_basher:            "skull_basher",
  abyssal_blade:           "abyssal_blade",
  diffusal_blade:          "diffusal_blade",
  mask_of_madness:         "mask_of_madness",
  dragon_lance:            "dragon_lance",
  orchid_malevolence:      "orchid_malevolence",
  bloodthorn:              "bloodthorn",
  // ── Caster / support utility
  aether_lens:             "aether_lens",
  cyclone:                 "cyclone",
  euls_scepter_of_divinity:"cyclone",
  glimmer_cape:            "glimmer_cape",
  rod_of_atos:             "rod_of_atos",
  // ── Late game
  heart_of_tarrasque:      "heart_of_tarrasque",
  eye_of_skadi:            "eye_of_skadi",
  satanic:                 "satanic",
  // ── Hero-specific
  ultimate_scepter:        "aghanim_scepter",
  aghanims_shard:          "aghanim_shard",
};
// Reverse: catalog key → first matching OD name (for phase lookup)
const CATALOG_TO_OD = Object.fromEntries(
  Object.entries(ITEM_KEY_MAP).map(([od, cat]) => [cat, od])
);

// Per-team tag conflict rules: applying penalty when count ≥ max
const TAG_CONFLICTS = {
  radiance:     { max: 1, penalty: 3.0, label: "Radiance overload" },
  global:       { max: 2, penalty: 2.0, label: "Global overload" },
  flash_farmer: { max: 2, penalty: 1.5, label: "Farm conflict" },
  refresher:    { max: 1, penalty: 2.5, label: "Refresher overload" },
};

function estItemMinute(itemKey, roleHint, heroId) {
  // Phase-based estimate from stored build data (most accurate)
  if (heroId != null) {
    const phases = getHeroItems()[String(heroId)]?.phases;
    if (phases) {
      const odName = CATALOG_TO_OD[itemKey] || itemKey;
      if ((phases.early || []).includes(odName)) return roleHint <= 2 ? 10 : 12;
      if ((phases.mid   || []).includes(odName)) return 22;
      if ((phases.late  || []).includes(odName)) return 32;
    }
  }
  // Hardcoded fallback table
  const base = {
    arcane_boots: 8,  phase_boots: 9,  power_treads: 10,
    vladmir: 12,      mekansm: 14,     aether_lens: 14,
    blink: roleHint === 3 || roleHint === 2 ? 12 : 14,
    glimmer_cape: 15, force_staff: 16, ancient_janggo: 12,
    solar_crest: 16,  rod_of_atos: 16, lotus_orb: 18,
    pipe: 17,         crimson_guard: 18,
    greaves: roleHint >= 4 ? 17 : 19,
    bkb: roleHint <= 2 ? 18 : 20,
    blade_mail: 18,   mask_of_madness: 16, dragon_lance: 14,
    battle_fury: 18,  diffusal_blade: 18,  skull_basher: 20,
    radiance: 20,     shadow_blade: 20,    cyclone: 18,
    assault: 20,      shivas_guard: 22,    orchid_malevolence: 20,
    bloodthorn: 26,   silver_edge: 26,     abyssal_blade: 28,
    manta_style: 22,  butterfly: 28,       heart_of_tarrasque: 32,
    eye_of_skadi: 30, satanic: 30,
    aghanim_scepter: 20, aghanim_shard: 15,
  };
  return base[itemKey] ?? 18;
}

function applyItemEffectsToAxes(axes, effects, weight = 1) {
  for (const k of Object.keys(effects)) {
    axes[k] = (axes[k] || 0) + effects[k] * weight;
  }
}

function auraSaturationPenalty(currentAurasCount) {
  // 1st aura full, 2nd at 40%, 3rd at 15%, others 0
  return [1, 0.4, 0.15, 0][Math.min(currentAurasCount, 3)] ?? 0;
}

// ---------- Fetch constants (heroes) + presets safely ----------
async function fetchHeroesLite() {
  return cached(
    "heroes-lite",
    async () => {
      const r = await fetch("https://api.opendota.com/api/constants/heroes");
      const j = await r.json();
      return Object.values(j).map((h) => ({
        id: h.id,
        name: h.localized_name,
        icon: "https://cdn.cloudflare.steamstatic.com" + h.icon,
        roles: h.roles || [],
      }));
    },
    10 * 60_000
  );
}

async function fetchPresets(localBase = "http://localhost:8787") {
  return cached(
    "presets-min",
    async () => {
      try {
        const r = await fetch(`${localBase}/presets`);
        if (!r.ok) throw new Error("presets not ok");
        const j = await r.json();
        return j.profilesByHero || {};
      } catch {
        // fallback: empty (we’ll synthesize defaults)
        return {};
      }
    },
    60_000
  );
}

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: true, // or ["http://localhost:5173"]
    credentials: false,
  })
);
const SNAPSHOT_FILE =
  process.env.MATRIX_SNAPSHOT || "data/snapshots/matrix-topk.json";
await loadMatrixSnapshot(app);

const ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// app.use(
//   cors({
//     origin: (o, cb) => cb(null, !ORIGINS.length || ORIGINS.includes(o) || !o),
//   })
// );

const PORT = process.env.PORT || 8787;
const cache = new Map();
const TTL = 1000 * 60 * 30;

// async function cached(key, fn) {
//   const hit = cache.get(key);
//   if (hit && Date.now() - hit.t < TTL) return hit.v;
//   const v = await fn();
//   cache.set(key, { t: Date.now(), v });
//   return v;
// }
const norm = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();

app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get("/constants/heroes", async (req, res) => {
  try {
    const heroes = await cached("heroes", async () => {
      const r = await fetch("https://api.opendota.com/api/constants/heroes");
      const j = await r.json();
      return Object.values(j).map((h) => ({
        id: h.id,
        name: h.name,
        localized_name: h.localized_name,
        roles: h.roles,
        img: "https://cdn.cloudflare.steamstatic.com" + h.img,
        icon: "https://cdn.cloudflare.steamstatic.com" + h.icon,
        // stats
        primary_attr: h.primary_attr ?? null,
        attack_type: h.attack_type ?? null,
        base_str: h.base_str ?? null,
        base_agi: h.base_agi ?? null,
        base_int: h.base_int ?? null,
        str_gain: h.str_gain ?? null,
        agi_gain: h.agi_gain ?? null,
        int_gain: h.int_gain ?? null,
        attack_range: h.attack_range ?? null,
        move_speed: h.move_speed ?? null,
        attack_rate: h.attack_rate ?? null,
        base_armor: h.base_armor ?? null,
        base_health_regen: h.base_health_regen ?? null,
        base_mana_regen: h.base_mana_regen ?? null,
        cm_enabled: h.cm_enabled ?? true,
      }));
    });
    res.json({ heroes });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get("/constants/hero_lore", async (req, res) => {
  try {
    const lore = await cached("hero_lore", async () => {
      const [heroesR, loreR] = await Promise.all([
        fetch("https://api.opendota.com/api/constants/heroes"),
        fetch("https://api.opendota.com/api/constants/hero_lore"),
      ]);
      const heroesJ = await heroesR.json();
      const loreJ = await loreR.json(); // { npc_dota_hero_X: "lore text" }
      // remap from internal name to id
      const out = {};
      for (const h of Object.values(heroesJ)) {
        const text = loreJ[h.name];
        if (text) out[h.id] = text;
      }
      return out;
    }, 24 * 60 * 60 * 1000); // 24h TTL
    res.json(lore);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Hero meta scores derived from OpenDota heroStats (pro_pick, pro_win, bracket picks)
// Returns Record<heroId, { score, pro_pick, pro_win, pub_pick_8, pub_win_8 }>
app.get("/constants/hero_meta", async (req, res) => {
  try {
    const meta = await cached("hero_meta", async () => {
      const r = await fetch("https://api.opendota.com/api/heroStats");
      const stats = await r.json();
      const out = {};
      for (const h of stats) {
        const proPick  = h.pro_pick  ?? 0;
        const proWin   = h.pro_win   ?? 0;
        const pub8Pick = (h["8_pick"] ?? 0) + (h["7_pick"] ?? 0); // immortal + divine
        const pub8Win  = (h["8_win"]  ?? 0) + (h["7_win"]  ?? 0);
        // Combine: pro counts 5×, high-bracket pub counts 1× (normalized per 100 games)
        const proScore = proPick > 5  ? (proWin  / proPick)  * Math.sqrt(proPick)  * 5  : 0;
        const pubScore = pub8Pick > 50 ? (pub8Win / pub8Pick) * Math.sqrt(pub8Pick / 50) : 0;
        out[h.id] = {
          score:       Math.round((proScore + pubScore) * 10) / 10,
          pro_pick:    proPick,
          pro_win:     proWin,
          pub_pick_hi: pub8Pick,
          pub_win_hi:  pub8Win,
        };
      }
      return out;
    }, 24 * 60 * 60 * 1000);
    res.json(meta);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/constants/items", async (req, res) => {
  try {
    const items = await cached("items", async () => {
      const r = await fetch("https://api.opendota.com/api/constants/items");
      const j = await r.json();
      return Object.entries(j)
        .filter(([, i]) => i.dname)
        .map(([name, i]) => ({
          name,  // internal name e.g. "power_treads"
          id: i.id,
          dname: i.dname,
          img: i.img ? "https://cdn.cloudflare.steamstatic.com" + i.img : null,
          cost: i.cost ?? null,
          components: i.components || [],
          created: !!i.created,
        }));
    });
    res.json({ items });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// Standard Dota 2 CM sequence (12 bans, 10 picks, 5 per team).
// Phase 1: 6 bans (3+3), 4 picks (2+2)
// Phase 2: 4 bans (2+2), 4 picks (2+2)
// Phase 3: 2 bans (1+1), 2 picks (1+1)
app.get("/cm/sequence", (req, res) => {
  const firstPick = req.query.firstPick === "team2" ? "team2" : "team1";
  const fp = firstPick,
    sp = firstPick === "team1" ? "team2" : "team1";
  const steps = [];

  // Ban Phase 1: 6 bans, 3 per team (sp gets first ban)
  for (const t of [sp, fp, sp, fp, sp, fp]) steps.push({ type: "ban", team: t });

  // Pick Phase 1: fp-sp-sp-fp (2 each)
  for (const t of [fp, sp, sp, fp]) steps.push({ type: "pick", team: t });

  // Ban Phase 2: fp-sp-fp-sp (2 each)
  for (const t of [fp, sp, fp, sp]) steps.push({ type: "ban", team: t });

  // Pick Phase 2: sp-fp-fp-sp (2 each)
  for (const t of [sp, fp, fp, sp]) steps.push({ type: "pick", team: t });

  // Ban Phase 3: fp-sp (1 each)
  for (const t of [fp, sp]) steps.push({ type: "ban", team: t });

  // Pick Phase 3: fp-sp (1 each)
  for (const t of [fp, sp]) steps.push({ type: "pick", team: t });

  res.json({ firstPick, steps });
});

// helper: curve value at minute
function valAt(arr, m) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  if (m <= 0) return arr[0];
  const idx = Math.min(arr.length - 2, Math.floor(m / 10));
  const a = arr[idx],
    b = arr[idx + 1];
  const t = Math.max(0, Math.min(1, (m - idx * 10) / 10));
  return Math.round(a + (b - a) * t);
}
function defaultCurve() {
  // conservative fallback
  return {
    fight: [10, 25, 45, 60, 70, 75],
    pickoff: [10, 25, 45, 60, 70, 75],
    push: [10, 20, 40, 55, 65, 75],
    sustain: [5, 15, 30, 45, 60, 70],
    defense: [10, 25, 40, 55, 70, 80],
    rosh: [5, 10, 20, 35, 50, 60],
    scale: [10, 20, 35, 55, 75, 90],
  };
}

function series(team) {
  const out = { push: {}, pickoff: {}, fight: {}, scale: {}, sustain: {} };
  for (let m = 5; m <= 40; m += 5) {
    const t = teamAxesAt(team, m);
    out.push[m]    = t.push;
    out.pickoff[m] = t.pickoff;
    out.fight[m]   = t.fight;
    out.scale[m]   = t.scale;
    out.sustain[m] = t.sustain;
  }
  return out;
}

// function valAt(arr, m) {
//   if (!Array.isArray(arr) || !arr.length) return 0;
//   if (m <= 0) return arr[0];
//   const idx = Math.min(arr.length - 2, Math.floor(m / 10));
//   const a = arr[idx],
//     b = arr[idx + 1];
//   const t = Math.max(0, Math.min(1, (m - idx * 10) / 10));
//   return Math.round(a + (b - a) * t);
// }

function teamAxesAt(team, minute) {
  const axes = ["fight", "pickoff", "push", "sustain", "defense", "rosh", "scale"];
  const heroTimings = getHeroTimings();
  const sums = {};
  for (const a of axes) {
    let s = 0;
    for (const p of team || []) {
      let curve;
      if (p?.profile?.curve) {
        curve = p.profile.curve;
      } else if (p?.hero_id && heroTimings[String(p.hero_id)]) {
        curve = heroTimingsToCurve(heroTimings[String(p.hero_id)], p.roles ?? []);
      } else {
        curve = defaultCurve();
      }
      s += valAt(curve[a], minute);
    }
    sums[a] = Math.round(s);
  }
  return sums;
}

// function defaultTags(roles = []) {
//   const s = new Set();
//   if (roles?.includes("Carry")) {
//     s.add("scale").add("physical_damage").add("tower_damage");
//   }
//   if (roles?.includes("Nuker")) {
//     s.add("magic_burst").add("pickoff");
//   }
//   if (roles?.includes("Initiator")) {
//     s.add("teamfight").add("stun").add("initiator");
//   }
//   if (roles?.includes("Durable")) {
//     s.add("durable").add("defense");
//   }
//   if (roles?.includes("Support")) {
//     s.add("save").add("sustain_heals");
//   }
//   if (roles?.includes("Disabler")) {
//     s.add("stun").add("silence");
//   }
//   if (roles?.includes("Escape")) {
//     s.add("mobility");
//   }
//   return [...s];
// }
function defaultTags(roles = []) {
  const r = new Set(roles);
  const out = [];
  if (r.has("Carry")) out.push("core_bkb", "scale", "tower_damage");
  if (r.has("Support")) out.push("save", "vision", "waveclear");
  if (r.has("Initiator")) out.push("initiator", "stun");
  if (r.has("Durable")) out.push("aura_carrier");
  return out;
}
function blend(a, b, w) {
  return a.map((v, i) => Math.round(v * (1 - w) + b[i] * w));
}

// Role-aware fallback curves. Used when hero-timings.json has no entry for this hero.
function defaultCurveByRole(roles = []) {
  const base = {
    fight:   [10, 25, 45, 60, 70, 75],
    pickoff: [10, 25, 45, 60, 70, 75],
    push:    [10, 20, 40, 55, 65, 75],
    sustain: [5,  15, 30, 45, 60, 70],
    defense: [10, 25, 40, 55, 70, 80],
    rosh:    [5,  10, 20, 35, 50, 60],
    scale:   [10, 20, 35, 55, 75, 90],
  };
  const isCarry = roles.includes("Carry");
  const isMid   = roles.includes("Nuker") || roles.includes("Escape");
  const isOff   = roles.includes("Initiator") || roles.includes("Durable");
  const isSupp  = roles.includes("Support") || roles.includes("Disabler");
  if (isCarry) {
    base.fight = blend(base.fight, [5,  15, 35, 65, 80, 90], 0.6);
    base.push  = blend(base.push,  [5,  15, 30, 50, 70, 85], 0.5);
    base.scale = blend(base.scale, [10, 20, 45, 75, 95, 100], 0.7);
  }
  if (isMid) {
    base.fight   = blend(base.fight,   [15, 45, 70, 75, 80, 85], 0.7);
    base.pickoff = blend(base.pickoff, [20, 50, 75, 80, 85, 90], 0.7);
  }
  if (isOff) {
    base.fight   = blend(base.fight,   [20, 45, 65, 75, 80, 85], 0.6);
    base.defense = blend(base.defense, [20, 40, 60, 75, 85, 90], 0.6);
    base.push    = blend(base.push,    [10, 25, 45, 60, 75, 85], 0.5);
    base.rosh    = blend(base.rosh,    [5,  10, 25, 45, 55, 65], 0.4);
  }
  if (isSupp) {
    base.fight   = blend(base.fight,   [25, 55, 65, 60, 55, 50], 0.7);
    base.sustain = blend(base.sustain, [20, 40, 60, 70, 75, 80], 0.7);
    base.defense = blend(base.defense, [20, 40, 60, 70, 75, 80], 0.6);
  }
  return base;
}

// ── Hero timings ────────────────────────────────────────────────────────────
// hero-timings.json stores 8 axes at 5 timepoints [10,15,20,25,30] minutes.
// Axes: teamfight, pickoff, push, split, objective, farm, early_end, late_scale
// The advisor uses 6-element arrays at [0,10,20,30,40,50] minutes.

const HERO_TIMINGS_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  "data/hero-timings.json"
);

let __heroTimings = null;
function getHeroTimings() {
  if (!__heroTimings) {
    try { __heroTimings = JSON.parse(fs.readFileSync(HERO_TIMINGS_PATH, "utf8")); }
    catch { __heroTimings = {}; }
  }
  return __heroTimings;
}

// ─── Hero items & gameplay tags (lazy-loaded, cached) ────────────────────────
const _DATA_ROOT = path.dirname(HERO_TIMINGS_PATH);
const HERO_TAGS_PATH = path.join(_DATA_ROOT, "hero-tags.json");

let __heroItems = null;
function bustHeroItemsCache() { __heroItems = null; } // eslint-disable-line no-unused-vars
function getHeroItems() {
  if (!__heroItems) {
    try { __heroItems = JSON.parse(fs.readFileSync(path.join(_DATA_ROOT, "hero-items.json"), "utf8")); }
    catch { __heroItems = {}; }
  }
  return __heroItems;
}

let __heroTagsCurated = null;
function getHeroTagsCurated() {
  if (!__heroTagsCurated) {
    try { __heroTagsCurated = JSON.parse(fs.readFileSync(HERO_TAGS_PATH, "utf8")); }
    catch { __heroTagsCurated = {}; }
  }
  return __heroTagsCurated;
}

/**
 * Compute all gameplay tags for a hero: curated special tags + auto-derived
 * from build data (radiance/refresher) and OpenDota roles (physical/magical).
 */
function computeHeroTags(heroId, heroRoles = [], heroItemsBuild = []) {
  const curated = getHeroTagsCurated()[String(heroId)] ?? [];
  const auto = [];
  // Approximate damage type from roles
  const isCarry = heroRoles.includes("Carry");
  const isNuker  = heroRoles.includes("Nuker");
  if (isCarry && !isNuker) auto.push("physical");
  else if (isNuker && !isCarry) auto.push("magical");
  // Derive item tags from actual OpenDota build data
  const top10 = heroItemsBuild.slice(0, 10);
  if (top10.includes("radiance")  && !curated.includes("radiance"))  auto.push("radiance");
  if (top10.includes("refresher") && !curated.includes("refresher")) auto.push("refresher");
  return [...new Set([...curated, ...auto])];
}

// Convert a 5-point [t10,t15,t20,t25,t30] array → 6-point [t0,t10,t20,t30,t40,t50]
function _expandTimingArr(src) {
  if (!Array.isArray(src) || src.length < 5) return null;
  const earlySlope = src[1] - src[0];               // t10→t15 slope
  const t0  = Math.max(0, Math.round(src[0] - earlySlope * 2));
  const lateSlope = src[4] - src[3];                // t25→t30 slope
  const t40 = Math.max(0, Math.min(100, Math.round(src[4] + lateSlope * 2)));
  const t50 = Math.max(0, Math.min(100, Math.round(src[4] + lateSlope * 4)));
  // [t0, t10, t20, t30, t40, t50]  (t15/t25 are interpolated by valAt)
  return [t0, src[0], src[2], src[4], t40, t50];
}

// Map hero-timings axes to advisor curve format, falling back to role defaults.
function heroTimingsToCurve(timings, roles = []) {
  const fb = defaultCurveByRole(roles);
  return {
    fight:   _expandTimingArr(timings.teamfight)  ?? fb.fight,
    pickoff: _expandTimingArr(timings.pickoff)    ?? fb.pickoff,
    push:    _expandTimingArr(timings.push)        ?? fb.push,
    scale:   _expandTimingArr(timings.late_scale) ?? fb.scale,
    rosh:    _expandTimingArr(timings.objective)  ?? fb.rosh,
    sustain: fb.sustain,  // no direct hero-timings analog
    defense: fb.defense,
  };
}

// Derive power-spike annotations from timing data.
function deriveSpikes(timings) {
  const MINS = [10, 15, 20, 25, 30];
  const combat = MINS.map((_, i) =>
    (timings.teamfight?.[i] ?? 0) + (timings.pickoff?.[i] ?? 0)
  );
  const peakIdx = combat.indexOf(Math.max(...combat));
  const peakMin = MINS[peakIdx];

  const label =
    peakMin <= 15 ? "Early power spike" :
    peakMin <= 22 ? "Mid-game power spike" :
                    "Late game power spike";
  const spikes = [{ minute: peakMin, description: label }];

  if ((timings.late_scale?.[4] ?? 0) >= 70)
    spikes.push({ minute: 35, description: "Scales hard into late game" });
  else if ((timings.early_end?.[1] ?? 0) >= 65)
    spikes.push({ minute: 8, description: "Strong early game pressure" });

  return spikes;
}

app.get("/presets", async (req, res) => {
  try {
    const heroes = await cached("heroes", async () => {
      const r = await fetch("https://api.opendota.com/api/constants/heroes");
      const j = await r.json();
      return Object.values(j).map((h) => ({
        id: h.id,
        localized_name: h.localized_name,
        roles: h.roles,
      }));
    });
    const allHeroTimings = getHeroTimings();
    const profilesByHero = {};
    for (const h of heroes) {
      const ht = allHeroTimings[String(h.id)];
      const curve  = ht ? heroTimingsToCurve(ht, h.roles || []) : defaultCurveByRole(h.roles || []);
      const spikes = ht ? deriveSpikes(ht) : [
        { minute: 10, description: "Level 10" },
        { minute: 20, description: "Level 20" },
      ];
      profilesByHero[h.id] = [
        {
          id: `${h.id}-default`,
          hero_id: h.id,
          name: `${h.localized_name} Default`,
          role: h.roles?.[0] || "Core",
          positions: h.roles?.includes("Support")
            ? [4, 5]
            : h.roles?.includes("Carry")
            ? [1]
            : [2, 3],
          play_style: "Adaptive",
          tags: defaultTags(h.roles || []),
          item_build: [],
          spikes,
          curve,
          hasRealTimings: !!ht,
        },
      ];
    }
    res.json({ profilesByHero });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get("/importMatch", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const m = q.match(/(\d{7,})$/);
    const id = m ? m[1] : q.trim();
    if (!id) return res.status(400).json({ error: "Missing match id" });
    const r = await fetch("https://api.opendota.com/api/matches/" + id);
    if (!r.ok)
      return res.status(502).json({ error: "OpenDota fail " + r.status });
    const data = await r.json();
    const picks = [];
    const bans = [];
    if (Array.isArray(data.picks_bans) && data.picks_bans.length) {
      for (const pb of data.picks_bans) {
        if (pb.is_pick) {
          picks.push({ hero_id: pb.hero_id, team: pb.team === 0 ? 1 : 2 });
        } else {
          bans.push({ hero_id: pb.hero_id, team: pb.team === 0 ? 1 : 2 });
        }
      }
    } else if (Array.isArray(data.players)) {
      for (const p of data.players) {
        picks.push({ hero_id: p.hero_id, team: p.isRadiant ? 1 : 2 });
      }
    }
    res.json({
      matchId: id,
      radiant: data.radiant_team?.name || "Team 1",
      dire: data.dire_team?.name || "Team 2",
      duration: data.duration,
      start_time: data.start_time,
      picks,
      bans,
    });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get("/enrichHero/:id", async (req, res) => {
  const heroId = Number(req.params.id);
  try {
    const r = await fetch(
      "https://api.opendota.com/api/benchmarks?hero_id=" + heroId
    );
    const j = await r.json();
    const gpm = (j?.result?.gold_per_min || []).map((x) => x.value);
    const xp = (j?.result?.xp_per_min || []).map((x) => x.value);
    const norm = (arr) => {
      if (!arr.length) return [10, 25, 45, 60, 75, 85];
      const mi = Math.min(...arr),
        ma = Math.max(...arr);
      return [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
        const idx = Math.floor(t * (arr.length - 1));
        const v = arr[idx];
        return Math.round(((v - mi) / (ma - mi || 1)) * 100);
      });
    };
    const farm = norm(gpm);
    const fight = norm(xp).map((v, i) => Math.round(v * 0.6 + farm[i] * 0.4));
    const push = farm.map((v) => Math.round(v * 0.6 + 30));
    res.json({
      curve: {
        fight,
        pickoff: fight,
        push,
        farm,
        sustain: fight,
        defense: fight,
        rosh: push.map((v) => Math.max(10, v - 20)),
        scale: [10, 25, 40, 60, 80, 95],
      },
      spikes: [
        { minute: 8, description: "Rune fights" },
        { minute: 20, description: "Tormentor" },
      ],
    });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// function valAt(arr, m) {
//   if (!arr?.length) return 0;
//   if (m <= 0) return arr[0];
//   if (m >= 50) return arr[arr.length - 1];
//   const idx = Math.floor(m / 10);
//   const a = arr[idx],
//     b = arr[idx + 1];
//   const t = (m - idx * 10) / 10;
//   return a + (b - a) * t;
// }
function sumAxis(team, minute, axis) {
  return team.reduce((acc, p) => {
    const c = (p.profile?.curve || defaultCurveByRole([]))[axis] || [
      0, 0, 0, 0, 0, 0,
    ];
    return acc + valAt(c, minute);
  }, 0);
}
// const WANT = [
//   "stun",
//   "initiator",
//   "save",
//   "dispel",
//   "waveclear",
//   "vision",
//   "roshan",
//   "tower_damage",
//   "mobility",
//   "aura_carrier",
//   "scale",
// ];

const AdvisorInput = z.object({
  minute: z.number().min(0).max(60),
  teams: z.object({
    team1: z
      .array(z.object({ hero_id: z.number(), profile: z.any().optional() }))
      .default([]),
    team2: z
      .array(z.object({ hero_id: z.number(), profile: z.any().optional() }))
      .default([]),
  }),
  picked: z.array(z.number()).default([]),
  banned: z.array(z.number()).default([]),
  roles: z
    .object({
      team1: z.array(z.number().nullable()).default([]),
      team2: z.array(z.number().nullable()).default([]),
    })
    .default({ team1: [], team2: [] }),
  perspective: z.enum(["team1", "team2"]).default("team1"),
});

// function valAt(arr, m) {
//   if (!arr?.length) return 0;
//   if (m <= 0) return arr[0];
//   const idx = Math.min(arr.length - 2, Math.floor(m / 10));
//   const a = arr[idx],
//     b = arr[idx + 1];
//   const t = Math.max(0, Math.min(1, (m - idx * 10) / 10));
//   return Math.round(a + (b - a) * t);
// }
// function sumAxis(team, minute, axis) {
//   return team.reduce((acc, p) => {
//     const c = (p.profile?.curve || defaultCurve())[axis] || [0, 0, 0, 0, 0, 0];
//     return acc + valAt(c, minute);
//   }, 0);
// }
function bestProfileFor(
  hero,
  presetsByHero,
  yourTags = new Set(),
  enemyTags = new Set(),
  minute = 15
) {
  const list = presetsByHero[hero.id] || [
    {
      id: `${hero.id}-default`,
      hero_id: hero.id,
      positions: hero.roles?.includes("Support")
        ? [4, 5]
        : hero.roles?.includes("Carry")
        ? [1]
        : [2, 3],
      tags: defaultTags(hero.roles || []),
      curve: defaultCurveByRole(hero.roles || []),
    },
  ];
  // reuse the light scoring from advisor
  function score(p) {
    let s = 0;
    for (const t of [
      "stun",
      "dispel",
      "save",
      "waveclear",
      "vision",
      "initiator",
      "aura_carrier",
    ])
      if (!yourTags.has(t) && (p.tags || []).includes(t)) s += 6;
    for (const th of [
      "minus_armor",
      "magic_amp",
      "summons",
      "aura",
      "mobility",
    ])
      if (yourTags.has(th) && (p.tags || []).includes(th)) s += 4;
    for (const ct of [
      { e: "sustain_heals", s: "burst" },
      { e: "splitpush", s: "catch" },
      { e: "magic_burst", s: "pipe_aura" },
      { e: "physical_damage", s: "armor_aura" },
    ]) {
      if (enemyTags.has(ct.e) && (p.tags || []).includes(ct.s)) s += 3;
    }
    const v = curveValue(p.curve || defaultCurve(), minute);
    s += (v.fight + v.pickoff + v.push + (v.rosh || 0) + (v.scale || 0)) / 100;
    return s;
  }
  return list.slice().sort((a, b) => score(b) - score(a))[0];
}
function tagSynergy(aTags, bTags) {
  let s = 0;
  const A = new Set(aTags || []),
    B = new Set(bTags || []);
  // shared themes
  if (A.has("minus_armor") && B.has("minus_armor")) s += 12;
  if (A.has("magic_amp") && B.has("magic_amp")) s += 10;
  if (
    (A.has("initiator") && (B.has("stun") || B.has("followup"))) ||
    (B.has("initiator") && (A.has("stun") || A.has("followup")))
  )
    s += 14;
  if (A.has("aura_carrier") || B.has("aura_carrier")) s += 6;
  if (A.has("summons") && B.has("push")) s += 8;
  return s;
}
function tagOpposition(aTags, bTags) {
  let s = 0;
  const A = new Set(aTags || []),
    B = new Set(bTags || []);
  if (B.has("sustain_heals") && (A.has("burst") || A.has("anti_heal"))) s += 14;
  if (B.has("splitpush") && (A.has("catch") || A.has("mobility"))) s += 10;
  if (B.has("magic_burst") && (A.has("pipe_aura") || A.has("magic_resist")))
    s += 10;
  if (B.has("physical_damage") && (A.has("armor_aura") || A.has("evasion")))
    s += 10;
  if (B.has("illusion") && (A.has("cleave") || A.has("waveclear"))) s += 8;
  return s;
}

function axisMix(curve, m) {
  const v = curveValue(curve, m);
  return (
    v.fight * 0.45 + v.pickoff * 0.25 + v.push * 0.25 + (v.rosh || 0) * 0.05
  );
}
function roleFromPositions(p) {
  return (p.positions || [])[0] || 0;
}

const AXES = ["fight", "pickoff", "push", "rosh", "scale"];
const WANT_TAGS = [
  "stun",
  "initiator",
  "save",
  "dispel",
  "waveclear",
  "vision",
  "roshan",
  "tower_damage",
  "mobility",
  "aura_carrier",
  "scale",
];
const SYNERGY_THEMES = [
  { tag: "minus_armor", label: "Synergy: Minus Armor" },
  { tag: "magic_amp", label: "Synergy: Magic Amp" },
  { tag: "summons", label: "Synergy: Summons/Push" },
  { tag: "aura", label: "Synergy: Auras" },
  { tag: "mobility", label: "Synergy: Mobility" },
];
const COUNTER_THEMES = [
  { enemy: "sustain_heals", self: "burst", label: "Counters Sustain" },
  { enemy: "splitpush", self: "catch", label: "Counters Splitpush" },
  { enemy: "magic_burst", self: "pipe_aura", label: "Counters Magic Burst" },
  { enemy: "physical_damage", self: "armor_aura", label: "Counters Physical" },
];

function curveValue(curve, minute) {
  const out = {};
  for (const a of AXES) out[a] = valAt(curve?.[a] || [], minute);
  return out;
}

/**
 * Sum helper over topK arrays.
 */
function sumTopK(arr, ids) {
  if (!arr || !arr.length || !ids || !ids.length) return 0;
  const set = new Set(ids);
  let s = 0;
  for (const e of arr) if (set.has(e.id)) s += e.score || 0;
  return s;
}

/**
 * Context score for a hypothetical pick heroId:
 *   allies synergy (with our current team1) minus opposition (vs team2).
 */
function contextScoreFor(heroId, team1Ids, team2Ids, matrix) {
  if (!matrix) return 0;
  const allies = matrix.topAllies?.[heroId] || [];
  const opps = matrix.topOpponents?.[heroId] || [];
  const pos = sumTopK(allies, team1Ids);
  const neg = sumTopK(opps, team2Ids);
  return pos - neg;
}

/**
 * Contributors (top 3) that drive context in THIS draft.
 */
function contextContribFor(heroId, team1Ids, team2Ids, matrix, limit = 3) {
  if (!matrix) return { allies: [], enemies: [] };
  const allies = (matrix.topAllies?.[heroId] || [])
    .filter((x) => team1Ids.includes(x.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const enemies = (matrix.topOpponents?.[heroId] || [])
    .filter((x) => team2Ids.includes(x.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { allies, enemies };
}
/**
 * Enemy gain if THEY pick heroId (for deny/ban ranking insight).
 * We invert sides: hero’s allies = enemy current picks; opponents = our picks.
 */
function enemyGainIfTheyPick(heroId, team1Ids, team2Ids, matrix) {
  if (!matrix) return 0;
  const allies = matrix.topAllies?.[heroId] || [];
  const opps = matrix.topOpponents?.[heroId] || [];
  const pos = sumTopK(allies, team2Ids); // their allies
  const neg = sumTopK(opps, team1Ids); // our picks hurt them
  return pos - neg;
}

/**
 * How much heroId counters the given enemy picks.
 * Returns total score + per-enemy breakdown (top 3).
 * topOpponents[heroId] = enemies heroId beats with the highest lift above baseline.
 */
function counterPickScoreFor(heroId, enemyIds, heroesById, matrix) {
  if (!matrix || !enemyIds.length) return { score: 0, vs: [] };
  const opps = matrix.topOpponents?.[heroId] || [];
  const enemySet = new Set(enemyIds);
  const matched = opps
    .filter((e) => enemySet.has(e.id))
    .sort((a, b) => b.score - a.score);
  const total = matched.reduce((s, e) => s + (e.score || 0), 0);
  return {
    score: total,
    vs: matched.slice(0, 3).map((e) => {
      const eh = heroesById[e.id];
      return {
        hero_id: e.id,
        name: eh?.name ?? `#${e.id}`,
        wr: Math.round((e.wr ?? 0.5) * 1000) / 10,   // e.g. 56.2
        score: Math.round((e.score || 0) * 10) / 10,
      };
    }),
  };
}

app.post("/advisor/suggest", async (req, res) => {
  try {
    const input = AdvisorInput.parse(req.body);
    const now = input.minute;

    const heroes = await fetchHeroesLite();
    const presetsByHero = await fetchPresets();

    // Respect perspective: swap teams when viewing from team2's side
    const your = input.perspective === "team2"
      ? (input.teams.team2 || [])
      : (input.teams.team1 || []);
    const enemy = input.perspective === "team2"
      ? (input.teams.team1 || [])
      : (input.teams.team2 || []);

    const yourTags = new Set(your.flatMap((p) => p.profile?.tags || []));
    const enemyTags = new Set(enemy.flatMap((p) => p.profile?.tags || []));

    const coverage = WANT_TAGS.map((t) => ({ tag: t, ok: yourTags.has(t) }));

    const taken = new Set([...(input.picked || []), ...(input.banned || [])]);
    const pool = heroes.filter((h) => !taken.has(h.id));

    // matrix + ids for context
    const matrix = getMatrixBundle() || null;
    const yourIds = your.map((p) => p.hero_id);
    const enemyIds = enemy.map((p) => p.hero_id);
    // team1Ids / team2Ids kept for backward-compat with helpers below
    const team1Ids = yourIds;
    const team2Ids = enemyIds;

    // Dynamic matrix weight: scales with draft depth so matrix dominates over tags as picks accumulate
    const pickCount = yourIds.length + enemyIds.length;
    const matrixWeight = 0.3 + pickCount * 0.4;

    // Role-fill context: load DB positions and compute what's still needed
    const yourRolesArr = (input.perspective === "team2" ? input.roles?.team2 : input.roles?.team1) || [];
    const yourRolesFilled = new Set(yourRolesArr.filter(Boolean));
    const neededPositions = [1, 2, 3, 4, 5].filter((p) => !yourRolesFilled.has(p));

    let dbHeroPositions = {};
    try {
      const rows = getDb()
        .prepare(`SELECT hero_id, position, tier FROM hero_positions`)
        .all();
      for (const r of rows) {
        if (!dbHeroPositions[r.hero_id]) dbHeroPositions[r.hero_id] = [];
        dbHeroPositions[r.hero_id].push(r);
      }
    } catch {}

    // Hero item builds + tag infrastructure
    const heroItemsData = getHeroItems();
    const heroesById = Object.fromEntries(heroes.map((h) => [h.id, h]));

    function teamTagCounts(team) {
      const counts = {};
      for (const pick of team) {
        const h2 = heroesById[pick.hero_id];
        const build = heroItemsData[String(pick.hero_id)]?.generic ?? [];
        for (const tag of computeHeroTags(pick.hero_id, h2?.roles ?? [], build)) {
          counts[tag] = (counts[tag] || 0) + 1;
        }
      }
      return counts;
    }
    const yourTagCounts  = teamTagCounts(your);
    const enemyTagCounts = teamTagCounts(enemy);

    function roleFillBonus(heroId) {
      const positions = dbHeroPositions[heroId] ?? [];
      if (!positions.length || !neededPositions.length) return 0;
      // tier: 0=main, 1=secondary, 2=suboptimal, 3=undesirable
      const main      = positions.find((p) => (p.tier ?? 0) === 0);
      const secondary = positions.find((p) => (p.tier ?? 0) === 1);
      if (main) {
        if (neededPositions.includes(main.position)) return 3.0;
        if (yourRolesFilled.size > 0) return -1.5; // position already covered
      }
      if (secondary && neededPositions.includes(secondary.position)) return 1.5;
      // Suboptimal/undesirable: small bonus if it fills a gap, still penalised elsewhere
      const suboptimal = positions.find((p) => (p.tier ?? 0) === 2 && neededPositions.includes(p.position));
      return suboptimal ? 0.5 : 0;
    }

    // --- helpers (local) ---
    function reasonsFor(profile) {
      const rs = [];
      for (const tag of WANT_TAGS) {
        if (!yourTags.has(tag) && (profile.tags || []).includes(tag))
          rs.push("+" + tag.replace("_", " "));
      }
      for (const s of SYNERGY_THEMES) {
        if (yourTags.has(s.tag) && (profile.tags || []).includes(s.tag))
          rs.push(s.label);
      }
      for (const c of COUNTER_THEMES) {
        if (enemyTags.has(c.enemy) && (profile.tags || []).includes(c.self))
          rs.push(c.label);
      }
      const pos = (profile.positions || [])[0];
      if (pos) rs.push(`Fits Pos ${pos}`);
      return rs;
    }

    function pickBestProfileFor(h) {
      const list = presetsByHero[h.id] || [
        {
          id: `${h.id}-default`,
          hero_id: h.id,
          positions: h.roles?.includes("Support")
            ? [4, 5]
            : h.roles?.includes("Carry")
            ? [1]
            : [2, 3],
          tags: defaultTags(h.roles || []),
          curve: defaultCurveByRole(h.roles || []),
        },
      ];
      function score(p) {
        let s = 0;
        for (const tag of WANT_TAGS)
          if (!yourTags.has(tag) && (p.tags || []).includes(tag)) s += 8;
        for (const th of SYNERGY_THEMES)
          if (yourTags.has(th.tag) && (p.tags || []).includes(th.tag)) s += 6;
        for (const ct of COUNTER_THEMES)
          if (enemyTags.has(ct.enemy) && (p.tags || []).includes(ct.self))
            s += 5;
        const dv = curveValue(p.curve || defaultCurve(), now);
        s +=
          (dv.fight + dv.pickoff + dv.push + (dv.rosh || 0) + (dv.scale || 0)) /
          100;
        if ((p.positions || [])[0] === 1) s += 0.5;
        return s;
      }
      return list.slice().sort((a, b) => score(b) - score(a))[0];
    }

    function teamAuraCountAtNow(team) {
      let c = 0;
      for (const p of team) {
        const tags = p.profile?.tags || [];
        if (
          tags.includes("aura_carrier") ||
          tags.includes("greaves") ||
          tags.includes("pipe") ||
          tags.includes("assault") ||
          tags.includes("vladmir") ||
          tags.includes("crimson_guard")
        ) {
          c++;
        }
      }
      return c;
    }

    // ── Ally suggestions
    const ally = pool
      .map((h) => {
        const profile = pickBestProfileFor(h);
        const roleHint = (profile.positions || [])[0] || 2;

        // likely items — prefer real build data, fall back to profile tag inference
        const heroBuild = heroItemsData[String(h.id)]?.generic ?? [];
        const likelyFromBuild = heroBuild.slice(0, 10)
          .map((name) => ITEM_KEY_MAP[name])
          .filter(Boolean);
        const likelyFromTags = [];
        const ptags = profile.tags || [];
        if (ptags.includes("initiator")  && !likelyFromBuild.includes("blink"))       likelyFromTags.push("blink");
        if (ptags.includes("aura_carrier")&& !likelyFromBuild.includes("greaves"))    likelyFromTags.push("greaves");
        if (ptags.includes("pipe_aura")   && !likelyFromBuild.includes("pipe"))       likelyFromTags.push("pipe");
        if (ptags.includes("armor_aura")  && !likelyFromBuild.includes("assault"))    likelyFromTags.push("assault");
        if (ptags.includes("anti_heal")   && !likelyFromBuild.includes("shivas_guard"))likelyFromTags.push("shivas_guard");
        if ((ptags.includes("core_bkb") || roleHint <= 2) && !likelyFromBuild.includes("bkb")) likelyFromTags.push("bkb");

        const itemsLikely = [...new Set([...likelyFromBuild, ...likelyFromTags])]
          .filter((k) => ITEMS[k])
          .slice(0, 8)
          .map((k) => ({
            key: k,
            label: ITEMS[k].label,
            minute: estItemMinute(k, roleHint, h.id),
            effects: ITEMS[k].effects,
            aura: AURA_CLASSES.has(ITEMS[k].class),
          }));

        // base + itemized axes at now
        const axesNow = { ...curveValue(profile.curve || defaultCurve(), now) };
        let auraCnt = teamAuraCountAtNow(your);
        for (const it of itemsLikely) {
          if (it.minute <= now) {
            const w = it.aura ? auraSaturationPenalty(auraCnt) : 1;
            applyItemEffectsToAxes(axesNow, it.effects, w);
            if (it.aura) auraCnt++;
          }
        }

        // minute table
        const deltasByMinute = {};
        for (const m of [10, 15, 20, 25, now]) {
          const base = curveValue(profile.curve || defaultCurve(), m);
          let cnt = teamAuraCountAtNow(your);
          for (const it of itemsLikely) {
            if (it.minute <= m) {
              const w = it.aura ? auraSaturationPenalty(cnt) : 1;
              applyItemEffectsToAxes(base, it.effects, w);
              if (it.aura) cnt++;
            }
          }
          deltasByMinute[m] = base;
        }

        // reasons (+ near-term items)
        const reasons = reasonsFor(profile);
        for (const it of itemsLikely) {
          if (it.minute >= now && it.minute <= now + 10)
            reasons.push(`${it.label} @${it.minute}`);
        }

        // base score
        let score = 0;
        for (const tag of WANT_TAGS)
          if (!yourTags.has(tag) && (profile.tags || []).includes(tag))
            score += 3.5;
        if ((profile.positions || []).includes(1)) score += 1.5;
        if ((profile.positions || []).includes(3)) score += 1.0;
        for (const th of SYNERGY_THEMES)
          if (yourTags.has(th.tag) && (profile.tags || []).includes(th.tag))
            score += 2.0;
        for (const ct of COUNTER_THEMES)
          if (enemyTags.has(ct.enemy) && (profile.tags || []).includes(ct.self))
            score += 1.5;
        const raw =
          axesNow.fight +
          axesNow.pickoff +
          axesNow.push +
          (axesNow.rosh || 0) +
          (axesNow.scale || 0);
        score += raw / 100;
        for (const it of itemsLikely) {
          const soon = Math.max(0, 1 - Math.abs(it.minute - now) / 8);
          score += soon * 1.5;
        }

        // synergy with our picks (matrix)
        const synergy = sumTopK(matrix?.topAllies?.[h.id] || [], yourIds);
        score += matrixWeight * synergy;

        // counter advantage vs enemy picks — explicitly added (not subtracted)
        const cpk = counterPickScoreFor(h.id, enemyIds, heroesById, matrix);
        score += matrixWeight * cpk.score;
        if (cpk.score > 0 && cpk.vs.length) {
          reasons.push(`Counters: ${cpk.vs.slice(0, 2).map((v) => v.name).join(", ")}`);
        }

        // role-fill bonus: prefer heroes that fill open positions
        const rfb = roleFillBonus(h.id);
        score += rfb;
        if (rfb > 0) {
          const pos = (dbHeroPositions[h.id] ?? []).find((p) => (p.tier ?? 0) === 0);
          if (pos && neededPositions.includes(pos.position)) reasons.push(`Fills Pos ${pos.position}`);
        }

        // tag conflict penalty: penalise picks that oversaturate the team
        const heroTags = computeHeroTags(h.id, h.roles ?? [], heroBuild);
        for (const [tag, rule] of Object.entries(TAG_CONFLICTS)) {
          if (heroTags.includes(tag) && (yourTagCounts[tag] || 0) >= rule.max) {
            score -= rule.penalty;
            reasons.push(`⚠ ${rule.label}`);
          }
        }

        return {
          hero_id: h.id,
          name: h.name,
          icon: h.icon,
          profileId: profile.id,
          profile,
          deltas: axesNow,
          deltasByMinute,
          itemsLikely,
          reasons,
          counterScore: Math.round(cpk.score * 10) / 10,
          counterVs: cpk.vs,
          _score: score,
        };
      })
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        if (b.deltas.push !== a.deltas.push)
          return b.deltas.push - a.deltas.push;
        return a.hero_id - b.hero_id;
      })
      .slice(0, 6)
      .map(({ _score, ...rest }) => rest);

    // ── Deny/Ban suggestions
    const banList = pool
      .map((h) => {
        const list = presetsByHero[h.id] || [
          {
            id: `${h.id}-default`,
            hero_id: h.id,
            tags: defaultTags(h.roles || []),
            curve: defaultCurveByRole(h.roles || []),
          },
        ];
        const best = list[0];
        const dv = curveValue(best.curve || defaultCurve(), now);

        // coverage they gain
        let coverageGain = 0,
          reasons = [];
        for (const tag of WANT_TAGS) {
          const need = !enemyTags.has(tag) && (best.tags || []).includes(tag);
          if (need) {
            coverageGain += 8;
            reasons.push("Fills enemy: " + tag.replace("_", " "));
          }
        }

        // their likely items — from real build data, falling back to tags
        const roleHint = (best.positions || [])[0] || 2;
        const enemyBuild = heroItemsData[String(h.id)]?.generic ?? [];
        const likelyFromBuild = enemyBuild.slice(0, 10).map((n) => ITEM_KEY_MAP[n]).filter(Boolean);
        const likelyFromTags = [];
        const btags = best.tags || [];
        if (btags.includes("initiator")  && !likelyFromBuild.includes("blink"))       likelyFromTags.push("blink");
        if (btags.includes("aura_carrier")&& !likelyFromBuild.includes("greaves"))    likelyFromTags.push("greaves");
        if (btags.includes("pipe_aura")   && !likelyFromBuild.includes("pipe"))       likelyFromTags.push("pipe");
        if (btags.includes("armor_aura")  && !likelyFromBuild.includes("assault"))    likelyFromTags.push("assault");
        if ((btags.includes("core_bkb") || roleHint <= 2) && !likelyFromBuild.includes("bkb")) likelyFromTags.push("bkb");
        const itemsLikely = [...new Set([...likelyFromBuild, ...likelyFromTags])]
          .filter((k) => ITEMS[k])
          .slice(0, 8)
          .map((k) => ({
            key: k,
            label: ITEMS[k].label,
            minute: estItemMinute(k, roleHint, h.id),
            effects: ITEMS[k].effects,
            aura: AURA_CLASSES.has(ITEMS[k].class),
          }));

        let score = (dv.fight + dv.pickoff + dv.push) / 3 + coverageGain;

        // how much THEY gain in our context — same dynamic weight
        const enemyCtxGain = enemyGainIfTheyPick(
          h.id,
          team1Ids,
          team2Ids,
          matrix
        );
        score += matrixWeight * enemyCtxGain;

        return {
          hero_id: h.id,
          name: h.name,
          icon: h.icon,
          deltas: dv,
          reasons,
          itemsLikely,
          enemyContextGain: enemyCtxGain,
          _score: score,
        };
      })
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        if (b.deltas.push !== a.deltas.push)
          return b.deltas.push - a.deltas.push;
        return a.hero_id - b.hero_id;
      })
      .slice(0, 6)
      .map(({ _score, ...rest }) => rest);

    // team needs (top 3)
    const priority = [
      "stun",
      "dispel",
      "save",
      "waveclear",
      "vision",
      "initiator",
      "roshan",
      "tower_damage",
      "mobility",
      "aura_carrier",
      "scale",
    ];
    const teamNeeds = coverage
      .filter((c) => !c.ok)
      .map((c) => c.tag)
      .sort((a, b) => priority.indexOf(a) - priority.indexOf(b))
      .slice(0, 3);

    // Pure counter-pick ranking: scored solely by matchup advantage vs enemy picks.
    // Only meaningful when enemy has picks and matrix is available.
    const counterSuggestions = enemyIds.length > 0 && matrix
      ? pool
          .map((h) => {
            const cpk = counterPickScoreFor(h.id, enemyIds, heroesById, matrix);
            if (cpk.score <= 0) return null;
            const rfb = roleFillBonus(h.id);
            // Tiebreak: add a small role-fill bonus so two heroes with equal counter scores
            // prefer the one that fills an open position.
            return {
              hero_id: h.id,
              name: h.name,
              icon: h.icon,
              counterScore: Math.round(cpk.score * 10) / 10,
              counterVs: cpk.vs,
              roleFit: rfb > 0,
              _sort: cpk.score + rfb * 0.1,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b._sort - a._sort)
          .slice(0, 10)
          .map(({ _sort, ...rest }) => rest)
      : [];

    res.json({
      minute: now,
      coverage,
      teamNeeds,
      allySuggestions: ally,
      banSuggestions: banList,
      counterSuggestions,
      matrixAvailable: !!matrix,
      teamTags: { your: yourTagCounts, enemy: enemyTagCounts },
    });
  } catch (e) {
    console.error("[advisor/suggest] error", e);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/advisor/explain", async (req, res) => {
  try {
    const { hero_id, minute } = req.body || {};
    if (!hero_id) return res.status(400).json({ error: "hero_id required" });
    const heroes = await cached("heroes-min", async () => {
      const r = await fetch("https://api.opendota.com/api/constants/heroes");
      const j = await r.json();
      return Object.values(j).map((h) => ({ id: h.id, roles: h.roles }));
    });
    const h = heroes.find((x) => x.id == hero_id);
    const ht = getHeroTimings()[String(hero_id)];
    const curve = ht ? heroTimingsToCurve(ht, h?.roles || []) : defaultCurveByRole(h?.roles || []);
    const spikes = ht ? deriveSpikes(ht) : [];
    const mins = [10, 15, 20, 25, minute || 20];
    const axes = ["fight", "pickoff", "push", "rosh", "scale"];
    const rows = mins.map((m) => {
      const o = { minute: m };
      axes.forEach((a) => (o[a] = Math.round(valAt(curve[a], m))));
      return o;
    });
    res.json({ rows, spikes, hasRealTimings: !!ht });
  } catch (e) {
    log.error(e);
    res.status(400).json({ error: String(e) });
  }
});

// ─── Hero DB endpoints ────────────────────────────────────────────────────────

app.get("/heroes/:id/matchups", (req, res) => {
  try {
    const heroId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const matrix = getMatrixBundle();

    if (!matrix?.topOpponents) return res.json({ hero_id: heroId, counters: [], counteredBy: [], source: "none" });
    const toEntry = (e) => ({ opponent_id: e.id, winrate: e.wr ?? 0, games: e.games ?? 0, score: e.score });
    res.json({
      hero_id: heroId,
      source: "matrix",
      counters: (matrix.topOpponents[heroId] || []).slice(0, limit).map(toEntry),
      counteredBy: (matrix.topCounteredBy?.[heroId] || []).slice(0, limit).map(toEntry),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/heroes/:id/synergies", (req, res) => {
  try {
    const heroId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const matrix = getMatrixBundle();

    if (!matrix?.topAllies) return res.json({ hero_id: heroId, allies: [], source: "none" });
    res.json({
      hero_id: heroId,
      source: "matrix",
      allies: (matrix.topAllies[heroId] || []).slice(0, limit).map((e) => ({
        ally_id: e.id, wr: e.wr ?? 0, games: e.games ?? 0, score: e.score,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/heroes/positions", (req, res) => {
  try {
    const rows = getDb()
      .prepare(`SELECT hero_id, position, tier FROM hero_positions ORDER BY hero_id, tier, position`)
      .all();
    const map = {};
    for (const r of rows) {
      if (!map[r.hero_id]) map[r.hero_id] = [];
      map[r.hero_id].push({ position: r.position, tier: r.tier ?? 0 });
    }
    res.json({ positions: map });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/heroes/:id/positions", (req, res) => {
  try {
    res.json({ hero_id: Number(req.params.id), positions: getPositions(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put("/heroes/:id/positions", (req, res) => {
  try {
    const heroId = Number(req.params.id);
    const positions = z.array(z.object({
      position: z.number().int().min(1).max(5),
      tier: z.number().int().min(0).max(3).default(0),
    })).parse(req.body);
    setPositions(heroId, positions);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.get("/heroes/:id/guides", (req, res) => {
  try {
    res.json({ hero_id: Number(req.params.id), guides: getGuides(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/heroes/:id/guides", (req, res) => {
  try {
    const heroId = Number(req.params.id);
    const body = z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1),
      author: z.string().optional(),
    }).parse(req.body);
    const id = addGuide(heroId, body);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.delete("/heroes/:id/guides/:guideId", (req, res) => {
  try {
    deleteGuide(Number(req.params.guideId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// ─── Item builds & unique items ──────────────────────────────────────────────

const UNIQUE_ITEMS_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "data/unique-items.json");
const HERO_ITEMS_PATH   = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "data/hero-items.json");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

// Items that should only be built once per team
app.get("/items/unique", (req, res) => {
  res.json({ items: readJson(UNIQUE_ITEMS_PATH, []) });
});

app.put("/items/unique", (req, res) => {
  try {
    const items = z.array(z.string().min(1)).parse(req.body);
    writeJson(UNIQUE_ITEMS_PATH, items);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

// Hero item builds — keyed by hero_id → position (or "generic") → string[]
app.get("/heroes/:id/items", (req, res) => {
  const heroId = String(Number(req.params.id));
  const all = readJson(HERO_ITEMS_PATH, {});
  res.json({ hero_id: Number(heroId), builds: all[heroId] ?? {} });
});

app.put("/heroes/:id/items", (req, res) => {
  try {
    const heroId = String(Number(req.params.id));
    const body = z.object({
      position: z.union([z.literal("generic"), z.number().int().min(1).max(5)]),
      items:    z.array(z.string().min(1)),
    }).parse(req.body);
    const all = readJson(HERO_ITEMS_PATH, {});
    if (!all[heroId]) all[heroId] = {};
    all[heroId][String(body.position)] = body.items;
    writeJson(HERO_ITEMS_PATH, all);
    __heroItems = null; // bust cache
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

// Bulk read — returns { hero_id: { pos: [...] } } for all heroes that have data
app.get("/items/builds", (req, res) => {
  res.json(readJson(HERO_ITEMS_PATH, {}));
});

// Auto-fetch popular items from OpenDota for a single hero, save into hero-items.json
app.post("/admin/heroes/:id/fetch-items", async (req, res) => {
  try {
    const heroId = Number(req.params.id);

    // Fetch item constants to build id→name map
    const [popRes, constRes] = await Promise.all([
      fetch(`https://api.opendota.com/api/heroes/${heroId}/itemPopularity`),
      fetch("https://api.opendota.com/api/constants/items"),
    ]);
    if (!popRes.ok) return res.status(502).json({ error: `OpenDota returned ${popRes.status}` });
    const pop = await popRes.json();
    const itemConsts = constRes.ok ? await constRes.json() : {};

    const idToName = {};
    for (const [name, data] of Object.entries(itemConsts ?? {})) {
      if (data?.id != null) idToName[String(data.id)] = name;
    }

    const SKIP = new Set(["tango", "clarity", "faerie_fire", "enchanted_mango",
      "observer_ward", "sentry_ward", "smoke_of_deceit", "tome_of_knowledge"]);

    const phaseItems = (bucket, limit = 8) =>
      Object.entries(bucket ?? {})
        .map(([id, cnt]) => ({ name: idToName[id], cnt }))
        .filter(({ name }) => name && !SKIP.has(name) && !name.startsWith("recipe"))
        .sort((a, b) => b.cnt - a.cnt)
        .slice(0, limit)
        .map(({ name }) => name);

    // Combined generic top-10 across phases
    const counts = {};
    for (const phase of ["early_game_items", "mid_game_items", "late_game_items"]) {
      for (const [itemId, count] of Object.entries(pop[phase] ?? {})) {
        counts[itemId] = (counts[itemId] ?? 0) + count;
      }
    }
    const top = Object.entries(counts)
      .map(([id, count]) => ({ name: idToName[id], count }))
      .filter(({ name }) => name && !SKIP.has(name) && !name.startsWith("recipe"))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ name }) => name);

    const all = readJson(HERO_ITEMS_PATH, {});
    const key = String(heroId);
    if (!all[key]) all[key] = {};
    all[key].generic = top;
    all[key].phases = {
      early: phaseItems(pop.early_game_items),
      mid:   phaseItems(pop.mid_game_items),
      late:  phaseItems(pop.late_game_items),
    };
    writeJson(HERO_ITEMS_PATH, all);
    __heroItems = null;
    res.json({ ok: true, fetched: top });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// GET /admin/heroes/fetch-all-items  — SSE stream, fetches builds for every hero from OpenDota
// Query: onlyMissing=true (default) skips heroes that already have a "generic" build
app.get("/admin/heroes/fetch-all-items", async (req, res) => {
  const onlyMissing = req.query.onlyMissing !== "false";
  // OpenDota free tier: ~60 req/min → 1 req/sec minimum. Default 1100ms gives headroom.
  const delayMs = Math.max(600, Math.min(5000, Number(req.query.delay ?? 1100)));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const SKIP = new Set([
    "tango", "clarity", "faerie_fire", "enchanted_mango",
    "observer_ward", "sentry_ward", "smoke_of_deceit", "tome_of_knowledge",
    "ward_dispenser",
  ]);

  // Fetch with one retry on rate-limit
  const fetchOD = async (url) => {
    for (let attempt = 0; attempt <= 1; attempt++) {
      const r = await fetch(url);
      if (r.status === 429 || r.status === 503) {
        if (attempt === 0) { await sleep(6000); continue; }
        throw new Error(`Rate limited (HTTP ${r.status})`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (data && !Array.isArray(data) && data.error) {
        if (attempt === 0) { await sleep(6000); continue; }
        throw new Error(String(data.error));
      }
      return data;
    }
  };

  try {
    // Fetch hero list and item constants in parallel
    const [heroList, itemConsts] = await Promise.all([
      fetchOD("https://api.opendota.com/api/heroes"),
      fetchOD("https://api.opendota.com/api/constants/items"),
    ]);
    if (!Array.isArray(heroList)) throw new Error("Unexpected hero list shape");

    // Build item-id → internal-name map (e.g. 1 → "blink")
    const idToName = {};
    for (const [name, data] of Object.entries(itemConsts ?? {})) {
      if (data?.id != null) idToName[String(data.id)] = name;
    }

    heroList.sort((a, b) => a.id - b.id);

    const allBuilds = readJson(HERO_ITEMS_PATH, {});

    const toFetch = onlyMissing
      ? heroList.filter((h) => !allBuilds[String(h.id)]?.generic?.length)
      : heroList;

    const skipped = heroList.length - toFetch.length;
    send({ type: "start", total: toFetch.length, skipped });

    let done = 0, failed = 0, fetched = 0;

    for (const hero of toFetch) {
      if (res.writableEnded) break;

      try {
        // itemPopularity returns { early_game_items, mid_game_items, late_game_items }
        // where each phase is { [itemId]: count }
        const pop = await fetchOD(`https://api.opendota.com/api/heroes/${hero.id}/itemPopularity`);

        // Aggregate counts across relevant phases (skip start_game consumables phase)
        const counts = {};
        for (const phase of ["early_game_items", "mid_game_items", "late_game_items"]) {
          for (const [itemId, count] of Object.entries(pop[phase] ?? {})) {
            counts[itemId] = (counts[itemId] ?? 0) + count;
          }
        }

        const phaseItems = (bucket, limit = 8) =>
          Object.entries(bucket ?? {})
            .map(([id, cnt]) => ({ name: idToName[id], cnt }))
            .filter(({ name }) => name && !SKIP.has(name) && !name.startsWith("recipe"))
            .sort((a, b) => b.cnt - a.cnt)
            .slice(0, limit)
            .map(({ name }) => name);

        const top = Object.entries(counts)
          .map(([id, count]) => ({ name: idToName[id], count }))
          .filter(({ name }) => name && !SKIP.has(name) && !name.startsWith("recipe"))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map(({ name }) => name);

        if (!allBuilds[String(hero.id)]) allBuilds[String(hero.id)] = {};
        allBuilds[String(hero.id)].generic = top;
        allBuilds[String(hero.id)].phases = {
          early: phaseItems(pop.early_game_items),
          mid:   phaseItems(pop.mid_game_items),
          late:  phaseItems(pop.late_game_items),
        };
        writeJson(HERO_ITEMS_PATH, allBuilds);

        done++; fetched++;
        send({ type: "hero", heroId: hero.id, name: hero.localized_name, items: top, done, total: toFetch.length });
      } catch (e) {
        done++; failed++;
        send({ type: "fail", heroId: hero.id, name: hero.localized_name, error: e.message, done, total: toFetch.length });
      }

      await sleep(delayMs);
    }

    send({ type: "done", fetched, failed, skipped, total: toFetch.length });
  } catch (e) {
    send({ type: "fatal", error: e.message });
  }

  if (!res.writableEnded) res.end();
});

// ─── Hero desire timings ──────────────────────────────────────────────────────
// Schema: { [heroId]: { [desireKey]: [val10, val15, val20, val25, val30] } }
// HERO_TIMINGS_PATH is defined earlier (near getHeroTimings)

const DESIRE_KEYS = ["teamfight","pickoff","push","split","objective","farm","early_end","late_scale"];
const TIMING_SCHEMA = z.record(
  z.string(),   // heroId
  z.record(
    z.enum(DESIRE_KEYS),
    z.array(z.number().int().min(0).max(100)).length(5)
  )
);

app.get("/heroes/:id/timings", (req, res) => {
  const heroId = String(Number(req.params.id));
  const all = readJson(HERO_TIMINGS_PATH, {});
  res.json({ hero_id: Number(heroId), timings: all[heroId] ?? {} });
});

app.put("/heroes/:id/timings", (req, res) => {
  try {
    const heroId = String(Number(req.params.id));
    const body = z.record(
      z.enum(DESIRE_KEYS),
      z.array(z.number().int().min(0).max(100)).length(5)
    ).parse(req.body);
    const all = readJson(HERO_TIMINGS_PATH, {});
    all[heroId] = body;
    writeJson(HERO_TIMINGS_PATH, all);
    __heroTimings = null; // bust in-memory cache so next advisor request picks up new data
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

// Bulk read for the draft team panel
app.get("/heroes/timings/all", (req, res) => {
  res.json(readJson(HERO_TIMINGS_PATH, {}));
});

// Gameplay tags per hero — curated + auto-derived from build data + roles
app.get("/heroes/tags", async (req, res) => {
  try {
    const heroes = await fetchHeroesLite();
    const itemsData = getHeroItems();
    const tags = {};
    for (const h of heroes) {
      const build = itemsData[String(h.id)]?.generic ?? [];
      const heroTags = computeHeroTags(h.id, h.roles ?? [], build);
      if (heroTags.length) tags[h.id] = heroTags;
    }
    res.json({ tags });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.post("/admin/matrix/reload", async (req, res) => {
  const ok = await loadMatrixSnapshot(app, SNAPSHOT_FILE);
  if (!ok)
    return res.status(500).json({ error: "Failed to reload matrix snapshot" });
  res.json({ ok: true });
});

// ==== GET /matrix/topk?rank=DivinePlus&patch=7.xx ====

app.get("/matrix/topk", async (req, res) => {
  try {
    const k = Math.max(1, Math.min(100, Number(req.query.k) || 50));
    // const full = req.app.locals?.matrixTopK || {
    //   topAllies: {},
    //   topOpponents: {},
    // };
    let full = req.app.locals?.matrixTopK;
    // Lazy-load if empty
    if (
      !full ||
      (!Object.keys(full.topAllies || {}).length &&
        !Object.keys(full.topOpponents || {}).length)
    ) {
      const ok = await loadMatrixSnapshot(req.app, SNAPSHOT_FILE);
      full = req.app.locals.matrixTopK;
      if (!ok) {
        return res.status(503).json({
          error: "matrix not loaded yet — run sync or check snapshot path",
        });
      }
    }

    const clip = (m) => {
      const out = {};
      for (const hid in m) out[hid] = (m[hid] || []).slice(0, k);
      return out;
    };

    const payload = {
      topAllies: clip(full.topAllies),
      topOpponents: clip(full.topOpponents),
    };

    const empty =
      Object.keys(payload.topAllies).length === 0 &&
      Object.keys(payload.topOpponents).length === 0;
    if (empty)
      return res
        .status(503)
        .json({ error: "matrix not loaded yet — run build script" });

    const etag = etagFor(payload);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    res.setHeader(
      "Cache-Control",
      "public, max-age=3600, stale-while-revalidate=300"
    );
    res.setHeader("ETag", etag);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ==== GET /meta?rank=DivinePlus&patch=7.xx ====
// Role‑aware META list using curve power at mid/late minutes; cached 30 min

app.get("/meta", async (req, res) => {
  try {
    const heroes = await fetchHeroesLite();
    const presets = await fetchPresets(`http://localhost:${PORT || 8787}`);
    const minutes = [15, 25, 30];
    const key = "meta:v1";
    const meta = await memo(key, 30 * 60 * 1000, () => {
      const byRole = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const h of heroes) {
        const list = presets[h.id] || [
          {
            id: `${h.id}-default`,
            hero_id: h.id,
            positions: h.roles?.includes("Support")
              ? [4, 5]
              : h.roles?.includes("Carry")
              ? [1]
              : [2, 3],
            tags: defaultTags(h.roles || []),
            curve: defaultCurveByRole(h.roles || []),
          },
        ];
        for (const p of list) {
          const m15 = axisMix(p.curve, minutes[0]);
          const m25 = axisMix(p.curve, minutes[1]);
          const sc = Math.round(m15 * 0.6 + m25 * 0.4); // simple MetaScore proxy
          const role = roleFromPositions(p);
          if (byRole[role])
            byRole[role].push({
              hero_id: h.id,
              profile_id: p.id,
              role,
              score: sc,
            });
        }
      }
      for (const r of [1, 2, 3, 4, 5]) {
        byRole[r].sort((a, b) => b.score - a.score);
        // keep best per hero per role
        const seen = new Set();
        byRole[r] = byRole[r].filter((e) =>
          seen.has(e.hero_id) ? false : seen.add(e.hero_id)
        );
      }
      return byRole;
    });
    res.json({ meta });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/meta/status", (req, res) => {
  try {
    const m = req.app.locals?.matrixTopK || {
      topAllies: {},
      topOpponents: {},
      _meta: null,
    };
    const heroes = m.topAllies ? Object.keys(m.topAllies).length : 0;

    const status = {
      ok: true,
      server: {
        time: new Date().toISOString(),
      },
      matrix: {
        loaded: heroes > 0,
        heroes,
        generatedAt: m._meta?.generatedAt || null,
        source: m._meta?.source || null,
        schema: m._meta?.schema || "matrix-topk/v1",
      },
      profiles: {
        available: false,
        patch: null,
        count: 0,
      },
      db: (() => { try { return dbStats(); } catch { return null; } })(),
      version: "v0.9",
    };
    res.setHeader("Cache-Control", "no-cache");
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

function teamAxes(team, minute) {
  const axes = [
    "fight",
    "pickoff",
    "push",
    "sustain",
    "defense",
    "rosh",
    "scale",
  ];
  const sums = {};
  for (const a of axes) {
    let s = 0;
    for (const p of team || []) {
      const curve = (p && p.profile && p.profile.curve) || defaultCurve();
      s += valAt(curve[a], minute);
    }
    sums[a] = Math.round(s);
  }
  return sums;
}

const StoryInput = z.object({
  minute: z.number().min(0).max(60).default(15),
  teams: z.object({
    team1: z
      .array(
        z.object({
          hero_id: z.number(),
          profile: z.any().nullable().optional(),
        })
      )
      .default([]),
    team2: z
      .array(
        z.object({
          hero_id: z.number(),
          profile: z.any().nullable().optional(),
        })
      )
      .default([]),
  }),
  roles: z
    .object({
      team1: z.array(z.number().nullable()).optional(),
      team2: z.array(z.number().nullable()).optional(),
    })
    .default({}),
});

function solvePositions(team) {
  const assigned = Array(5).fill(null);
  team.forEach((p, idx) => {
    const pos = p.profile?.positions?.[0];
    if (pos && !assigned[pos - 1]) assigned[pos - 1] = idx;
  });
  for (let pos = 1; pos <= 5; pos++) {
    if (assigned[pos - 1] == null) {
      for (let i = 0; i < team.length; i++) {
        if (!assigned.includes(i)) {
          assigned[pos - 1] = i;
          break;
        }
      }
    }
  }
  return assigned;
}

// ─── Storyboard helpers ───────────────────────────────────────────────────────

function heroAxesAt(pick, minute) {
  if (!pick) return null;
  const a = teamAxesAt([pick], minute);
  return { fight: a.fight || 0, pickoff: a.pickoff || 0, push: a.push || 0, scale: a.scale || 0 };
}

function computeLanes(t1, pos1, t2, pos2) {
  const heroAt = (team, positions, pos) => {
    const i = positions.indexOf(pos);
    return i >= 0 && i < team.length ? team[i] : null;
  };

  const result = [];

  // Safe lane: T1 carry (pos 1) vs T2 offlaner (pos 3)
  {
    const h1 = heroAt(t1, pos1, 1);
    const h2 = heroAt(t2, pos2, 3);
    const incomplete = !h1 || !h2;
    const a1 = heroAxesAt(h1, 10) ?? { fight: 25, scale: 20, push: 15 };
    const a2 = heroAxesAt(h2, 10) ?? { fight: 25, push: 20, scale: 15 };
    const p1 = a1.fight + a1.scale;
    const p2 = a2.fight + a2.push;
    const d = p1 - p2;
    result.push({
      lane: "Safe",
      incomplete,
      label: incomplete ? "TBD" : d > 12 ? "T1 favored" : d < -12 ? "T2 pressure" : "Even",
      reasons: incomplete
        ? [!h1 ? "T1 carry not yet picked" : "", !h2 ? "T2 offlaner not yet picked" : ""].filter(Boolean)
        : [
            d > 12  ? "T1 carry has early scale edge" :
            d < -12 ? "T2 offlaner creates lane pressure" :
                      "Safe lane is close — support play decides",
          ],
    });
  }

  // Mid lane: T1 pos 2 vs T2 pos 2
  {
    const h1 = heroAt(t1, pos1, 2);
    const h2 = heroAt(t2, pos2, 2);
    const incomplete = !h1 || !h2;
    const a1 = heroAxesAt(h1, 10) ?? { fight: 25, pickoff: 25 };
    const a2 = heroAxesAt(h2, 10) ?? { fight: 25, pickoff: 25 };
    const p1 = a1.fight + a1.pickoff;
    const p2 = a2.fight + a2.pickoff;
    const d = p1 - p2;
    result.push({
      lane: "Mid",
      incomplete,
      label: incomplete ? "TBD" : d > 12 ? "T1 mid" : d < -12 ? "T2 mid" : "Contested",
      reasons: incomplete
        ? [!h1 ? "T1 mid not yet picked" : "", !h2 ? "T2 mid not yet picked" : ""].filter(Boolean)
        : [
            d > 12  ? "T1 mid hero has higher early threat" :
            d < -12 ? "T2 mid hero wins the early lane" :
                      "Rune control and bottle timing are key",
          ],
    });
  }

  // Off lane: T1 offlaner (pos 3) vs T2 carry (pos 1)
  {
    const h1 = heroAt(t1, pos1, 3);
    const h2 = heroAt(t2, pos2, 1);
    const incomplete = !h1 || !h2;
    const a1 = heroAxesAt(h1, 10) ?? { fight: 25, push: 20 };
    const a2 = heroAxesAt(h2, 10) ?? { fight: 25, scale: 20 };
    const p1 = a1.fight + a1.push;
    const p2 = a2.fight + a2.scale;
    const d = p1 - p2;
    result.push({
      lane: "Off",
      incomplete,
      label: incomplete ? "TBD" : d > 12 ? "T1 off threat" : d < -12 ? "T2 scales free" : "Risk/Reward",
      reasons: incomplete
        ? [!h1 ? "T1 offlaner not yet picked" : "", !h2 ? "T2 carry not yet picked" : ""].filter(Boolean)
        : [
            d > 12  ? "T1 offlaner can contest T2 carry" :
            d < -12 ? "T2 carry can farm safely and scale" :
                      "Aggressive supports could flip this lane",
          ],
    });
  }

  return result;
}

function computeSpikes(t1, t2) {
  const MINS = [10, 15, 20, 25, 30, 35];
  const peakMinute = (team) => {
    if (!team.length) return null;
    let maxVal = -1, maxMin = 20;
    for (const m of MINS) {
      const a = teamAxesAt(team, m);
      const v = (a.fight || 0) + (a.pickoff || 0);
      if (v > maxVal) { maxVal = v; maxMin = m; }
    }
    return maxMin;
  };

  const spikes = [];
  const t1Peak = peakMinute(t1);
  const t2Peak = peakMinute(t2);

  if (t1Peak != null) {
    spikes.push({
      minute: t1Peak,
      label: t1Peak <= 15 ? "T1 early surge" : t1Peak <= 22 ? "T1 mid peak" : "T1 late peak",
    });
  }
  if (t2Peak != null) {
    spikes.push({
      minute: t2Peak,
      label: t2Peak <= 15 ? "T2 early surge" : t2Peak <= 22 ? "T2 mid peak" : "T2 late peak",
    });
  }

  return spikes.sort((a, b) => a.minute - b.minute);
}

// ─────────────────────────────────────────────────────────────────────────────

app.post("/storyboard", async (req, res) => {
  try {
    const input = StoryInput.parse(req.body || {});
    const minute = input.minute ?? 15;
    const t1 = input.teams.team1 || [];
    const t2 = input.teams.team2 || [];

    // positions: keep provided roles if any, else default to 1..5
    const positions = {
      team1: (input.roles.team1 || [null, null, null, null, null])
        .slice(0, 5)
        .map((r, i) => r ?? i + 1),
      team2: (input.roles.team2 || [null, null, null, null, null])
        .slice(0, 5)
        .map((r, i) => r ?? i + 1),
    };

    const compTeam1 = teamAxesAt(t1, minute);
    const compTeam2 = teamAxesAt(t2, minute);

    // series for charts
    const series1 = series(t1);
    const series2 = series(t2);

    // objective windows: push diff >= 20 sustained across a 5-min window
    const windows = [];
    for (let m = 5; m <= 35; m += 5) {
      const d = (series1.push[m] || 0) - (series2.push[m] || 0);
      if (Math.abs(d) >= 20) {
        windows.push({
          start: m,
          end: m + 5,
          label: d > 0 ? "T1 Push Window" : "T2 Push Window",
        });
      }
    }

    const lanes = computeLanes(t1, positions.team1, t2, positions.team2);
    const spikes = computeSpikes(t1, t2);

    res.json({
      positions,
      composition: { team1: compTeam1, team2: compTeam2 },
      windows,
      lanes,
      spikes,
      __series: { team1: series1, team2: series2 }, // used by client TimingChart
    });
  } catch (e) {
    console.error("[storyboard] error", e);
    // soft-fail to avoid 500s
    res.status(200).json({
      error: String(e?.message || e),
      positions: { team1: [1, 2, 3, 4, 5], team2: [1, 2, 3, 4, 5] },
      composition: { team1: {}, team2: {} },
      windows: [],
      lanes: [],
      spikes: [],
    });
  }
});

// POST /admin/seed/positions?overwrite=true  — apply seed-positions.json to the DB
// Without overwrite: only inserts rows that don't already exist (INSERT OR IGNORE)
// With overwrite=true: clears all existing rows first
app.post("/admin/seed/positions", (req, res) => {
  try {
    const seedPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "data/seed-positions.json"
    );
    const seedData = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    const db = getDb();
    const overwrite = req.query.overwrite === "true";
    if (overwrite) db.prepare("DELETE FROM hero_positions").run();
    const ins = db.prepare(
      "INSERT OR IGNORE INTO hero_positions (hero_id, position, tier) VALUES (?, ?, ?)"
    );
    let inserted = 0;
    db.transaction(() => {
      for (const row of seedData) {
        const info = ins.run(row.hero_id, row.position, row.tier ?? 0);
        inserted += info.changes;
      }
    })();
    res.json({ ok: true, total: seedData.length, inserted, overwrite });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/admin/opendota/sync", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 0);
    let { heroes, matrix } = await syncOpenDotaAndBuildMatrices(limit);
    __MATRIX_BUNDLE = matrix;
    req.app.locals.matrixTopK = {
      topAllies: matrix.topAllies,
      topOpponents: matrix.topOpponents,
      _meta: {
        schema: "matrix-topk/v1",
        generatedAt: matrix.date,
        source: "OpenDota",
      },
    };
    res.json({ ok: true, date: matrix.date, heroes: heroes.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/admin/opendota/sync-and-reload", async (req, res) => {
  try {
    const { matrix } = await syncOpenDotaAndBuildMatrices();
    const { topAllies, topOpponents, topCounteredBy } = matrix;
    __MATRIX_BUNDLE = matrix;
    res.json({ ok: true, heroes: Object.keys(topAllies || {}).length });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// helper to load latest snapshot on boot
function loadLatestMatrixSnapshot() {
  try {
    const dir = path.resolve(process.cwd(), "data", "snapshots");
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("matrix_"))
      .sort()
      .reverse();
    if (files.length) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
      __MATRIX_BUNDLE = j;
      console.log("[matrix] loaded", files[0]);
    }
  } catch (e) {
    console.warn("[matrix] no snapshot yet");
  }
}
loadLatestMatrixSnapshot();

app.get("/matrix/raw", (req, res) => {
  if (!__MATRIX_BUNDLE)
    return res.status(503).json({ error: "matrix not ready" });
  res.json({
    date: __MATRIX_BUNDLE.date,
    hasWith: !!__MATRIX_BUNDLE.withMatrix,
    hasVs: !!__MATRIX_BUNDLE.vsMatrix,
  });
});

app.listen(PORT, () => log.info("API on :" + PORT));
