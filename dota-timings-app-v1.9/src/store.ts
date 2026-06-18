import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// types
export type Hero = {
  id: number;
  localized_name: string;
  img: string;
  icon: string;
  roles?: string[];
  // stats (available after server restart)
  primary_attr?: "str" | "agi" | "int" | "all" | null;
  attack_type?: "Melee" | "Ranged" | null;
  base_str?: number | null;
  base_agi?: number | null;
  base_int?: number | null;
  str_gain?: number | null;
  agi_gain?: number | null;
  int_gain?: number | null;
  attack_range?: number | null;
  move_speed?: number | null;
  attack_rate?: number | null;
  base_armor?: number | null;
  base_health_regen?: number | null;
  base_mana_regen?: number | null;
  cm_enabled?: boolean | null;
};
export type Profile = {
  id: string;
  hero_id: number;
  name: string;
  positions: number[];
  tags: string[];
  curve: Record<string, number[]>;
};
export type Pick = {
  hero_id: number;
  profile?: Profile | null;
  role?: number | null;
  roleManual?: boolean; // true = user explicitly assigned this role
};

type TopK = Record<number, { id: number; score: number }[]>;
type MetaByRole = Record<
  1 | 2 | 3 | 4 | 5,
  { hero_id: number; profile_id: string; role: number; score: number }[]
>;

type MinuteAxes = {
  fight: number;
  pickoff: number;
  push: number;
  rosh?: number;
  scale?: number;
};

type ItemLikely = {
  key: string;
  label: string;
  minute: number;
  effects: Record<string, number>;
  aura?: boolean;
};

type AdvisorSuggestion = {
  hero_id: number;
  name: string;
  icon: string;
  profile?: Profile;
  deltas: MinuteAxes;
  // server returns minute -> axes object (we’ll also accept a plain number for older builds)
  deltasByMinute?: Record<string | number, MinuteAxes | number>;
  reasons?: string[];
  itemsLikely?: ItemLikely[];
};
type Coverage = { tag: string; ok: boolean };

export type Ban = { hero_id: number; team: 1 | 2; skipped?: true };
/** tier: 0=main  1=secondary  2=suboptimal  3=undesirable */
export type PosEntry = { position: number; tier: number };
type DraftSnapshot = { team1: Pick[]; team2: Pick[]; bans: Ban[] };

type State = {
  apiBase: string;
  heroes: Hero[];
  profilesByHero: Record<number, Profile[]>;
  team1: Pick[];
  team2: Pick[];
  bans: Ban[];
  minute: number;
  // advisor & story
  coverage: Coverage[];
  allySuggestions: AdvisorSuggestion[];
  banSuggestions: AdvisorSuggestion[];
  explainRows: any[] | null;
  story: any | null;
  matrix?: { topAllies: TopK; topOpponents: TopK };
  metaByRole?: MetaByRole;
  // hero positions (loaded from DB on init)
  heroPositions: Record<number, PosEntry[]>;
  // gameplay tags per hero (curated + auto-derived, loaded from server on init)
  heroTags: Record<number, string[]>;
  // undo history
  _history: DraftSnapshot[];
  canUndo: boolean;
  // draft mode / active team
  draftMode: "manual" | "cm";
  activeTeam: "team1" | "team2";
  cmSequence: { type: "pick" | "ban"; team: "team1" | "team2" }[] | null;
  cmStep: number;
};
type Actions = {
  init: () => Promise<void>;
  loadPositions: () => Promise<void>;
  setHeroPositions: (m: Record<number, PosEntry[]>) => void;
  clearBoard: () => void;
  pickHero: (id: number, forceTeam?: 1 | 2) => void;
  banHero: (id: number, forceTeam?: 1 | 2) => void;
  removeBan: (heroId: number) => void;
  skipBan: () => void;
  replacePickAt: (team: 1 | 2, idx: number, heroId: number) => void;
  undo: () => void;
  setDraftMode: (mode: "manual" | "cm", firstPick?: "team1" | "team2") => Promise<void>;
  setMinute: (minute: number) => void;
  setRoleForPick: (team: 1 | 2, idx: number, pos: number) => void;
  runAdvisor: () => Promise<void>;
  explain: (heroId: number) => Promise<void>;
  buildStory: () => Promise<void>;
  applySuggestedPositions: () => void;
  loadMatrix: () => Promise<void>;
  loadMeta: () => Promise<void>;
  contextScoreFor: (heroId: number) => number;
  contextContribFor: (
    heroId: number,
    limit?: number
  ) => {
    allies: { id: number; score: number }[];
    enemies: { id: number; score: number }[];
  };
  enemyGainIfTheyPick: (heroId: number) => number;
};

