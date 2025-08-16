import React from "react";
import { colors, cardStyle, button, radii, text } from "./theme";

export const Card: React.FC<
  React.PropsWithChildren<{
    style?: React.CSSProperties;
    title?: string;
    right?: React.ReactNode;
  }>
> = ({ style, title, right, children }) => (
  <section style={{ ...cardStyle, ...style }}>
    {(title || right) && (
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        {title ? <h3 style={{ ...text.h3, margin: 0 }}>{title}</h3> : <div />}
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </div>
    )}
    {children}
  </section>
);

export const PillButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ style, ...rest }) => (
  <button
    type="button"
    {...rest}
    style={{
      ...button.base,
      ...button.ghost,
      borderRadius: radii.pill,
      ...style,
    }}
  />
);

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: "default" | "accent" | "warn" | "muted";
}> = ({ children, tone = "default" }) => {
  const border =
    tone === "accent"
      ? "#2ea04366"
      : tone === "warn"
      ? colors.warn
      : colors.border;
  const color = tone === "muted" ? colors.muted : colors.text;
  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        border: `1px solid ${border}`,
        borderRadius: 999,
        color,
      }}
    >
      {children}
    </span>
  );
};

export const TurnBadge: React.FC<{
  on: boolean;
  label: string;
  variant?: "radiant" | "dire";
}> = ({ on, label, variant = "radiant" }) => {
  const bg =
    variant === "radiant"
      ? "linear-gradient(180deg, rgba(46,160,67,.14), rgba(46,160,67,.06))" // green
      : "linear-gradient(180deg, rgba(248,81,73,.14), rgba(248,81,73,.06))"; // red
  const border = variant === "radiant" ? "#2ea04366" : "#f8514966";
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        color: on ? "#e6edf3" : "#9aa4b2",
        background: on ? bg : "transparent",
        boxShadow: on ? `0 0 0 1px ${border} inset` : undefined,
      }}
    >
      {label}
    </div>
  );
};
