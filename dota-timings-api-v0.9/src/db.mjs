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
  // Remove old derived-data tables (matchup/synergy data now lives in the JSON snapshot).
  db.exec(`
    DROP TABLE IF EXISTS hero_matchups;
    DROP TABLE IF EXISTS hero_synergies;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hero_positions (
      hero_id    INTEGER NOT NULL,
      position   INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
      tier       INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 3),
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

    CREATE INDEX IF NOT EXISTS idx_guides_hero ON hero_guides(hero_id);
  `);

  // Migration: add tier column if coming from the old is_primary / is_flex schema
  const cols = db.prepare(`PRAGMA table_info(hero_positions)`).all();
  if (!cols.some((c) => c.name === "tier")) {
    db.exec(`ALTER TABLE hero_positions ADD COLUMN tier INTEGER NOT NULL DEFAULT 0`);
    db.exec(`UPDATE hero_positions SET tier = 0 WHERE is_primary = 1`);
    db.exec(`UPDATE hero_positions SET tier = 1 WHERE is_primary = 0 AND is_flex = 1`);
  }

  // Seed positions on first run if the table is empty
  const posCount = db.prepare(`SELECT COUNT(*) AS n FROM hero_positions`).get().n;
  if (posCount === 0) {
    try {
      const seedPath = path.resolve(__dirname, "../data/seed-positions.json");
      const seedData = JSON.parse(fs.readFileSync(seedPath, "utf8"));
      const ins = db.prepare(
        `INSERT OR IGNORE INTO hero_positions (hero_id, position, tier) VALUES (?, ?, ?)`
      );
      db.transaction(() => {
        for (const row of seedData) ins.run(row.hero_id, row.position, row.tier ?? 0);
      })();
      console.log(`[db] Seeded ${seedData.length} hero position entries from seed-positions.json`);
    } catch {
      // seed file missing or malformed — skip silently
    }
  }
}

// ─── tier constants ───────────────────────────────────────────────────────────
// 0 = main  1 = secondary  2 = suboptimal  3 = undesirable

export function getPositions(heroId) {
  return getDb()
    .prepare(`SELECT position, tier FROM hero_positions WHERE hero_id = ? ORDER BY tier, position`)
    .all(heroId);
}

export function setPositions(heroId, positions) {
  const db = getDb();
  const del = db.prepare(`DELETE FROM hero_positions WHERE hero_id = ?`);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO hero_positions (hero_id, position, tier) VALUES (?, ?, ?)`
  );
  db.transaction(() => {
    del.run(heroId);
    for (const { position, tier = 0 } of positions) {
      ins.run(heroId, position, Math.max(0, Math.min(3, tier)));
    }
  })();
}

/** Guides */
export function getGuides(heroId) {
  return getDb()
    .prepare(`SELECT * FROM hero_guides WHERE hero_id = ? ORDER BY created_at DESC`)
    .all(heroId);
}

export function addGuide(heroId, { title, body, author = "anonymous" }) {
  const r = getDb()
    .prepare(`INSERT INTO hero_guides (hero_id, title, body, author) VALUES (?, ?, ?, ?)`)
    .run(heroId, title, body, author);
  return r.lastInsertRowid;
}

export function deleteGuide(id) {
  getDb().prepare(`DELETE FROM hero_guides WHERE id = ?`).run(id);
}

export function dbStats() {
  const db = getDb();
  return {
    positions: db.prepare(`SELECT COUNT(*) AS n FROM hero_positions`).get().n,
    guides:    db.prepare(`SELECT COUNT(*) AS n FROM hero_guides`).get().n,
  };
}
