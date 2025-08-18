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

let __MATRIX_BUNDLE = null; // in-memory copy for fast reads

function etagFor(obj) {
  const json = JSON.stringify(obj);
  return `"W/${crypto.createHash("sha1").update(json).digest("base64")}"`;
}

function getMatrixBundle() {
  // If you already set __MATRIX_BUNDLE when syncing/loading snapshots, reuse it
  try {
    return __MATRIX_BUNDLE || null;
  } catch {
    return null;
  }
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
  blink: {
    label: "Blink",
    effects: { pickoff: +18, fight: +10 },
    class: "mobility",
  },
  bkb: { label: "BKB", effects: { fight: +15, push: +6 }, class: "core" },
  arcane_boots: {
    label: "Arcanes",
    effects: { sustain: +6 },
    class: "economy",
  },
  mekansm: {
    label: "Mek",
    effects: { sustain: +10, defense: +8 },
    class: "aura",
  },
  greaves: {
    label: "Greaves",
    effects: { sustain: +20, defense: +15, push: +6 },
    class: "aura",
  },
  pipe: { label: "Pipe", effects: { defense: +18 }, class: "aura_magic" },
  crimson_guard: {
    label: "Crimson",
    effects: { defense: +14 },
    class: "aura_physical",
  },
  vladmir: { label: "Vlad", effects: { push: +10, rosh: +6 }, class: "aura" },
  assault: {
    label: "AC",
    effects: { tower_damage: +18, push: +10, rosh: +8, defense: +6 },
    class: "aura",
  },
  shivas_guard: {
    label: "Shiva",
    effects: { defense: +12, fight: +8, anti_heal: +1 },
    class: "core",
  },
  radiance: { label: "Radiance", effects: { scale: +8 }, class: "core" },
  aghanim_scepter: {
    label: "Aghs",
    effects: { fight: +8, pickoff: +8 },
    class: "hero_specific",
  },
  aghanim_shard: {
    label: "Shard",
    effects: { pickoff: +6, fight: +4 },
    class: "hero_specific",
  },
};
// auras count once per team for most value (diminishing after first)
const AURA_CLASSES = new Set(["aura", "aura_magic", "aura_physical"]);

