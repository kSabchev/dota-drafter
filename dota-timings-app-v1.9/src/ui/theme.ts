// src/ui/theme.ts
export const colors = {
  bg: "#0d1117",
  card: "#0f141a",
  border: "#2b2f36",
  text: "#e6edf3",
  muted: "#9aa4b2",
  accent: "#2ea043",
  accent2: "#58a6ff",
  danger: "#f85149",
  warn: "#d29922",
};

export const radii = { sm: 6, md: 10, lg: 14, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const text = {
  h3: {
    fontSize: 16,
    fontWeight: 600,
    margin: "0 0 10px 0",
  } as React.CSSProperties,
  h4: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.muted,
    margin: "0 0 8px 0",
  } as React.CSSProperties,
};

export const button = {
  base: {
    padding: "6px 10px",
    borderRadius: radii.md,
    cursor: "pointer",
  } as React.CSSProperties,
  ghost: {
    background: "transparent",
    color: colors.text,
    border: `1px solid ${colors.border}`,
  } as React.CSSProperties,
  danger: {
    background: "transparent",
    color: colors.danger,
    border: `1px solid ${colors.danger}`,
  } as React.CSSProperties,
  icon: {
    width: 30,
    height: 30,
    display: "inline-grid",
    placeItems: "center",
  } as React.CSSProperties,
};

export const cardStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  padding: space.md,
  marginBottom: space.md,
};
