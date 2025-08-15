import { useEffect, useState } from "react";
import { useStore } from "@/store";
import CreateDraft from "./CreateDraft";
import ImportDraft from "./ImportDraft";
import Heroes from "./Heroes";
import Profiles from "./Profiles";
import ErrorBoundary from "./ErrorBoundary";

type Page = "create" | "import" | "heroes" | "profiles";

export default function App() {
  const init = useStore((s) => s.init);
  const [page, setPage] = useState<Page>("create");

  useEffect(() => {
    init().catch(console.error);
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
          <nav style={{ display: "flex", gap: 8 }}>
            {(["create", "import", "heroes", "profiles"] as Page[]).map((p) => (
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
                {p === "create"
                  ? "Create Draft"
                  : p === "import"
                  ? "Import Draft"
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
        </main>
      </div>
    </ErrorBoundary>
  );
}
