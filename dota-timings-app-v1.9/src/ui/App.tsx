import { useEffect, useState } from "react";
import { useStore } from "@/store";
import CreateDraft from "./CreateDraft";
import ImportDraft from "./ImportDraft";
import Heroes from "./Heroes";
import Profiles from "./Profiles";
import Admin from "./Admin";
import ErrorBoundary from "./ErrorBoundary";
import StatusStrip from "./parts/StatusStrip";
import { useMetaStatus } from "@/lib/api-hooks";

type Page = "create" | "import" | "heroes" | "profiles" | "admin";

function ServerOfflineBanner() {
  const { error, isLoading, refetch, isFetching } = useMetaStatus();
  const [dismissed, setDismissed] = useState(false);

  // Auto-restore banner visibility on next outage after a recovery
  useEffect(() => {
    if (!error) setDismissed(false);
  }, [!!error]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !error || dismissed) return null;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        background: "#271c0f",
        borderBottom: "1px solid #d2992255",
        fontSize: 12,
        color: "#e6b45e",
      }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, borderRadius: 999,
        background: "#d2992222", border: "1px solid #d2992244",
        fontSize: 10, fontWeight: 700, flexShrink: 0, color: "#d29922",
      }}>!</span>

      <span style={{ flex: 1 }}>
        <strong style={{ color: "#d29922" }}>API server offline</strong>
        {" — "}
        Advisor, counter picks, composition, and lane analysis are unavailable.
        Hero grid uses cached data.
        Start the server at{" "}
        <span style={{ fontFamily: "monospace", opacity: 0.85, fontSize: 11 }}>localhost:8787</span>
        {" "}to restore full functionality.
      </span>

      <button
        onClick={() => refetch()}
        disabled={isFetching}
        style={{
          padding: "4px 10px", fontSize: 11, borderRadius: 6,
          border: "1px solid #d2992244", background: "transparent",
          color: "#d29922", cursor: isFetching ? "default" : "pointer",
          opacity: isFetching ? 0.5 : 1, flexShrink: 0,
        }}
      >
        {isFetching ? "Checking…" : "Retry"}
      </button>

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          padding: "2px 6px", fontSize: 13, borderRadius: 4,
          border: "none", background: "transparent",
          color: "#8b6020", cursor: "pointer", flexShrink: 0, lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function App() {
  const init = useStore((s) => s.init);
  const [page, setPage] = useState<Page>("create");

  useEffect(() => {
    // Restore saved draft before fetching heroes so picks re-populate correctly
    try {
      const saved = localStorage.getItem("dota.draft");
      if (saved) {
        const s = JSON.parse(saved);
        useStore.setState({
          team1: s.team1 ?? [],
          team2: s.team2 ?? [],
          bans: s.bans ?? [],
          draftMode: s.draftMode ?? "manual",
          cmSequence: s.cmSequence ?? null,
          cmStep: s.cmStep ?? 0,
          activeTeam: s.activeTeam ?? "team1",
          canUndo: false,
          _history: [],
        });
      }
    } catch {}
    init().catch(console.error);
  }, []);

  // Persist draft state to localStorage on every relevant change
  useEffect(() => {
    return useStore.subscribe((state) => {
      try {
        localStorage.setItem("dota.draft", JSON.stringify({
          team1: state.team1,
          team2: state.team2,
          bans: state.bans,
          draftMode: state.draftMode,
          cmSequence: state.cmSequence,
          cmStep: state.cmStep,
          activeTeam: state.activeTeam,
        }));
      } catch {}
    });
  }, []);

  return (
    <ErrorBoundary>
      <div>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 12px",
            borderBottom: "1px solid #30363d",
            background: "#0d1117",
          }}
        >
          <StatusStrip />
          <nav style={{ display: "flex", gap: 8 }}>
            {(["create", "import", "heroes", "profiles", "admin"] as Page[]).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #30363d",
                  background: page === p ? "#161b22" : "#0d1117",
                  color: "#e6edf3",
                }}
              >
                {p === "create" ? "Create Draft"
                  : p === "import" ? "Import Draft"
                  : p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </nav>
          <span style={{ opacity: 0.7 }}>Dota Timings v1.9</span>
        </header>
        <ServerOfflineBanner />
        <main style={{ padding: 12 }}>
          {page === "create" && <CreateDraft />}
          {page === "import" && (
            <ImportDraft onImported={() => setPage("create")} />
          )}
          {page === "heroes" && <Heroes />}
          {page === "profiles" && <Profiles />}
          {page === "admin" && <Admin />}
        </main>
      </div>
    </ErrorBoundary>
  );
}
