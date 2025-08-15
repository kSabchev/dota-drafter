import { useStore } from "@/store";

function ApplyPositionsButton() {
  const apply = useStore((s) => s.applySuggestedPositions);
  const hasPos = !!useStore((s) => s.story?.positions);
  return (
    <button
      disabled={!hasPos}
      onClick={() => apply()}
      style={{
        padding: "6px 10px",
        border: "1px solid #30363d",
        borderRadius: 8,
        background: "#0d1117",
        color: "#e6edf3",
        opacity: hasPos ? 1 : 0.5,
      }}
    >
      Apply Suggested Positions
    </button>
  );
}
export default ApplyPositionsButton;
