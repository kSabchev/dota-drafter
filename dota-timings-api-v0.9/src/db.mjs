import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../data/dota.db");

let _db = null;

export function getDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _initSchema(_db);
  return _db;
}

function _initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hero_matchups (
      hero_id     INTEGER NOT NULL,
      opponent_id INTEGER NOT NULL,
      wins        INTEGER NOT NULL DEFAULT 0,
      games       INTEGER NOT NULL DEFAULT 0,
      score       REAL    NOT NULL DEFAULT 0,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (hero_id, opponent_id)
    );

    CREATE TABLE IF NOT EXISTS hero_synergies (
      hero_a     INTEGER NOT NULL,
      hero_b     INTEGER NOT NULL,
      games      INTEGER NOT NULL DEFAULT 0,
      wr         REAL    NOT NULL DEFAULT 0,
      score_a    REAL    NOT NULL DEFAULT 0,
      score_b    REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (hero_a, hero_b),
      CHECK (hero_a < hero_b)
    );

    CREATE TABLE IF NOT EXISTS hero_positions (
      hero_id    INTEGER NOT NULL,
      position   INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_flex    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (hero_id, position)
    );

    CREATE TABLE IF NOT EXISTS hero_guides (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      hero_id    INTEGER NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      author     TEXT NOT NULL DEFAULT 'anonymous',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_matchups_opp  ON hero_matchups(opponent_id);
    CREATE INDEX IF NOT EXISTS idx_synergies_b   ON hero_synergies(hero_b);
    CREATE INDEX IF NOT EXISTS idx_guides_hero   ON hero_guides(hero_id);
  `);
}

/** Upsert all vs-matchup rows from allVsRaw + the scored vsMatrix */
export function seedMatchups(allVsRaw, vsMatrix) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO hero_matchups (hero_id, opponent_id, wins, games, score, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(hero_id, opponent_id) DO UPDATE SET
      wins = excluded.wins,
      games = excluded.games,
      score = excluded.score,
      updated_at = excluded.updated_at
  `);
  const run = db.transaction(() => {
    for (const [heroIdStr, arr] of Object.entries(allVsRaw)) {
      const heroId = Number(heroIdStr);
      for (const { vsHeroId, wins, games } of arr) {
        const score = vsMatrix?.[heroId]?.[vsHeroId]?.score ?? 0;
        upsert.run(heroId, vsHeroId, wins, games, score);
      }
    }
  });
  run();
  console.log("[db] hero_matchups seeded");
}

/** Upsert ally-pair synergy rows from withMatrix (symmetric, hero_a < hero_b) */
export function seedSynergies(withMatrix) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO hero_synergies (hero_a, hero_b, games, wr, score_a, score_b, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(hero_a, hero_b) DO UPDATE SET
      games = excluded.games,
      wr = excluded.wr,
      score_a = excluded.score_a,
      score_b = excluded.score_b,
      updated_at = excluded.updated_at
  `);
  const run = db.transaction(() => {
    const seen = new Set();
    for (const [aStr, partners] of Object.entries(withMatrix)) {
      const a = Number(aStr);
      for (const [bStr, cell] of Object.entries(partners)) {
        const b = Number(bStr);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const key = `${lo}-${hi}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const scoreA = withMatrix[lo]?.[hi]?.score ?? 0;
        const scoreB = withMatrix[hi]?.[lo]?.score ?? 0;
        upsert.run(lo, hi, cell.games, cell.wr, scoreA, scoreB);
      }
    }
  });
  run();
  console.log("[db] hero_synergies seeded");
}

/** Top matchups (counters) for a hero — heroes hero_id loses against most */
export function getMatchups(heroId, { limit = 20, minGames = 100 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT
      opponent_id,
      wins,
      games,
      CAST(wins AS REAL) / games AS winrate,
      score
    FROM hero_matchups
    WHERE hero_id = ? AND games >= ?
    ORDER BY score DESC
    LIMIT ?
  `).all(heroId, minGames, limit);
}

/** Top counters against this hero (heroes that beat hero_id) */
export function getCounteredBy(heroId, { limit = 20, minGames = 100 } = {}) {
  const db = getDb();
  // rows where opponent_id = heroId, sorted by opponent's score (how well they do vs heroId)
  return db.prepare(`
    SELECT
      hero_id AS counter_id,
      wins,
      games,
      CAST(wins AS REAL) / games AS winrate,
      score
    FROM hero_matchups
    WHERE opponent_id = ? AND games >= ?
    ORDER BY score DESC
    LIMIT ?
  `).all(heroId, minGames, limit);
}

/** Top synergy partners for a hero */
export function getSynergies(heroId, { limit = 20, minGames = 50 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT
      CASE WHEN hero_a = ? THEN hero_b ELSE hero_a END AS ally_id,
      games,
      wr,
      CASE WHEN hero_a = ? THEN score_a ELSE score_b END AS score
    FROM hero_synergies
    WHERE (hero_a = ? OR hero_b = ?) AND games >= ?
    ORDER BY score DESC
    LIMIT ?
  `).all(heroId, heroId, heroId, heroId, minGames, limit);
}

/** Get / set hero positions */
export function getPositions(heroId) {
  return getDb().prepare(`SELECT position, is_primary, is_flex FROM hero_positions WHERE hero_id = ? ORDER BY position`).all(heroId);
}

export function setPositions(heroId, positions) {
  const db = getDb();
  const del = db.prepare(`DELETE FROM hero_positions WHERE hero_id = ?`);
  const ins = db.prepare(`INSERT OR REPLACE INTO hero_positions (hero_id, position, is_primary, is_flex) VALUES (?, ?, ?, ?)`);
  db.transaction(() => {
    del.run(heroId);
    for (const { position, is_primary = 0, is_flex = 0 } of positions) {
      ins.run(heroId, position, is_primary ? 1 : 0, is_flex ? 1 : 0);
    }
  })();
}

/** Guides */
export function getGuides(heroId) {
  return getDb().prepare(`SELECT * FROM hero_guides WHERE hero_id = ? ORDER BY created_at DESC`).all(heroId);
}

export function addGuide(heroId, { title, body, author = "anonymous" }) {
  const r = getDb().prepare(`INSERT INTO hero_guides (hero_id, title, body, author) VALUES (?, ?, ?, ?)`).run(heroId, title, body, author);
  return r.lastInsertRowid;
}

export function deleteGuide(id) {
  getDb().prepare(`DELETE FROM hero_guides WHERE id = ?`).run(id);
}

export function dbStats() {
  const db = getDb();
  return {
    matchups: db.prepare(`SELECT COUNT(*) AS n FROM hero_matchups`).get().n,
    synergies: db.prepare(`SELECT COUNT(*) AS n FROM hero_synergies`).get().n,
    positions: db.prepare(`SELECT COUNT(*) AS n FROM hero_positions`).get().n,
    guides: db.prepare(`SELECT COUNT(*) AS n FROM hero_guides`).get().n,
  };
}
