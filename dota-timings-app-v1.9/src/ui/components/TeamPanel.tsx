import React from "react";
import LocalHeroImg from "@/ui/components/LocalHeroImg";

export default function TeamPanel({
  team,
  heroes,
  title,
}: {
  team: { picks: { hero_id: number }[]; bans: { hero_id: number }[] };
  heroes: any[];
  title: string;
}) {
  const getHero = (id: number) => heroes.find((h) => h.id === id);

  return (
    <div style={{ padding: "8px", background: "#111", borderRadius: "6px" }}>
      <h3 style={{ marginBottom: "8px", color: "#fff", fontSize: "1.1em" }}>
        {title}
      </h3>

      {/* Picks */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "0.9em", color: "#ccc", marginBottom: "4px" }}>
          Picks
        </div>
        {team.picks.map((p, idx) => {
          const heroObj = getHero(p.hero_id);
          return (
            <div
              key={`pick-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              {heroObj && (
                <LocalHeroImg
                  hero={heroObj}
                  kind="icon"
                  style={{ width: 24, height: 24, borderRadius: 4 }}
                />
              )}
              <div style={{ fontWeight: 600, color: "#fff" }}>
                {heroObj?.localized_name ?? "Empty"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bans */}
      <div>
        <div style={{ fontSize: "0.9em", color: "#ccc", marginBottom: "4px" }}>
          Bans
        </div>
        {team.bans.map((b, idx) => {
          const heroObj = getHero(b.hero_id);
          return (
            <div
              key={`ban-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              {heroObj && (
                <LocalHeroImg
                  hero={heroObj}
                  kind="icon"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    filter: "grayscale(100%) brightness(0.6)",
                  }}
                />
              )}
              <div style={{ fontWeight: 600, color: "#888" }}>
                {heroObj?.localized_name ?? "Empty"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// TODO use instead of same name component
