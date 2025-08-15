// src/opendota-sync.mjs
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

/** ============== CONFIG ============== */
const USE_EXPLORER = process.env.OD_EXPLORER === "1"; // set to '1' to use SQL explorer
const SNAP_DIR = path.resolve(process.cwd(), "data", "snapshots");
const DEFAULT_K = 50;
const OD_API_KEY = process.env.OD_API_KEY || null;

// smoothing & scoring config (edit anytime; no code changes needed)
export const FORMULA = {
  eb: {
    // Empirical Bayes smoothing: prior (global WR) and alpha (pseudo-games)
    prior_vs: 0.5,
    alpha_vs: 400,
    prior_with: 0.52,
    alpha_with: 400,
  },
  score: {
    // score = wLift * lift + wVol * log10(games+1)
    wLift_vs: 100,
    wVol_vs: 8,
    wLift_with: 100,
    wVol_with: 8,
  },
};

/** ============== UTIL ============== */
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function ebSmooth(wins, games, prior, alpha) {
  const w = (wins + prior * alpha) / (games + alpha);
  return { wr: w, games };
}
function scoreVs(lift, games) {
  return (
    FORMULA.score.wLift_vs * lift +
    FORMULA.score.wVol_vs * Math.log10((games || 0) + 1)
  );
}
function scoreWith(lift, games) {
  return (
    FORMULA.score.wLift_with * lift +
    FORMULA.score.wVol_with * Math.log10((games || 0) + 1)
  );
}

/** ============== FETCHERS ============== */
export async function fetchHeroes() {
  //   const r = await fetch("https://api.opendota.com/api/constants/heroes");
  const r = await odFetch("https://api.opendota.com/api/constants/heroes");
  if (!r.ok) throw new Error("heroes fetch failed");
  const j = await r.json();
  const arr = Object.values(j).map((h) => ({
    id: h.id,
    name: h.localized_name,
    roles: h.roles || [],
  }));
  return arr.sort((a, b) => a.id - b.id);
}

export async function fetchVsMatchupsFor(heroId) {
  //   const r = await fetch(
  //     `https://api.opendota.com/api/heroes/${heroId}/matchups`
  //   );
  const r = await odFetch(
    `https://api.opendota.com/api/heroes/${heroId}/matchups`,
    { tries: 6, backoffMs: 700 }
  );

  if (!r.ok) {
    if (r.status === 404) return []; // hero has no data yet; skip
    // Any other non-ok handled in odFetch. If we got here, treat as empty
    return [];
  }
  const j = await r.json(); // [{hero_id, games_played, wins}, ...]
  return j.map((x) => ({
    vsHeroId: x.hero_id,
    games: x.games_played,
    wins: x.wins,
  }));
}

export async function fetchAllVsMatchups(heroes) {
  const out = {};
  for (const h of heroes) {
    try {
      // polite delay to avoid 429; tune as needed
      await new Promise((res) => setTimeout(res, 300));
      const arr = await fetchVsMatchupsFor(h.id);
      out[h.id] = arr;
    } catch (e) {
      console.warn(`[matchups] skip hero ${h.id}: ${e?.message || e}`);
      out[h.id] = []; // keep empty so downstream doesn’t blow up
    }
  }
  return out;
}

