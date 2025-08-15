import { create } from "zustand";

// types
export type Hero = {
  id: number;
  localized_name: string;
  img: string;
  icon: string;
  roles?: string[];
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

type State = {
  apiBase: string;
  heroes: Hero[];
  profilesByHero: Record<number, Profile[]>;
  team1: Pick[];
  team2: Pick[];
  bans: number[];
  minute: number;
  // advisor & story
  coverage: Coverage[];
  allySuggestions: AdvisorSuggestion[];
  banSuggestions: AdvisorSuggestion[];
  explainRows: any[] | null;
  story: any | null;
  matrix?: { topAllies: TopK; topOpponents: TopK };
  metaByRole?: MetaByRole;
};
type Actions = {
  init: () => Promise<void>;
  clearBoard: () => void;
  pickHero: (id: number) => void;
  banHero: (id: number) => void;
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

export const useStore = create<State & Actions>((set, get) => ({
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

  async init() {
    const base = get().apiBase;
    const [h, p] = await Promise.all([
      fetch(base + "/constants/heroes").then((r) => r.json()),
      fetch(base + "/presets").then((r) => r.json()),
    ]);
    set({ heroes: h.heroes, profilesByHero: p.profilesByHero });
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
    set({
      team1: [],
      team2: [],
      bans: [],
      story: null,
      coverage: [],
      allySuggestions: [],
      banSuggestions: [],
      explainRows: null,
    });
  },

  pickHero(id) {
    const s = get();
    if (
      s.team1.concat(s.team2).some((p) => p.hero_id === id) ||
      s.bans.includes(id)
    )
      return;
    const t1 = s.team1.length,
      t2 = s.team2.length;
    const team: 1 | 2 = t1 <= t2 ? 1 : 2;
    const best = (s.profilesByHero[id] || [])[0] || null;
    const slot = {
      hero_id: id,
      profile: best,
      role: best?.positions?.[0] ?? null,
    };
    if (team === 1 && s.team1.length < 5) set({ team1: [...s.team1, slot] });
    if (team === 2 && s.team2.length < 5) set({ team2: [...s.team2, slot] });
  },

  banHero(id) {
    const s = get();
    if (
      s.bans.includes(id) ||
      s.team1.concat(s.team2).some((p) => p.hero_id === id)
    )
      return;
    set({ bans: [...s.bans, id] });
  },

  setRoleForPick(team, idx, pos) {
    const key = team === 1 ? "team1" : "team2";
    const arr = [...(get() as any)[key]];
    if (!arr[idx]) return;
    arr[idx] = { ...arr[idx], role: pos };
    set({ [key]: arr } as any);
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
      banned: get().bans,
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

  // async buildStory() {
  //   const base = get().apiBase;
  //   const body = {
  //     minute: get().minute,
  //     teams: {
  //       team1: get().team1.map((p) => ({
  //         hero_id: p.hero_id,
  //         profile: p.profile,
  //       })),
  //       team2: get().team2.map((p) => ({
  //         hero_id: p.hero_id,
  //         profile: p.profile,
  //       })),
  //     },
  //     roles: {
  //       team1: get().team1.map((p) => p.role || null),
  //       team2: get().team2.map((p) => p.role || null),
  //     },
  //   };
  //   const r = await fetch(base + "/storyboard", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify(body),
  //   });
  //   const j = await r.json();
  //   if (!r.ok) throw new Error(j.error || "story failed");
  //   set({ story: j });
  // },
}));
