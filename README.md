Dota Draft & Timings App

Role‑aware Dota 2 draft advisor with timing windows, itemized spikes, synergy/counter scoring, and OpenDota‑powered hero↔hero matrices. Built as two packages:

dota-timings-api-v0.9/ — Node/Express API (advisor, story, presets, OpenDota sync, matrix/meta endpoints)

dota-timings-app-v1.9/ — React + Vite client (draft UI, hero grid, advisor cards, story charts)

Quick start
# 1) clone
git clone https://github.com/kSabchev/dota-drafter.git
cd dota-drafter

# 2) API: install & run
cd dota-timings-api-v0.9
cp .env.example .env             # add your OpenDota key (optional but recommended)
npm install
npm start                         # starts on http://localhost:8787

# (optional) pull OpenDota data to build hero matrices
# (run this once after API is up; can take a bit the first time)
curl -X POST "http://localhost:8787/admin/opendota/sync"

# 3) APP: install & run (in a new terminal)
cd ../dota-timings-app-v1.9
cp .env.example .env             # ensure VITE_API_BASE points to the API
npm install
npm run dev                      # opens http://localhost:5173


You can commit small snapshot JSONs for offline starts, or regenerate anytime with the /admin/opendota/sync route.

What you get

Draft modes: manual (CM sequencing WIP toggle)

Hero grid: local portraits/icons, META sort (role‑aware), pick/ban guards

Advisor:

Ally suggestions + deny/ban (enemy‑gain) lane/role‑aware

Coverage meter + “You lack: …” bullets

ContextScore blended into ranking (synergy with your picks − opposition vs opponents), sourced from OpenDota top‑K matrices

Reasons chips (coverage/synergy/counter), item spike hints (BKB @18, Blink @12), sparklines per minute

Story snapshot: composition bars (push, pickoff, sustain, rosh, scale), timing windows with quick “why now” bullets

QoL: sticky advisor column, active team highlight, clear board + undo (manual)

Repo layout

.
├─ dota-timings-api-v0.9/     # Express API
│  ├─ server.mjs              # routes bootstrap
│  ├─ src/
│  │  ├─ opendota-sync.mjs    # OpenDota fetching + matrices (with EB smoothing)
│  │  └─ ...                  # advisor/story/presets helpers
│  ├─ data/
│  │  └─ snapshots/           # generated matrices/meta snapshots (optional commit)
│  ├─ package.json
│  └─ .env.example
│
├─ dota-timings-app-v1.9/     # React client (Vite + TS)
│  ├─ src/                    # UI code (HeroGrid, TeamPanel, DraftAdvisor, StoryView...)
│  ├─ public/                 # hero portraits/icons (committed)
│  ├─ vite.config.ts, tsconfig.json
│  ├─ package.json
│  └─ .env.example
│
├─ .gitignore
├─ .gitattributes             # (optional) normalize line endings, treat images binary
└─ README.md

Environment
API (dota-timings-api-v0.9/.env)
# OpenDota key (recommended for higher rate limits)
OD_API_KEY=your_opendota_key_here

# Use OpenDota Explorer SQL for "with" pairs (0/1). If off, uses proMatches fallback.
OD_EXPLORER=0

# API port
PORT=8787

# Advisor context weight (how strong matrix context influences ranking)
CTX_WEIGHT=0.25

App (dota-timings-app-v1.9/.env)
# API base URL
VITE_API_BASE=http://localhost:8787


Windows users: use set VAR=value (cmd) or $env:VAR="value" (PowerShell) to set envs temporarily.

Data: OpenDota sync & snapshots

Builds 2 matrices (topK allies and topK opponents) with Empirical‑Bayes smoothing and configurable scoring. Snapshots are saved to dota-timings-api-v0.9/data/snapshots/.

Run a sync:

curl -X POST "http://localhost:8787/admin/opendota/sync"
# optional: limit=25 for a faster test run
curl -X POST "http://localhost:8787/admin/opendota/sync?limit=25"


The API loads the latest snapshot on boot and serves it to the app.

API surface (high‑level)

POST /advisor/suggest

Input: { minute, teams {team1[], team2[]}, picked[], banned[], roles{} }

Output: { coverage[], teamNeeds[], allySuggestions[], banSuggestions[] }
Each suggestion includes deltas, itemsLikely, reasons, and contextScore.

GET /matrix/topk?k=50

Output: { topAllies: { [heroId]: [{id,score}] }, topOpponents: { … } }

Used for Advisor context and the Matrix tab.

POST /admin/opendota/sync

Builds/updates snapshots; also refreshes the in‑memory bundle.

GET /meta (optional if you enabled it)

Role‑aware META ordering built from profile curves (plug in OpenDota hero stats as you wish).

Development scripts

API

npm start    # start on PORT (default 8787)
npm run dev  # if you set up nodemon (optional)


App

npm run dev      # Vite dev server (default 5173)
npm run build    # production build
npm run preview  # preview production build

Tuning the advisor (scoring knobs)

Inside opendota-sync.mjs:

export const FORMULA = {
  eb: { prior_vs: 0.50, alpha_vs: 400, prior_with: 0.52, alpha_with: 400 },
  score: { wLift_vs: 100, wVol_vs: 8, wLift_with: 100, wVol_with: 8 }
}


Increase alpha_* to smooth low‑volume pairs more.

Raise wLift_* to prioritize true lift (quality) vs wVol_* for reliability (volume).

Server CTX_WEIGHT (env) controls how strongly matrix context shifts advisor rankings.

Troubleshooting

fetch … /heroes/{id}/matchups 429/5xx
Use an OD_API_KEY and let the built‑in retry/backoff handle spikes. The sync now skips missing/404 heroes without failing.

Hero portraits missing
Ensure dota-timings-app-v1.9/public/ contains the images and paths in your LocalHeroImg/grid point to the right filenames.

CORS / 404s from the app
Confirm VITE_API_BASE points to http://localhost:8787 and the API is running.

Matrix “not ready”
Run the sync once (/admin/opendota/sync), or commit a recent matrix_YYYYMMDD.json snapshot.