// ---- Allies via Explorer SQL (preferred if enabled) ----
async function explorerAlliesPairs(days = 30) {
  const sql = `
    SELECT
      h1.hero_id AS a, h2.hero_id AS b,
      COUNT(*) AS games,
      SUM(CASE WHEN player_matches.is_victory THEN 1 ELSE 0 END) AS wins
    FROM player_matches
    JOIN matches ON matches.match_id = player_matches.match_id
    JOIN player_matches AS h2 ON h2.match_id = player_matches.match_id
      AND h2.player_slot < 128 = player_matches.player_slot < 128
      AND h2.player_slot != player_matches.player_slot
    JOIN player_matches AS h1 ON h1.match_id = player_matches.match_id
      AND h1.player_slot = player_matches.player_slot
    WHERE matches.start_time > EXTRACT(EPOCH FROM NOW() - INTERVAL '${days} days')
    GROUP BY a, b
  `;
  const url = `https://api.opendota.com/api/explorer?sql=${encodeURIComponent(
    sql
  )}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("explorer allies fetch failed");
  const j = await r.json();
  return j.rows; // [{a,b,games,wins}, ...]
}

// ---- Allies via proMatches fallback ----
async function proMatchesFallback(pages = 20) {
  // returns array of pro matches with 10 heroes each; we aggregate pair stats
  const all = [];
  for (let i = 0; i < pages; i++) {
    const r = await fetch("https://api.opendota.com/api/proMatches");
    if (!r.ok) break;
    const j = await r.json();
    all.push(...j);
  }
  return all;
}

function aggregateAlliesFromProMatches(matches) {
  // Build two maps: Radiant and Dire pairs
  const map = new Map(); // key "a-b" (sorted), value { games, wins }
  for (const m of matches) {
    const rTeam = [m.radiant_team_id, m.radiant_name]; // not needed
    // heroes are h1..h10; OpenDota returns 'radiant_team', 'dire_team' hero_ids in details,
    // proMatches has radiant_win plus 'radiant_team', 'dire_team' names only.
    // Some proMatches payloads include hero IDs per slot; if missing, skip.
    const rHeroes = [
      m.radiant1,
      m.radiant2,
      m.radiant3,
      m.radiant4,
      m.radiant5,
    ].filter(Boolean);
    const dHeroes = [m.dire1, m.dire2, m.dire3, m.dire4, m.dire5].filter(
      Boolean
    );
    const addPairs = (arr, won) => {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = Math.min(arr[i], arr[j]);
          const b = Math.max(arr[i], arr[j]);
          const key = `${a}-${b}`;
          const cur = map.get(key) || { games: 0, wins: 0 };
          cur.games += 1;
          cur.wins += won ? 1 : 0;
          map.set(key, cur);
        }
      }
    };
    if (rHeroes.length === 5) addPairs(rHeroes, !!m.radiant_win);
    if (dHeroes.length === 5) addPairs(dHeroes, !m.radiant_win);
  }
  const rows = [];
  for (const [key, val] of map.entries()) {
    const [a, b] = key.split("-").map(Number);
    rows.push({ a, b, games: val.games, wins: val.wins });
  }
  return rows;
}

/** Build WITH matrix (allies) from either Explorer or proMatches fallback */
export async function buildWithMatrix(heroes, { days = 30 } = {}) {
  let rows;
  if (USE_EXPLORER) {
    rows = await explorerAlliesPairs(days);
  } else {
    const pro = await proMatchesFallback(25);
    rows = aggregateAlliesFromProMatches(pro);
  }
  // assemble symmetric matrix
  const withMatrix = {};
  const base = FORMULA.eb;
  // compute hero baselines (overall with-WR proxy): average wr across all partners
  const baselineWins = {},
    baselineGames = {};
  for (const r of rows) {
    baselineWins[r.a] = (baselineWins[r.a] || 0) + r.wins;
    baselineGames[r.a] = (baselineGames[r.a] || 0) + r.games;
    baselineWins[r.b] = (baselineWins[r.b] || 0) + r.wins;
    baselineGames[r.b] = (baselineGames[r.b] || 0) + r.games;
  }
  const baselineWr = {};
  for (const h of heroes) {
    const g = baselineGames[h.id] || 0,
      w = baselineWins[h.id] || 0;
    baselineWr[h.id] = g > 0 ? w / g : base.prior_with;
  }

  for (const h of heroes) withMatrix[h.id] = {};
  for (const r of rows) {
    const { a, b, games, wins } = r;
    const sm = ebSmooth(wins, games, base.prior_with, base.alpha_with);
    const liftA = sm.wr - baselineWr[a];
    const liftB = sm.wr - baselineWr[b];
    const sA = scoreWith(liftA, games);
    const sB = scoreWith(liftB, games);
    withMatrix[a][b] = { games, wr: sm.wr, lift: liftA, score: sA };
    withMatrix[b][a] = { games, wr: sm.wr, lift: liftB, score: sB };
  }
  return withMatrix;
}

/** Build VS matrix from /heroes/{id}/matchups */
export async function buildVsMatrix(heroes, allVsRaw) {
  const vsMatrix = {};
  const base = FORMULA.eb;
  // baseline per hero = average wr vs field
  const baseline = {};
  for (const h of heroes) {
    const arr = allVsRaw[h.id] || [];
    let W = 0,
      G = 0;
    for (const x of arr) {
      W += x.wins;
      G += x.games;
    }
    baseline[h.id] = G > 0 ? W / G : base.prior_vs;
  }

  for (const h of heroes) vsMatrix[h.id] = {};
  for (const h of heroes) {
    const arr = allVsRaw[h.id] || [];
    for (const x of arr) {
      const sm = ebSmooth(x.wins, x.games, base.prior_vs, base.alpha_vs);
      const lift = sm.wr - baseline[h.id];
      const score = scoreVs(lift, x.games);
      vsMatrix[h.id][x.vsHeroId] = { games: x.games, wr: sm.wr, lift, score };
    }
  }
  return vsMatrix;
}

/** Build top‑K maps from matrices */
export function buildTopK(heroes, vsMatrix, withMatrix, k = DEFAULT_K) {
  const topOpponents = {};
  const topAllies = {};
  for (const h of heroes) {
    const vs = Object.entries(vsMatrix[h.id] || {}).map(([id, cell]) => ({
      id: Number(id),
      score: Math.round(cell.score),
    }));
    const al = Object.entries(withMatrix?.[h.id] || {}).map(([id, cell]) => ({
      id: Number(id),
      score: Math.round(cell.score),
    }));
    vs.sort((a, b) => b.score - a.score);
    al.sort((a, b) => b.score - a.score);
    topOpponents[h.id] = vs.slice(0, k);
    topAllies[h.id] = al.slice(0, k);
  }
  return { topOpponents, topAllies };
}

/** Main sync: fetch raw, compute matrices, write snapshots, return latest bundle */
// export async function syncOpenDotaAndBuildMatrices() {
//   ensureDir(SNAP_DIR);
//   const date = todayStr();
//   const heroes = await fetchHeroes();
//   const allVsRaw = await fetchAllVsMatchups(heroes);
//   const withMatrix = await buildWithMatrix(heroes, { days: 30 });
//   const vsMatrix = await buildVsMatrix(heroes, allVsRaw);
//   const topk = buildTopK(heroes, vsMatrix, withMatrix, DEFAULT_K);

//   const rawSnap = { date, heroes, allVsRaw };
//   fs.writeFileSync(
//     path.join(SNAP_DIR, `open_dota_raw_${date}.json`),
//     JSON.stringify(rawSnap)
//   );

//   const matrixSnap = { date, vsMatrix, withMatrix, ...topk };
//   fs.writeFileSync(
//     path.join(SNAP_DIR, `matrix_${date}.json`),
//     JSON.stringify(matrixSnap)
//   );

//   return { heroes, matrix: matrixSnap };
// }

export async function syncOpenDotaAndBuildMatrices(limit = 0) {
  ensureDir(SNAP_DIR);
  const date = todayStr();
  let heroes = await fetchHeroes();
  if (limit > 0) heroes = heroes.slice(0, limit); // for quick test

  const allVsRaw = await fetchAllVsMatchups(heroes);
  const withMatrix = await buildWithMatrix(heroes, { days: 30 });
  const vsMatrix = await buildVsMatrix(heroes, allVsRaw);
  const topk = buildTopK(heroes, vsMatrix, withMatrix, DEFAULT_K);

  const rawSnap = { date, heroes, allVsRaw };
  fs.writeFileSync(
    path.join(SNAP_DIR, `open_dota_raw_${date}.json`),
    JSON.stringify(rawSnap)
  );

  const matrixSnap = { date, vsMatrix, withMatrix, ...topk };
  fs.writeFileSync(
    path.join(SNAP_DIR, `matrix_${date}.json`),
    JSON.stringify(matrixSnap)
  );

  return { heroes, matrix: matrixSnap };
}
async function odFetch(url, { tries = 5, backoffMs = 600 } = {}) {
  // add api_key if provided
  if (OD_API_KEY) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}api_key=${encodeURIComponent(OD_API_KEY)}`;
  }

  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (r.ok) return r;
      // handle 404: treat as empty dataset, don’t fail the whole sync
      if (r.status === 404) return r;
      // handle 429/5xx: retry with backoff
      if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
        await new Promise((res) =>
          setTimeout(res, backoffMs * Math.pow(1.8, i))
        );
        continue;
      }
      // other non-ok: throw
      const text = await r.text();
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, backoffMs * Math.pow(1.8, i)));
    }
  }
  throw lastErr || new Error("odFetch failed");
}
