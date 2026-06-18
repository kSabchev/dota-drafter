# Dota Draft & Timings App

Role-aware Dota 2 draft advisor with timing windows, item spike tracking, synergy/counter scoring, team composition tags, and OpenDota-powered hero matrices. Built as two packages:

- `dota-timings-api-v0.9/` — Node/Express API + SQLite (advisor, timings, item builds, positions, OpenDota sync)
- `dota-timings-app-v1.9/` — React + Vite client (draft UI, hero grid, advisor, admin panel)

---

## Quick start

```bash
# 1) clone
git clone https://github.com/kSabchev/dota-drafter.git
cd dota-drafter

# 2) API
cd dota-timings-api-v0.9
cp .env.example .env        # add OD_API_KEY (optional, raises rate limits)
npm install
npm run dev                  # http://localhost:8787
# On first run the DB auto-seeds 151 hero position entries and loads hero timing profiles

# 3) App (new terminal)
cd ../dota-timings-app-v1.9
cp .env.example .env        # VITE_API_BASE=http://localhost:8787
npm install
npm run dev                  # http://localhost:5173
```

The app works out of the box — hero positions and timing profiles are pre-seeded on first startup. To get full item build data, run the bulk fetch from the Admin panel (see below).

---

## What you get

### Draft UI
- **Draft board** — pick/ban heroes for Team 1 and Team 2 with drag-and-drop reordering
- **Persistent state** — draft (picks, bans, mode, minute) is saved to `localStorage` via Zustand persist middleware and restored on reload
- **Auto role assignment** — positions (1–5) are auto-assigned after each pick using a 3-step resolver: (1) lock manual overrides, (2) greedy tier-priority assignment, (3) exhaustive permutation search across all unassigned heroes on a full 5-hero team (≤5! = 120 permutations) to find the globally optimal role spread; dashed badge = auto, solid badge = manual override
- **Manual role override** — click any position badge to assign or clear a role; shows tier quality (★ main, ○ secondary, △ suboptimal, ✕ undesirable) and a ↔ swap indicator when a position is already taken
- **Remove bans** — hover over any ban chip to reveal a × overlay; clicking it removes that ban and pushes a history snapshot for undo
- **Team tag bar** — each team panel shows aggregated composition tags (Global, Blink Init, Radiance, Split Push, Flash Farm, Refresher, Phys, Magical) with conflict warnings when a tag exceeds its recommended team count
- **Unique items tracker** — per-team columns aligned with picks, showing the top unique items for each hero's role; within-team item conflicts highlighted in red

### Hero Grid
- Local hero portraits and icons (no external requests)
- META sort (role-aware), pick/ban guards, search filter
- Drag heroes directly onto the draft board slots

### Draft Advisor
Three-tab panel:

**Synergy** — ally suggestions with lane/role-aware scoring, coverage meter, ContextScore blending (synergy + counter-pick value) sourced from OpenDota top-K matrices; reason chips show coverage gaps, synergy score, item spike hints (e.g. Manta @22, BKB @18), and tag conflict penalties

**Counter** — when the opponent has heroes picked, scores every unpicked hero by their matchup win-rate lift against those specific enemies and surfaces the top 10; each entry shows per-enemy matchup chips with win rates colored by advantage (≥5% = red, ≥2% = yellow); transforms the app from composition viewer to an active draft decision tool

**Deny Bans** — heroes ranked by enemy gain if picked, with a "Queue ban" button

Other features:
- **Item builds from hero-items.json** — `itemsLikely` sourced from each hero's OpenDota build data; falls back to profile-tag inference for heroes without data
- **Phase-aware item timings** — items timed against stored phase buckets (`early` ≈ 10–12 min, `mid` ≈ 22 min, `late` ≈ 32 min)
- **Tag conflict penalties** — advisor scores reduced when a candidate would exceed safe team limits; penalty reason shown as a chip

### Story / Storyboard
Three-tab panel (Composition | Timings | Lanes):

**Composition** — axis bars (push, pickoff, sustain, rosh, scale), overall verdict, and partial-draft badge; fires on every pick from the first hero (no 5v5 gate), debounced 350ms

**Timings** — combined view: per-hero desire heatmap (TeamTimingPanel, 10–30m at 5m intervals across 8 axes) above, team-trajectory recharts line chart below with a "Team Trajectory" section divider; Fight/Push mode toggle; objective windows and power-spike annotations

**Lanes** — LaneMatchupPanel hero icon grid above, computed per-lane verdicts (Safe/Mid/Off) below with a "Computed Lane Verdicts" divider; lanes without an assigned hero show as TBD at reduced opacity; verdicts derived from hero axis curves at minute 10

Other features:
- **Partial draft composition** — composition, timing, and lane data updates live as heroes are added; no minimum team size required
- **Computed power spikes** — each team's peak fight+pickoff minute (sweeping 10–35) replaces hardcoded annotations

