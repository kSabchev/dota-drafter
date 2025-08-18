const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export type ApiError = { status: number; message: string };

export async function fetchJSON<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch {}
    throw { status: res.status, message: msg } as ApiError;
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}