function _bestRole(
  heroId: number,
  heroPositions: Record<number, PosEntry[]>,
  takenRoles: (number | null)[]
): number | null {
  const positions = heroPositions[heroId] ?? [];
  if (!positions.length) return null;
  const taken = new Set(takenRoles.filter(Boolean) as number[]);
  // Prefer main (tier 0), then secondary (tier 1) — only if the slot is free
  for (const tier of [0, 1]) {
    const p = positions.find((e) => e.tier === tier && !taken.has(e.position));
    if (p) return p.position;
  }
  // All preferred roles are taken — leave unassigned rather than creating a duplicate
  return null;
}

// How well a hero fits a given position — lower score is better.
function _roleScore(heroId: number, role: number, heroPositions: Record<number, PosEntry[]>): number {
  const entry = (heroPositions[heroId] ?? []).find((e) => e.position === role);
  if (!entry) return 10; // no DB data — last resort but still assignable
  return entry.tier;     // 0=main, 1=secondary, 2=suboptimal, 3=undesirable
}

// Re-resolve auto-assigned roles for a team.
// Step 1: manual picks are locked in as reserved.
// Step 2: auto picks are greedily filled (tier 0/1 preferred, skip taken slots).
// Step 3: on a full 5-hero team, any hero still null is assigned an uncovered role
//         using an exhaustive best-fit search (min total tier score across all permutations).
function _resolveTeamRoles(picks: Pick[], heroPositions: Record<number, PosEntry[]>): Pick[] {
  const result: Pick[] = [...picks];

  // Step 1 + 2: greedy pass — manual locks first, then auto-assign in order
  const taken: (number | null)[] = result.filter((p) => p.roleManual).map((p) => p.role ?? null);
  for (let i = 0; i < result.length; i++) {
    if (result[i].roleManual) continue;
    const best = _bestRole(result[i].hero_id, heroPositions, taken);
    result[i] = { ...result[i], role: best };
    if (best != null) taken.push(best);
  }

  // Step 3: fill remaining null roles on a complete team
  if (result.length === 5) {
    const covered = new Set(result.map((p) => p.role).filter((r): r is number => r != null));
    const uncovered = [1, 2, 3, 4, 5].filter((r) => !covered.has(r));
    const unassigned = result.map((p, i) => (p.role == null ? i : -1)).filter((i) => i >= 0);

    if (uncovered.length > 0 && unassigned.length > 0) {
      const n = Math.min(unassigned.length, uncovered.length);
      const roles = uncovered.slice(0, n);

      // Exhaustive search over all role permutations (max 5! = 120)
      let bestTotal = Infinity;
      let bestPerm  = roles.slice();

      const permute = (rem: number[], chosen: number[]) => {
        if (chosen.length === n) {
          let total = 0;
          for (let i = 0; i < n; i++)
            total += _roleScore(result[unassigned[i]].hero_id, chosen[i], heroPositions);
          if (total < bestTotal) { bestTotal = total; bestPerm = chosen.slice(); }
          return;
        }
        for (let i = 0; i < rem.length; i++)
          permute([...rem.slice(0, i), ...rem.slice(i + 1)], [...chosen, rem[i]]);
      };
      permute(roles, []);

      for (let i = 0; i < n; i++)
        result[unassigned[i]] = { ...result[unassigned[i]], role: bestPerm[i] };
    }
  }

  return result;
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
  apiBase: import.meta.env.VITE_API_BASE || "http://localhost:8787",
  heroes: [],
  profilesByHero: {},
  team1: [],
  team2: [],
  bans: [],
  minute: 15,
  coverage: [],
  allySuggestions: [],
  banSuggestions: [],
  explainRows: null,
  story: null,
  matrix: undefined,
  metaByRole: undefined,
  _history: [],
  canUndo: false,
  draftMode: "manual",
  activeTeam: "team1",
  cmSequence: null,
  cmStep: 0,
  heroPositions: {},
  heroTags: {},

  async init() {
    const base = get().apiBase;
    const [h, p, pos, tags] = await Promise.all([
      fetch(base + "/constants/heroes").then((r) => r.json()),
      fetch(base + "/presets").then((r) => r.json()),
      fetch(base + "/heroes/positions").then((r) => r.json()).catch(() => ({ positions: {} })),
      fetch(base + "/heroes/tags").then((r) => r.json()).catch(() => ({ tags: {} })),
    ]);
    set({ heroes: h.heroes, profilesByHero: p.profilesByHero, heroPositions: pos.positions ?? {}, heroTags: tags.tags ?? {} });
  },

  async loadPositions() {
    const base = get().apiBase;
    const j = await fetch(base + "/heroes/positions").then((r) => r.json());
    set({ heroPositions: j.positions ?? {} });
  },

  setHeroPositions(m) {
    set({ heroPositions: m });
  },
  async loadMatrix() {
    const base = get().apiBase;
    const r = await fetch(base + "/matrix/topk?k=50");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "matrix failed");
    set({ matrix: j });
  },

  // Our team context: sum ally synergy minus enemy opposition
  contextScoreFor(heroId: number) {
    const m = get().matrix;
    if (!m) return 0;
    const allyIds = get().team1.map((p) => p.hero_id);
    const enemyIds = get().team2.map((p) => p.hero_id);
    const sum = (arr: { id: number; score: number }[], ids: number[]) =>
      arr.reduce((acc, e) => acc + (ids.includes(e.id) ? e.score : 0), 0);

    const allies = m.topAllies[heroId] || [];
    const opps = m.topOpponents[heroId] || [];
    return sum(allies, allyIds) - sum(opps, enemyIds);
  },

  // Top contributors (who helps/hurts this hero the most in current draft)
  contextContribFor(heroId: number, limit = 3) {
    const m = get().matrix;
    if (!m) return { allies: [], enemies: [] };
    const allyIds = new Set(get().team1.map((p) => p.hero_id));
    const enemyIds = new Set(get().team2.map((p) => p.hero_id));
    const allies = (m.topAllies[heroId] || [])
      .filter((x) => allyIds.has(x.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    const enemies = (m.topOpponents[heroId] || [])
      .filter((x) => enemyIds.has(x.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { allies, enemies };
  },

  // How much THEY would gain if they pick this hero (for deny/ban)
  enemyGainIfTheyPick(heroId: number) {
    const m = get().matrix;
    if (!m) return 0;
    const theirIds = get().team2.map((p) => p.hero_id); // enemy current picks as allies
    const ourIds = get().team1.map((p) => p.hero_id); // we become the opponents

    const sum = (arr: { id: number; score: number }[], ids: number[]) =>
      arr.reduce((acc, e) => acc + (ids.includes(e.id) ? e.score : 0), 0);

    const allies = m.topAllies[heroId] || [];
    const opps = m.topOpponents[heroId] || [];
    return sum(allies, theirIds) - sum(opps, ourIds);
  },
  async loadMeta() {
    const r = await fetch(get().apiBase + "/meta");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "meta failed");
    set({ metaByRole: j.meta });
  },

  // contextScoreFor(heroId: number) {
  //   const m = get().matrix;
  //   if (!m) return 0;
  //   const allyIds = get().team1.map((p) => p.hero_id); // your team
  //   const enemyIds = get().team2.map((p) => p.hero_id);
  //   const allies = m.topAllies[heroId] || [];
  //   const opps = m.topOpponents[heroId] || [];
  //   const sum = (arr: { id: number; score: number }[], ids: number[]) =>
  //     arr.reduce((acc, e) => (ids.includes(e.id) ? acc + e.score : acc), 0);
  //   const pos = sum(allies, allyIds);
  //   const neg = sum(opps, enemyIds);
  //   return pos - neg;
  // },

  clearBoard() {
    const s = get();
    set({
      team1: [],
      team2: [],
      bans: [],
      story: null,
      coverage: [],
      allySuggestions: [],
      banSuggestions: [],
      explainRows: null,
      _history: [],
      canUndo: false,
      cmStep: 0,
      activeTeam: s.cmSequence?.[0]?.team ?? "team1",
    });
  },

  pickHero(id, forceTeam?: 1 | 2) {
    const s = get();
    if (
      s.team1.concat(s.team2).some((p) => p.hero_id === id) ||
      s.bans.some((b) => b.hero_id === id)
    )
      return;
    let team: 1 | 2;
    if (s.draftMode === "cm" && s.cmSequence) {
      const step = s.cmSequence[s.cmStep];
      if (!step || step.type !== "pick") return;
      team = step.team === "team1" ? 1 : 2;
    } else {
      const t1 = s.team1.length, t2 = s.team2.length;
      team = forceTeam ?? (t1 <= t2 ? 1 : 2);
    }
    const best = (s.profilesByHero[id] || [])[0] || null;
    const teamArr = team === 1 ? s.team1 : s.team2;
    if (teamArr.length >= 5) return;
    const rawSlot = { hero_id: id, profile: best, role: null as number | null, roleManual: false };
    const rawTeam1 = team === 1 ? [...s.team1, rawSlot] : s.team1;
    const rawTeam2 = team === 2 ? [...s.team2, rawSlot] : s.team2;
    const newTeam1 = team === 1 ? _resolveTeamRoles(rawTeam1, s.heroPositions) : rawTeam1;
    const newTeam2 = team === 2 ? _resolveTeamRoles(rawTeam2, s.heroPositions) : rawTeam2;
    if (newTeam1 === s.team1 && newTeam2 === s.team2) return;
    const newCmStep = s.draftMode === "cm" ? s.cmStep + 1 : s.cmStep;
    const history = [...s._history, { team1: s.team1, team2: s.team2, bans: s.bans }];
    const total = newTeam1.length + newTeam2.length;
    const nextActive: "team1" | "team2" =
      s.draftMode === "cm" && s.cmSequence
        ? (s.cmSequence[newCmStep]?.team ?? (total % 2 === 0 ? "team1" : "team2"))
        : total % 2 === 0 ? "team1" : "team2";
    set({ team1: newTeam1, team2: newTeam2, _history: history, canUndo: true, activeTeam: nextActive, cmStep: newCmStep });
  },

  banHero(id, forceTeam?: 1 | 2) {
    const s = get();
    if (
      s.bans.some((b) => b.hero_id === id) ||
      s.team1.concat(s.team2).some((p) => p.hero_id === id)
    )
      return;
    let team: 1 | 2;
    if (s.draftMode === "cm" && s.cmSequence) {
      const step = s.cmSequence[s.cmStep];
      if (!step || step.type !== "ban") return;
      team = step.team === "team1" ? 1 : 2;
    } else {
      team = forceTeam ?? (s.activeTeam === "team2" ? 2 : 1);
    }
    const newCmStep = s.draftMode === "cm" ? s.cmStep + 1 : s.cmStep;
    const nextActive: "team1" | "team2" =
      s.draftMode === "cm" && s.cmSequence
        ? (s.cmSequence[newCmStep]?.team ?? s.activeTeam)
        : s.activeTeam;
    const history = [...s._history, { team1: s.team1, team2: s.team2, bans: s.bans }];
    set({ bans: [...s.bans, { hero_id: id, team }], _history: history, canUndo: true, cmStep: newCmStep, activeTeam: nextActive });
  },

  removeBan(heroId: number) {
    const s = get();
    const history = [...s._history, { team1: s.team1, team2: s.team2, bans: s.bans }];
    set({ bans: s.bans.filter((b) => b.hero_id !== heroId), _history: history, canUndo: true });
  },

  skipBan() {
    const s = get();
    if (s.draftMode !== "cm" || !s.cmSequence) return;
    const step = s.cmSequence[s.cmStep];
    if (!step || step.type !== "ban") return;
    const team: 1 | 2 = step.team === "team1" ? 1 : 2;
    const newCmStep = s.cmStep + 1;
    const nextActive: "team1" | "team2" = s.cmSequence[newCmStep]?.team ?? s.activeTeam;
    const history = [...s._history, { team1: s.team1, team2: s.team2, bans: s.bans }];
    set({ bans: [...s.bans, { hero_id: 0, team, skipped: true }], _history: history, canUndo: true, cmStep: newCmStep, activeTeam: nextActive });
  },

  replacePickAt(team: 1 | 2, idx: number, heroId: number) {
    const s = get();
    const teamArr = team === 1 ? s.team1 : s.team2;
    const otherArr = team === 1 ? s.team2 : s.team1;
    if (!teamArr[idx]) return;
    if (otherArr.some((p) => p.hero_id === heroId)) return;
    if (s.bans.some((b) => b.hero_id === heroId)) return;
    if (teamArr.some((p, i) => p.hero_id === heroId && i !== idx)) return;
    const best = (s.profilesByHero[heroId] || [])[0] || null;
    const rawArr = teamArr.map((p, i) =>
      i === idx
        ? { hero_id: heroId, profile: best, role: null as number | null, roleManual: false }
        : p
    );
    const newArr = _resolveTeamRoles(rawArr, s.heroPositions);
    const history = [...s._history, { team1: s.team1, team2: s.team2, bans: s.bans }];
    set(team === 1
      ? { team1: newArr, _history: history, canUndo: true }
      : { team2: newArr, _history: history, canUndo: true });
  },

  undo() {
    const s = get();
    if (!s._history.length) return;
    const prev = s._history[s._history.length - 1];
    const history = s._history.slice(0, -1);
    const newCmStep = s.draftMode === "cm" && s.cmStep > 0 ? s.cmStep - 1 : s.cmStep;
    const total = prev.team1.length + prev.team2.length;
    const nextActive: "team1" | "team2" =
      s.draftMode === "cm" && s.cmSequence
        ? (s.cmSequence[newCmStep]?.team ?? (total % 2 === 0 ? "team1" : "team2"))
        : total % 2 === 0 ? "team1" : "team2";
    set({
      team1: prev.team1,
      team2: prev.team2,
      bans: prev.bans,
      _history: history,
      canUndo: history.length > 0,
      activeTeam: nextActive,
      cmStep: newCmStep,
    });
  },

  async setDraftMode(mode, firstPick = "team1") {
    const base = get().apiBase;
    if (mode === "cm") {
      const r = await fetch(`${base}/cm/sequence?firstPick=${firstPick}`);
      const j = await r.json();
      set({
        draftMode: "cm",
        cmSequence: j.steps,
        cmStep: 0,
        activeTeam: j.steps?.[0]?.team ?? "team1",
        team1: [],
        team2: [],
        bans: [],
        _history: [],
        canUndo: false,
      });
    } else {
      set({ draftMode: "manual", cmSequence: null, cmStep: 0, activeTeam: "team1" });
    }
  },

  setMinute(m: number) {
    set({ minute: Math.max(0, Math.min(60, m)) });
  },

  setRoleForPick(team, idx, pos) {
    const key = team === 1 ? "team1" : "team2";
    const arr = [...(get() as any)[key]] as Pick[];
    if (!arr[idx]) return;
    if (pos > 0) {
      // Clear this position from any other hero on the team so there's always max 1 per role
      for (let i = 0; i < arr.length; i++) {
        if (i !== idx && arr[i].role === pos) {
          arr[i] = { ...arr[i], role: null, roleManual: false };
        }
      }
      arr[idx] = { ...arr[idx], role: pos, roleManual: true };
    } else {
      // pos=0 → return to auto-assignment
      arr[idx] = { ...arr[idx], role: null, roleManual: false };
    }
    // Re-resolve all auto picks so they fill remaining free slots
    const resolved = _resolveTeamRoles(arr, get().heroPositions);
    set({ [key]: resolved } as any);
  },

  async runAdvisor() {
    const base = get().apiBase;
    const body = {
      minute: get().minute,
      teams: {
        team1: get().team1.map((p) => ({
          hero_id: p.hero_id,
          profile: p.profile,
        })),
        team2: get().team2.map((p) => ({
          hero_id: p.hero_id,
          profile: p.profile,
        })),
      },
      picked: get()
        .team1.concat(get().team2)
        .map((p) => p.hero_id),
      banned: get().bans.filter((b) => !b.skipped).map((b) => b.hero_id),
      roles: {
        team1: get().team1.map((p) => p.role || null),
        team2: get().team2.map((p) => p.role || null),
      },
    };
    const r = await fetch(base + "/advisor/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "advisor failed");
    set({
      coverage: j.coverage || [],
      allySuggestions: j.allySuggestions || [],
      banSuggestions: j.banSuggestions || [],
    });
  },

  async explain(heroId: number) {
    const r = await fetch(get().apiBase + "/advisor/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hero_id: heroId, minute: get().minute }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "explain failed");
    set({ explainRows: j.rows || [] });
  },

  async buildStory() {
    const base = get().apiBase;
    const normalizeTeam = (arr: any[]) =>
      arr.map((p) => ({
        hero_id: p.hero_id,
        profile: p.profile
          ? {
              id: p.profile.id,
              hero_id: p.profile.hero_id,
              positions: Array.isArray(p.profile.positions)
                ? p.profile.positions
                : [],
              tags: Array.isArray(p.profile.tags) ? p.profile.tags : [],
              curve: p.profile.curve || {},
            }
          : null,
      }));
    const body = {
      minute: Math.max(0, Math.min(60, get().minute || 15)),
      teams: {
        team1: normalizeTeam(get().team1),
        team2: normalizeTeam(get().team2),
      },
      roles: {
        team1: [
          ...get().team1.map((p) => p.role ?? null),
          null,
          null,
          null,
          null,
        ].slice(0, 5),
        team2: [
          ...get().team2.map((p) => p.role ?? null),
          null,
          null,
          null,
          null,
        ].slice(0, 5),
      },
    };

    try {
      const r = await fetch(base + "/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "story failed");
      set({ story: j });
    } catch (e: any) {
      console.error("[buildStory] failed", e);
      set({ story: { error: e?.message || String(e) } });
    }
  },
  applySuggestedPositions() {
    const st = get();
    const pos = st.story?.positions;
    if (!pos) return;
    // apply to current picks by index: position value is 1..5
    const t1 = st.team1.map((p, i) => ({
      ...p,
      role: (pos.team1?.[i] ?? p.role) || p.role || null,
    }));
    const t2 = st.team2.map((p, i) => ({
      ...p,
      role: (pos.team2?.[i] ?? p.role) || p.role || null,
    }));
    set({ team1: t1, team2: t2 });
  },
    }),
    {
      name: "dota-draft",
      storage: createJSONStorage(() => localStorage),
      // Only persist the live draft state — everything else is fetched from the server on init
      partialize: (s) => ({
        team1: s.team1,
        team2: s.team2,
        bans: s.bans,
        minute: s.minute,
        draftMode: s.draftMode,
        activeTeam: s.activeTeam,
        cmStep: s.cmStep,
        cmSequence: s.cmSequence,
      }),
    }
  )
);