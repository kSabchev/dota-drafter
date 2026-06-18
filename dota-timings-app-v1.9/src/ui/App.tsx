import { useEffect, useState } from "react";
import { useStore } from "@/store";
import CreateDraft from "./CreateDraft";
import ImportDraft from "./ImportDraft";
import Heroes from "./Heroes";
import Profiles from "./Profiles";
import Admin from "./Admin";
import ErrorBoundary from "./ErrorBoundary";
import StatusStrip from "./parts/StatusStrip";

type Page = "create" | "import" | "heroes" | "profiles" | "admin";

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
