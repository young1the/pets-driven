import type { BadgeTone } from "@pets-driven/design-system";
import type { CSSProperties } from "react";

// Shared token-driven styles so the whole screen follows the app theme/accent.
export const label: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "15.5px",
  color: "var(--text-strong)",
  margin: 0,
};
export const hint: CSSProperties = {
  fontSize: "12.5px",
  color: "var(--text-muted)",
  margin: "4px 0 12px",
  lineHeight: 1.45,
};
export const rowStyle = (last = false): CSSProperties => ({
  padding: "22px 0",
  borderBottom: last ? "none" : "1px solid var(--border-soft)",
});
export const segWrap: CSSProperties = {
  display: "inline-flex",
  padding: "4px",
  gap: "4px",
  borderRadius: "12px",
  background: "var(--surface-sunken)",
  flexWrap: "wrap",
};
export const seg = (active: boolean): CSSProperties => ({
  border: 0,
  cursor: "pointer",
  padding: "7px 16px",
  borderRadius: "9px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13px",
  background: active ? "var(--color-primary)" : "transparent",
  color: active ? "var(--color-on-primary)" : "var(--text-muted)",
  transition: "background 140ms ease, color 140ms ease",
});
export const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
  border: "1.5px solid var(--border-default)",
  background: "var(--surface-card)",
  borderRadius: "12px",
  padding: "11px 14px",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  color: "var(--text-strong)",
  outline: "none",
};
export const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
  border: "1.5px solid var(--border-default)",
  background: "var(--surface-card)",
  borderRadius: "12px",
  padding: "11px 14px",
  fontFamily: "var(--font-body)",
  fontSize: "13px",
  color: "var(--text-strong)",
  cursor: "pointer",
  outline: "none",
};
export const swatch = (hex: string, on: boolean): CSSProperties => ({
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  cursor: "pointer",
  background: hex,
  border: `3px solid ${on ? "var(--text-strong)" : "transparent"}`,
  boxShadow: on ? "0 0 0 3px var(--surface-card)" : "none",
  transition: "transform 140ms ease",
});
export const connectionCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 14px",
  border: "1px solid var(--border-soft)",
  borderRadius: "14px",
  background: "var(--surface-sunken)",
};
export const connectionText: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  flex: 1,
};
/** The trailing action buttons inside a card row (connection, pet folder). */
export const smallAction: CSSProperties = {
  border: 0,
  cursor: "pointer",
  padding: "8px 14px",
  borderRadius: "12px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "12.5px",
  background: "var(--surface-card)",
  color: "var(--text-strong)",
  whiteSpace: "nowrap",
};
export const TONE_COLORS: Partial<Record<BadgeTone, string>> = {
  success: "#2f9e63",
  info: "#3f82d9",
  danger: "#d9544f",
};
/** The one destructive action on this screen, colored so it reads as one. */
export const dangerAction: CSSProperties = {
  ...smallAction,
  background: TONE_COLORS.danger,
  color: "#ffffff",
};
export const statusDot = (tone: BadgeTone): CSSProperties => ({
  width: "10px",
  height: "10px",
  flex: "none",
  borderRadius: "999px",
  background: TONE_COLORS[tone] ?? "var(--text-muted)",
});
export const smallCaps: CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: "0 0 8px",
};
