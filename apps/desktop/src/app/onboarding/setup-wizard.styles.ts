import type { CSSProperties } from "react";

export const rail: CSSProperties = {
  width: "260px",
  flex: "none",
  background: "var(--surface-sunken)",
  borderRight: "1px solid var(--border-soft)",
  padding: "30px 22px",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
};
export const railLogo: CSSProperties = { height: "20px", marginBottom: "26px" };
export const stepRow = (state: "done" | "active" | "upcoming"): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "13px",
  opacity: state === "upcoming" ? 0.55 : 1,
});
export const stepBadge = (state: "done" | "active" | "upcoming"): CSSProperties => ({
  width: "28px",
  height: "28px",
  flex: "none",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "13px",
  background: state === "upcoming" ? "var(--surface-card)" : "var(--color-primary)",
  color: state === "upcoming" ? "var(--text-muted)" : "var(--color-on-primary)",
  border: state === "upcoming" ? "2px solid var(--border-default)" : "none",
  boxShadow: state === "active" ? "0 0 0 4px var(--blossom-100)" : "none",
});
export const stepTitle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "14px",
  color: "var(--text-strong)",
};
export const stepDesc: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  color: "var(--text-muted)",
};
export const guideCard: CSSProperties = {
  marginTop: "auto",
  display: "flex",
  alignItems: "center",
  gap: "11px",
  background: "var(--surface-card)",
  border: "1px solid var(--border-soft)",
  borderRadius: "16px",
  padding: "11px 13px",
  boxShadow: "var(--shadow-md)",
};
export const guideName: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "13.5px",
  color: "var(--text-strong)",
};
export const guideQuote: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  color: "var(--text-muted)",
  lineHeight: 1.35,
};
export const content: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  padding: "26px 44px 36px",
  boxSizing: "border-box",
  // Scroll the pane internally rather than growing the page, so tall steps
  // (inline terminal) don't reflow the whole layout as content loads.
  height: "100vh",
  overflowY: "auto",
  // Reserve the scrollbar gutter so it appearing/disappearing can't jitter the
  // inline terminal width (which would trigger an xterm refit flicker).
  scrollbarGutter: "stable",
};
export const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};
export const skipAll: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13px",
  color: "var(--text-muted)",
};
export const body: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "10px",
};
// Content-heavy steps (inline terminal) anchor to the top so resolving async
// content doesn't re-center and visibly jump/flicker.
export const bodyTop: CSSProperties = {
  ...body,
  flex: "0 0 auto",
  justifyContent: "flex-start",
  paddingTop: "6px",
};
export const eyebrow: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--color-primary)",
};
export const title: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "clamp(30px, 4vw, 40px)",
  lineHeight: 1.06,
  letterSpacing: "-0.02em",
  color: "var(--text-strong)",
  margin: "6px 0 0",
};
export const lede: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "15px",
  lineHeight: 1.55,
  color: "var(--text-muted)",
  margin: "12px 0 0",
  maxWidth: "480px",
};
export const sectionLabel: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "14.5px",
  color: "var(--text-strong)",
  margin: "24px 0 10px",
};
export const segWrap: CSSProperties = {
  display: "inline-flex",
  alignSelf: "flex-start",
  padding: "4px",
  gap: "4px",
  borderRadius: "12px",
  background: "var(--surface-sunken)",
  flexWrap: "wrap",
};
export const seg = (active: boolean): CSSProperties => ({
  border: 0,
  cursor: "pointer",
  padding: "9px 18px",
  borderRadius: "9px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13.5px",
  background: active ? "var(--color-primary)" : "transparent",
  color: active ? "var(--color-on-primary)" : "var(--text-muted)",
});
export const swatch = (hex: string, on: boolean): CSSProperties => ({
  width: "32px",
  height: "32px",
  borderRadius: "999px",
  cursor: "pointer",
  background: hex,
  border: `3px solid ${on ? "var(--text-strong)" : "transparent"}`,
  boxShadow: on ? "0 0 0 3px var(--surface-card)" : "none",
});
export const footer: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  marginTop: "auto",
  paddingTop: "22px",
};
export const footerActions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "20px",
};
export const textLink: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "14px",
  color: "var(--text-link)",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
export const folderIcon: CSSProperties = {
  fontSize: "16px",
  flex: "none",
  color: "var(--text-strong)",
};
// Stacked action+label buttons ("browse Petdex" / "add via terminal").
export const petGetActions: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: "10px",
  marginTop: "18px",
};
export const petGetButton: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "9px",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid var(--border-soft)",
  background: "var(--surface-card)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13.5px",
  color: "var(--text-strong)",
  textDecoration: "none",
};
// Accent-filled variant for the primary "browse Petdex" action.
export const petGetButtonPrimary: CSSProperties = {
  ...petGetButton,
  border: "1px solid var(--color-primary)",
  background: "var(--color-primary)",
  color: "var(--color-on-primary)",
  boxShadow: "0 0 0 4px var(--blossom-100)",
};
// "N found ................ [ Choose folder ]" on one row.
export const folderCountRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginTop: "6px",
};
export const folderSelectButton: CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  maxWidth: "60%",
  padding: "9px 14px",
  borderRadius: "12px",
  border: "1px solid var(--border-soft)",
  background: "var(--surface-card)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: "13px",
  color: "var(--text-strong)",
};
export const folderSelectName: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
export const emptyStrip: CSSProperties = {
  marginTop: "6px",
  padding: "18px",
  borderRadius: "14px",
  border: "1px dashed var(--border-default)",
  background: "var(--surface-sunken)",
  textAlign: "center",
  fontFamily: "var(--font-body)",
  fontSize: "13px",
  color: "var(--text-muted)",
};
export const pluginGrid: CSSProperties = {
  display: "flex",
  gap: "12px",
  marginTop: "6px",
};
export const pluginCard = (selected: boolean, disabled: boolean): CSSProperties => ({
  flex: "1 1 0",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "14px 16px",
  borderRadius: "14px",
  border: selected ? "2px solid var(--color-primary)" : "1px solid var(--border-soft)",
  background: "var(--surface-card)",
  boxShadow: selected ? "0 0 0 4px var(--blossom-100)" : "none",
  opacity: disabled ? 0.6 : 1,
});
export const pluginBadge: CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "17px",
  color: "#fff",
  flex: "none",
};
// One-line, ellipsized so the side-by-side agent cards stay a fixed height.
export const pluginSubtitle: CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
export const heroWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "4px",
};
export const doneWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: "4px",
  maxWidth: "480px",
  margin: "0 auto",
};
export const doneChips: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "8px",
  marginTop: "16px",
};
export const doneChip: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12.5px",
  fontWeight: 700,
  color: "var(--text-muted)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-soft)",
  padding: "6px 13px",
  borderRadius: "999px",
};
export const doneActions: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "13px",
  marginTop: "26px",
};
export const wizardSelect: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "420px",
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
export const fieldHint: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  color: "var(--text-muted)",
  margin: "6px 0 0",
  maxWidth: "460px",
  lineHeight: 1.4,
};
// A fixed-height flex column so TerminalSection (.pd-eterm) fills it and renders
// its own frame — mirrors how the main window hosts it. No overflow:hidden here,
// which was clipping the terminal's right edge.
export const inlineTermShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "320px",
  minWidth: 0,
  marginTop: "14px",
};