### Status & offline mode
- **Header status strip** — shows API reachability, matrix loaded/hero count, and last-generated timestamp; polls every 60 seconds
- **Server offline banner** — when the API is unreachable a full-width amber banner appears below the header explaining which features are degraded (advisor, counter picks, composition, lane analysis) and offering a Retry button; the hero grid continues to work from cached localStorage data; the banner auto-dismisses when the server comes back online and can be manually dismissed with ✕

### Admin Panel
- **Seed positions** — merge or overwrite the DB from `seed-positions.json` (useful after DB reset)
- **Bulk item fetch** — streams OpenDota `itemPopularity` data for all 127 heroes via SSE; now also stores per-phase buckets (`early`, `mid`, `late`) alongside the combined `generic` top-10; progress bar with ETA, per-hero results, auto-retry on rate limit; `onlyMissing=true` by default skips already-fetched heroes
- **Unique items editor** — configure which items count as "unique" per position
- **Bulk position editor** — edit hero position tiers in bulk; tier cycle is now linear (empty → Main → Secondary → Suboptimal → Undesirable → remove) rather than circular, so Main can always be re-assigned
- **Per-hero item/position management** — edit builds and positions hero by hero

### Import
- Import a live match by match ID (OpenDota)

---

## Repo layout

```
.
├─ dota-timings-api-v0.9/          # Express API
│  ├─ server.mjs                    # all routes
│  ├─ src/
│  │  ├─ db.mjs                     # SQLite schema + auto-seed
│  │  └─ opendota-sync.mjs          # matrix build with EB smoothing
│  ├─ data/
│  │  ├─ seed-positions.json        # 151 hero position entries (auto-loaded on first run)
│  │  ├─ hero-timings.json          # timing profiles for 68 heroes (8 axes × 5 timepoints)
│  │  ├─ hero-items.json            # item builds per hero: { generic: [...], phases: { early, mid, late } }
│  │  ├─ hero-tags.json             # curated composition tags per hero (global, blink_init, radiance, etc.)
│  │  ├─ unique-items.json          # unique item definitions per position
│  │  └─ snapshots/                 # OpenDota matrix snapshots
│  └─ .env.example
│
├─ dota-timings-app-v1.9/          # React client (Vite + TypeScript)
│  ├─ src/
│  │  ├─ store.ts                   # Zustand store with persist middleware (draft state, hero positions, roles, tags)
│  │  └─ ui/
│  │     ├─ App.tsx                 # tab shell
│  │     ├─ CreateDraft.tsx         # main draft view + unique items tracker
│  │     ├─ Admin.tsx               # admin panel (seed, bulk fetch, editors)
│  │     ├─ Heroes.tsx              # hero browser
│  │     ├─ ImportDraft.tsx         # match import
│  │     └─ parts/                  # HeroGrid, TeamPanel, DraftAdvisor, StoryView, ...
│  ├─ public/                       # hero portraits + icons (committed)
│  └─ .env.example
│
├─ .gitignore
└─ README.md
```

---

## Environment

**API** (`dota-timings-api-v0.9/.env`)

```env
# OpenDota key — optional but recommended for higher rate limits on sync and bulk fetch
OD_API_KEY=your_opendota_key_here

# API port
PORT=8787

# Advisor context weight (matrix influence on ranking)
CTX_WEIGHT=0.25
```

**App** (`dota-timings-app-v1.9/.env`)

```env
VITE_API_BASE=http://localhost:8787
```

---

## Data: item builds

Item builds are fetched from OpenDota's `itemPopularity` endpoint and stored in `data/hero-items.json`. Each hero entry now contains:

```json
"1": {
  "generic": ["power_treads", "manta", "bfury", ...],
  "phases": {
    "early": ["power_treads", "phase_boots", ...],
    "mid":   ["manta", "bfury", "blink", ...],
    "late":  ["butterfly", "heart_of_tarrasque", ...]
  }
}
```

The `phases` object is used by the advisor to estimate item timings (`early` ≈ 10–12 min, `mid` ≈ 22 min, `late` ≈ 32 min) rather than relying on the hardcoded fallback table.

The easiest way to populate builds is the **Bulk Fetch** button in the Admin panel, which streams progress for all 127 heroes. Alternatively, fetch a single hero:

```bash
curl -X POST http://localhost:8787/admin/heroes/1/fetch-items
```

The bulk stream respects OpenDota's rate limit (~60 req/min) with a default 1100ms delay between requests and automatic retries on 429 responses. Re-runs skip heroes that already have data (`onlyMissing=true`). Previously fetched heroes that lack `phases` can be re-fetched with `?onlyMissing=false` to backfill phase data.

---

## Data: OpenDota matrix sync

Builds the ally/opponent top-K matrices with Empirical-Bayes smoothing:

