import { useMetaStatus, useSyncHot } from "@/lib/api-hooks";
import React from "react";

function timeAgo(iso?: string | null) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export default function StatusStrip() {
  const { data, isLoading, error, refetch, isFetching } = useMetaStatus();
  const { mutateAsync: syncHot, isPending: syncing } = useSyncHot();

  const loaded = data?.matrix?.loaded;
  const heroes = data?.matrix?.heroes ?? 0;
  const genAt = data?.matrix?.generatedAt ?? null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderBottom: "1px solid #2b2f36",
        background: "#0f141a",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          title={loaded ? "Matrix loaded" : "Matrix missing"}
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: loaded ? "#2ea043" : "#f85149",
            boxShadow: loaded ? "0 0 0 2px #2ea04333" : "0 0 0 2px #f8514933",
          }}
        />
        <strong style={{ fontSize: 13 }}>API</strong>
        {isLoading ? (
          <span style={{ fontSize: 12, opacity: 0.7 }}>checking…</span>
        ) : error ? (
          <span style={{ fontSize: 12, color: "#f85149" }}>unreachable</span>
        ) : (
          <span style={{ fontSize: 12, opacity: 0.9 }}>
            Matrix: {loaded ? `${heroes} heroes` : "not loaded"}, gen{" "}
            {timeAgo(genAt)}
          </span>
        )}
        {isFetching && (
          <span style={{ fontSize: 11, opacity: 0.6 }}>(refreshing)</span>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button
          onClick={() => refetch()}
          style={{
            padding: "6px 10px",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "transparent",
            color: "#e6edf3",
          }}
        >
          Refresh
        </button>
        <button
          onClick={async () => {
            await syncHot();
            refetch();
          }}
          disabled={syncing}
          title="Run OpenDota sync & reload server matrix (dev shortcut)"
          style={{
            padding: "6px 10px",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "transparent",
            color: "#58a6ff",
          }}
        >
          {syncing ? "Syncing…" : "Sync & Reload"}
        </button>
      </div>
    </div>
  );
}