function estItemMinute(itemKey, roleHint) {
  // conservative defaults; you can swap to STRATZ/OpenDota later
  const base = {
    blink: roleHint === 3 || roleHint === 2 ? 12 : 14,
    bkb: roleHint === 1 || roleHint === 2 ? 18 : 20,
    greaves: roleHint >= 4 ? 17 : 19,
    pipe: 17,
    crimson_guard: 18,
    vladmir: 12,
    assault: 20,
    shivas_guard: 22,
    radiance: 20,
    aghanim_scepter: 20,
    aghanim_shard: 15,
    mekansm: 14,
    arcane_boots: 8,
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
      }));
    });
    res.json({ heroes });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get("/constants/items", async (req, res) => {
  try {
    const items = await cached("items", async () => {
      const r = await fetch("https://api.opendota.com/api/constants/items");
      const j = await r.json();
      return Object.values(j)
        .filter((i) => i.dname)
        .map((i) => ({
          id: i.id,
          dname: i.dname,
          img: i.img ? "https://cdn.cloudflare.steamstatic.com" + i.img : null,
          cost: i.cost,
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

// 7.34+ CM SEQUENCE (default). Returns a normalized array of steps.
app.get("/cm/sequence", (req, res) => {
  const firstPick = req.query.firstPick === "team2" ? "team2" : "team1";
  const fp = firstPick,
    sp = firstPick === "team1" ? "team2" : "team1";
  const steps = [];

  // Ban Phase 1: per 7.34 change: 7 bans before any pick.
  // Order used here: sp, fp, sp, fp, sp, sp, fp (4 bans for sp, 3 for fp).
  const ban1 = [sp, fp, sp, fp, sp, sp, fp];
  for (const t of ban1) steps.push({ type: "ban", team: t });

  // Pick Phase 1: 1-3-1 (fp first)
  const pick1 = [fp, sp, sp, sp, fp];
  for (const t of pick1) steps.push({ type: "pick", team: t });

  // Ban Phase 2: fp, sp, fp
  const ban2 = [fp, sp, fp];
  for (const t of ban2) steps.push({ type: "ban", team: t });

  // Pick Phase 2: 1-3-1 mirror so totals add up
  const pick2 = [sp, fp, fp, fp, sp];
  for (const t of pick2) steps.push({ type: "pick", team: t });

  // Ban Phase 3: fp, sp, fp, sp
  const ban3 = [fp, sp, fp, sp];
  for (const t of ban3) steps.push({ type: "ban", team: t });

  // Pick Phase 3: fp, sp
  const pick3 = [fp, sp];
  for (const t of pick3) steps.push({ type: "pick", team: t });

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
  // compute axis values every 5 minutes up to 40
  const out = { push: {}, pickoff: {}, fight: {} };
  for (let m = 5; m <= 40; m += 5) {
    const t = teamAxesAt(team, m);
    out.push[m] = t.push;
    out.pickoff[m] = t.pickoff;
    out.fight[m] = t.fight;
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
// function defaultCurveByRole(roles = []) {
//   const base = {
//     fight: [10, 25, 45, 60, 70, 75],
//     pickoff: [10, 25, 45, 60, 70, 75],
//     push: [10, 20, 40, 55, 65, 75],
//     farm: [10, 25, 45, 60, 75, 85],
//     sustain: [5, 15, 30, 45, 60, 70],
//     defense: [10, 25, 40, 55, 70, 80],
//     rosh: [5, 10, 20, 35, 50, 60],
//     scale: [10, 20, 35, 55, 75, 90],
//   };
//   const isCarry = roles.includes("Carry"),
//     isMid = roles.includes("Nuker") || roles.includes("Escape"),
//     isOff = roles.includes("Initiator") || roles.includes("Durable"),
//     isSupp = roles.includes("Support") || roles.includes("Disabler");
//   if (isCarry) {
//     base.farm = blend(base.farm, [10, 30, 60, 85, 95, 100], 0.8);
//     base.fight = blend(base.fight, [5, 15, 35, 65, 80, 90], 0.6);
//     base.push = blend(base.push, [5, 15, 30, 50, 70, 85], 0.5);
//     base.scale = blend(base.scale, [10, 20, 45, 75, 95, 100], 0.7);
//   }
//   if (isMid) {
//     base.fight = blend(base.fight, [15, 45, 70, 75, 80, 85], 0.7);
//     base.pickoff = blend(base.pickoff, [20, 50, 75, 80, 85, 90], 0.7);
//   }
//   if (isOff) {
//     base.fight = blend(base.fight, [20, 45, 65, 75, 80, 85], 0.6);
//     base.defense = blend(base.defense, [20, 40, 60, 75, 85, 90], 0.6);
//     base.push = blend(base.push, [10, 25, 45, 60, 75, 85], 0.5);
//     base.rosh = blend(base.rosh, [5, 10, 25, 45, 55, 65], 0.4);
//   }
//   if (isSupp) {
//     base.fight = blend(base.fight, [25, 55, 65, 60, 55, 50], 0.7);
//     base.sustain = blend(base.sustain, [20, 40, 60, 70, 75, 80], 0.7);
//     base.defense = blend(base.defense, [20, 40, 60, 70, 75, 80], 0.6);
//   }
//   return base;
// }
function defaultCurveByRole(roles = []) {
  const c = defaultCurve();
  // small role biases
  if (roles.includes("Carry")) {
    c.scale = c.scale.map((v) => v + 8);
  }
  if (roles.includes("Support")) {
    c.sustain = c.sustain.map((v) => v + 6);
  }
  if (roles.includes("Initiator")) {
    c.pickoff = c.pickoff.map((v) => v + 10);
    c.fight = c.fight.map((v) => v + 6);
  }
  return c;
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
    const profilesByHero = {};
    for (const h of heroes) {
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
          spikes: [
            { minute: 10, description: "Level 10" },
            { minute: 20, description: "Level 20" },
          ],
          curve: defaultCurveByRole(h.roles || []),
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
    if (Array.isArray(data.picks_bans) && data.picks_bans.length) {
      for (const pb of data.picks_bans) {
        if (pb.is_pick)
          picks.push({ hero_id: pb.hero_id, team: pb.team === 0 ? 1 : 2 });
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

app.post("/advisor/suggest", async (req, res) => {
  try {
    const input = AdvisorInput.parse(req.body);
    const now = input.minute;

    const heroes = await fetchHeroesLite();
    const presetsByHero = await fetchPresets();

    const your = input.teams.team1 || [];
    const enemy = input.teams.team2 || [];

    const yourTags = new Set(your.flatMap((p) => p.profile?.tags || []));
    const enemyTags = new Set(enemy.flatMap((p) => p.profile?.tags || []));

    const coverage = WANT_TAGS.map((t) => ({ tag: t, ok: yourTags.has(t) }));

    const taken = new Set([...(input.picked || []), ...(input.banned || [])]);
    const pool = heroes.filter((h) => !taken.has(h.id));

    // matrix + ids for context
    const matrix = getMatrixBundle() || null;
    const team1Ids = your.map((p) => p.hero_id);
    const team2Ids = enemy.map((p) => p.hero_id);

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

        // likely items
        const likely = [];
        if ((profile.tags || []).includes("initiator")) likely.push("blink");
        if ((profile.tags || []).includes("aura_carrier"))
          likely.push("greaves");
        if ((profile.tags || []).includes("pipe_aura")) likely.push("pipe");
        if ((profile.tags || []).includes("armor_aura")) likely.push("assault");
        if ((profile.tags || []).includes("anti_heal"))
          likely.push("shivas_guard");
        if ((profile.tags || []).includes("core_bkb") || roleHint <= 2)
          likely.push("bkb");

        const itemsLikely = likely
          .filter((k) => ITEMS[k])
          .map((k) => ({
            key: k,
            label: ITEMS[k].label,
            minute: estItemMinute(k, roleHint),
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

        // context (matrix)
        const ctx = contextScoreFor(h.id, team1Ids, team2Ids, matrix);
        score += CTX_WEIGHT * ctx;

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
          contextScore: ctx,
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

        // their likely items
        const roleHint = (best.positions || [])[0] || 2;
        const likely = [];
        if ((best.tags || []).includes("initiator")) likely.push("blink");
        if ((best.tags || []).includes("aura_carrier")) likely.push("greaves");
        if ((best.tags || []).includes("pipe_aura")) likely.push("pipe");
        if ((best.tags || []).includes("armor_aura")) likely.push("assault");
        if ((best.tags || []).includes("core_bkb") || roleHint <= 2)
          likely.push("bkb");
        const itemsLikely = likely
          .filter((k) => ITEMS[k])
          .map((k) => ({
            key: k,
            label: ITEMS[k].label,
            minute: estItemMinute(k, roleHint),
            effects: ITEMS[k].effects,
            aura: AURA_CLASSES.has(ITEMS[k].class),
          }));

        let score = (dv.fight + dv.pickoff + dv.push) / 3 + coverageGain;

        // how much THEY gain in our context
        const enemyCtxGain = enemyGainIfTheyPick(
          h.id,
          team1Ids,
          team2Ids,
          matrix
        );
        score += CTX_WEIGHT * enemyCtxGain;

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

    res.json({
      minute: now,
      coverage,
      teamNeeds,
      allySuggestions: ally,
      banSuggestions: banList,
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
    const curve = defaultCurveByRole(h?.roles || []);
    const mins = [10, 15, 20, 25, minute || 20];
    const axes = ["fight", "pickoff", "push", "rosh", "scale"];
    const rows = mins.map((m) => {
      const o = { minute: m };
      axes.forEach((a) => (o[a] = Math.round(valAt(curve[a], m))));
      return o;
    });
    res.json({ rows });
  } catch (e) {
    log.error(e);
    res.status(400).json({ error: String(e) });
  }
});

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
        return res
          .status(503)
          .json({
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

    const lanes = [
      {
        lane: "Safe",
        label: "Even",
        reasons: ["Farm secured vs mild pressure"],
      },
      { lane: "Mid", label: "Skill/Runes", reasons: ["Rune control matters"] },
      {
        lane: "Off",
        label: "Risk",
        reasons: ["Higher enemy kill threat early"],
      },
    ];

    res.json({
      positions,
      composition: { team1: compTeam1, team2: compTeam2 },
      windows,
      lanes,
      spikes: [
        { minute: 8, label: "Roshan earliest" },
        { minute: 20, label: "Tormentor" },
      ],
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

app.post("/admin/opendota/sync", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 0);
    let { heroes, matrix } = await syncOpenDotaAndBuildMatrices(limit);
    __MATRIX_BUNDLE = matrix;
    res.json({ ok: true, date: matrix.date, heroes: heroes.length });
  } catch (e) {
    console.error(e);
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

app.get("/matrix/topk", (req, res) => {
  if (!__MATRIX_BUNDLE)
    return res
      .status(503)
      .json({ error: "matrix not ready; run /admin/opendota/sync" });
  const k = Math.max(1, Math.min(100, Number(req.query.k) || 50));
  // trim to K on the fly
  const trim = (m) =>
    Object.fromEntries(
      Object.entries(m).map(([hid, arr]) => [hid, arr.slice(0, k)])
    );
  res.json({
    topAllies: trim(__MATRIX_BUNDLE.topAllies),
    topOpponents: trim(__MATRIX_BUNDLE.topOpponents),
  });
});

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
