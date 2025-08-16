import React from "react";
import { colors } from "@/ui/theme";

export default function ExplainModal({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data?: any;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "min(920px, 96vw)",
          maxHeight: "80vh",
          overflow: "auto",
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          padding: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>Why this suggestion?</div>
          <button
            type="button"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
          >
            Close
          </button>
        </div>
        <div style={{ fontSize: 13, color: colors.muted }}>
          Coming soon: minute table, context contributors, and coverage deltas
          from /advisor/explain.
        </div>
        {data ? (
          <pre style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
