import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchJSON } from "@/lib/api";

// Shapes (adjust if your server differs)
export type MatrixTopK = {
  topAllies: Record<number, { id: number; score: number }[]>;
  topOpponents: Record<number, { id: number; score: number }[]>;
};

export function useMatrixTopK(k = 50) {
  return useQuery({
    queryKey: ["matrix", "topk", k],
    queryFn: () => fetchJSON<MatrixTopK>(`/matrix/topk?k=${k}`),
    staleTime: 24 * 60 * 60 * 1000, // 24h
  });
}

type AdvisorInput = {
  minute: number;
  teams: { team1: any[]; team2: any[] };
  picked: number[];
  banned: number[];
  roles: { team1: (number | null)[]; team2: (number | null)[] };
  perspective: "team1" | "team2";
};

export function useAdvisorSuggest() {
  return useMutation({
    mutationFn: (body: AdvisorInput) =>
      fetchJSON("/advisor/suggest", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useMetaStatus() {
  return useQuery({
    queryKey: ["meta", "status"],
    queryFn: () =>
      fetchJSON<{
        ok: boolean;
        server: { time: string };
        matrix: {
          loaded: boolean;
          heroes: number;
          generatedAt: string | null;
          source: string | null;
          schema: string;
        };
        profiles: { available: boolean; patch: string | null; count: number };
        version: string;
      }>("/meta/status"),
    staleTime: 30_000,
    refetchInterval: 60_000, // refresh every minute
    refetchOnWindowFocus: false,
  });
}

export function useSyncHot() {
  return useMutation({
    mutationFn: () =>
      fetchJSON<{ ok: boolean; heroes?: number }>(
        "/admin/opendota/sync-and-reload",
        { method: "POST" }
      ),
  });
}

export type HeroMatchup = {
  opponent_id: number;
  wins: number;
  games: number;
  winrate: number;
  score: number;
};
export type HeroSynergy = {
  ally_id: number;
  games: number;
  wr: number;
  score: number;
};

export type HeroMetaEntry = { score: number; pro_pick: number; pro_win: number; pub_pick_hi: number; pub_win_hi: number };

export function useHeroMeta() {
  return useQuery({
    queryKey: ["hero_meta"],
    queryFn: () => fetchJSON<Record<number, HeroMetaEntry>>("/constants/hero_meta"),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useHeroLore() {
  return useQuery({
    queryKey: ["hero_lore"],
    queryFn: () => fetchJSON<Record<number, string>>("/constants/hero_lore"),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useHeroMatchups(heroId: number | null, opts?: { limit?: number; minGames?: number }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.minGames) params.set("minGames", String(opts.minGames));
  return useQuery({
    queryKey: ["hero", heroId, "matchups", opts?.limit, opts?.minGames],
    queryFn: () => fetchJSON<{ hero_id: number; counters: HeroMatchup[]; counteredBy: HeroMatchup[] }>(
      `/heroes/${heroId}/matchups?${params}`
    ),
    enabled: heroId != null,
    staleTime: 30 * 60 * 1000,
  });
}

export function useHeroSynergies(heroId: number | null, opts?: { limit?: number; minGames?: number }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.minGames) params.set("minGames", String(opts.minGames));
  return useQuery({
    queryKey: ["hero", heroId, "synergies", opts?.limit, opts?.minGames],
    queryFn: () => fetchJSON<{ hero_id: number; allies: HeroSynergy[] }>(
      `/heroes/${heroId}/synergies?${params}`
    ),
    enabled: heroId != null,
    staleTime: 30 * 60 * 1000,
  });
}

/** Item builds: Record<position|"generic", string[]> for a single hero */
export type HeroBuilds = Record<string, string[]>;

export function useHeroItems(heroId: number | null) {
  return useQuery({
    queryKey: ["hero", heroId, "items"],
    queryFn: () =>
      fetchJSON<{ hero_id: number; builds: HeroBuilds }>(`/heroes/${heroId}/items`).then((r) => r.builds),
    enabled: heroId != null,
    staleTime: 5 * 60 * 1000,
  });
}

/** All hero item builds in one call – { [heroId]: HeroBuilds } */
export function useAllHeroItems() {
  return useQuery({
    queryKey: ["items", "builds"],
    queryFn: () => fetchJSON<Record<string, HeroBuilds>>("/items/builds"),
    staleTime: 5 * 60 * 1000,
  });
}

/** Curated list of item names that should be built at most once per team */
export function useUniqueItems() {
  return useQuery({
    queryKey: ["items", "unique"],
    queryFn: () => fetchJSON<{ items: string[] }>("/items/unique").then((r) => r.items),
    staleTime: 5 * 60 * 1000,
  });
}

/** Item constants keyed by internal name (e.g. "manta", "power_treads") */
export type ItemEntry = { name: string; id: number; dname: string; img: string | null; cost: number | null };
export function useItemConstants() {
  return useQuery({
    queryKey: ["constants", "items"],
    queryFn: () => fetchJSON<{ items: ItemEntry[] }>("/constants/items").then((r) => {
      const map: Record<string, ItemEntry> = {};
      for (const it of r.items) map[it.name] = it;
      return map;
    }),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

// ─── Hero desire timings ──────────────────────────────────────────────────────
// 5 values per axis: [10min, 15min, 20min, 25min, 30min]

export const DESIRE_KEYS = ["teamfight","pickoff","push","split","objective","farm","early_end","late_scale"] as const;
export type DesireKey = typeof DESIRE_KEYS[number];
export type HeroTimings = Partial<Record<DesireKey, [number,number,number,number,number]>>;

export function useHeroTimings(heroId: number | null) {
  return useQuery({
    queryKey: ["hero", heroId, "timings"],
    queryFn: () =>
      fetchJSON<{ hero_id: number; timings: HeroTimings }>(`/heroes/${heroId}/timings`).then((r) => r.timings),
    enabled: heroId != null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllHeroTimings() {
  return useQuery({
    queryKey: ["heroes", "timings", "all"],
    queryFn: () => fetchJSON<Record<string, HeroTimings>>("/heroes/timings/all"),
    staleTime: 5 * 60 * 1000,
  });
}

// Stub for future use
export function useProfilesForHero(heroId: number, patch = "latest") {
  return useQuery({
    queryKey: ["profiles", "hero", heroId, patch],
    queryFn: () =>
      fetchJSON(`/profiles/hero/${heroId}?patch=${encodeURIComponent(patch)}`),
    enabled: !!heroId,
    staleTime: 60 * 60 * 1000, // 60m
  });
}
