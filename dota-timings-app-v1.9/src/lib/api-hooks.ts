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