```bash
curl -X POST http://localhost:8787/admin/opendota/sync
# faster test run (25 heroes)
curl -X POST http://localhost:8787/admin/opendota/sync?limit=25
```

Snapshots are saved to `data/snapshots/` and loaded on API boot. Commit a snapshot for offline starts.

---

## API surface

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/advisor/suggest` | Suggest picks/bans; response includes `counterSuggestions` (top-10 by counter score vs current enemy picks) |
| `POST` | `/advisor/explain` | Explain a specific suggestion |
| `GET`  | `/heroes/positions` | All hero position entries from DB |
| `GET`  | `/heroes/tags` | Computed composition tags per hero (curated + auto-derived) |
| `PUT`  | `/heroes/:id/positions` | Set positions for a hero |
| `GET`  | `/heroes/:id/timings` | Timing profile for a hero |
| `GET`  | `/heroes/timings/all` | All timing profiles |
| `GET`  | `/items/builds` | All hero item builds |
| `GET`  | `/items/unique` | Unique item config per position |
| `GET`  | `/matrix/topk` | Top-K ally/opponent matrices |
| `GET`  | `/meta/status` | Server health + DB counts |
| `POST` | `/admin/heroes/:id/fetch-items` | Fetch item build for one hero from OpenDota |
| `GET`  | `/admin/heroes/fetch-all-items` | SSE stream: bulk fetch all hero item builds |
| `POST` | `/admin/seed/positions` | Re-seed hero positions (`?overwrite=true` to replace) |
| `POST` | `/admin/opendota/sync` | Rebuild OpenDota matrices |
| `POST` | `/admin/matrix/reload` | Hot-reload matrix snapshot from disk |
| `POST` | `/storyboard` | Generate story/composition view for a draft |

---

## Composition tags

Hero tags describe gameplay archetypes that matter at the team composition level. They are loaded from `data/hero-tags.json` (curated) and extended automatically at runtime (e.g. `physical` from Carry role, `magical` from Nuker role, `radiance`/`refresher` from build data).

| Tag | Meaning | Conflict limit |
|-----|---------|---------------|
| `global` | Hero has a map-wide presence spell (e.g. Io, Skywrath, WK) | max 2 |
| `blink_init` | Hero initiates with Blink Dagger (e.g. Axe, Enigma, Magnus) | — |
| `radiance` | Hero is a Radiance builder | max 1 |
| `flash_farmer` | Hero needs fast solo farm windows (e.g. AM, Alchemist) | max 2 |
| `split_pusher` | Hero is most effective split-pushing (e.g. NP, Lycan) | — |
| `refresher` | Hero builds Refresher Orb | max 1 |
| `physical` | Team's primary physical damage dealer | — |
| `magical` | Team's primary magical damage dealer | — |

Tags beyond their conflict limit are highlighted in the team tag bar and reduce the hero's advisor score (penalty defined in `TAG_CONFLICTS` in `server.mjs`).

---

## Scoring knobs

Inside `src/opendota-sync.mjs`:

```js
export const FORMULA = {
  eb: { prior_vs: 0.50, alpha_vs: 400, prior_with: 0.52, alpha_with: 400 },
  score: { wLift_vs: 100, wVol_vs: 8, wLift_with: 100, wVol_with: 8 }
}
```

- Increase `alpha_*` to smooth low-volume pairs more aggressively
- Raise `wLift_*` to favour true win-rate lift; raise `wVol_*` to favour high-volume reliability
- `CTX_WEIGHT` env var controls how strongly matrix context shifts advisor rankings

---

## Troubleshooting

**Port 8787 already in use**
A previous `npm run dev` process is still running. Kill it:
```powershell
# PowerShell
$p = (Get-NetTCPConnection -LocalPort 8787).OwningProcess; Stop-Process -Id $p -Force
```

**Bulk fetch returns 429 / rate limited**
The default 1100ms delay should stay under OpenDota's free limit. If you have an `OD_API_KEY`, the limit is higher — set it in `.env`. The endpoint auto-retries once with a 6s backoff before marking a hero as failed.

**Hero portraits missing**
Ensure `dota-timings-app-v1.9/public/` contains portrait images and that `LocalHeroImg` paths match your filenames.

**Server offline banner keeps showing**
The banner uses `useMetaStatus` which polls every 60 seconds. It disappears automatically when the server responds. Click Retry for an immediate re-check. If you intentionally run without the API, dismiss the banner with ✕ — the hero grid still works from cache.

**CORS / 404s from the app**
Confirm `VITE_API_BASE=http://localhost:8787` in the app `.env` and that the API is running.

**Matrix "not ready"**
Run `/admin/opendota/sync` once, or commit a `matrix_YYYYMMDD.json` snapshot to `data/snapshots/`.

**"positions is not iterable" in Admin seed panel**
Upgrade to the current version — this was fixed; the positions endpoint returns a map (`{ positions: { [heroId]: [...] } }`), not a flat array.
