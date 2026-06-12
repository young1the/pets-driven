/**
 * TypeScript mirror of tokens/colors.css for non-CSS consumers
 * (canvas renderers, etc.). Hand-maintained; tests/colors-mirror.test.ts
 * fails the build if a value drifts from the CSS source of truth.
 */

export const blossom = {
  50: "#FFF1F7",
  100: "#FFE0EE",
  200: "#FFC4DD",
  300: "#FF9FC7",
  400: "#FF7FB4",
  500: "#F95E9E",
  600: "#E03D84",
  700: "#B82B69",
} as const;

export const teal = {
  50: "#E7FAF7",
  100: "#C7F2EC",
  200: "#95E6DA",
  300: "#5FD6C5",
  400: "#2EC3AE",
  500: "#16B8A6",
  600: "#0E8C7E",
  700: "#0B6E63",
  800: "#0A574E",
} as const;

export const lavender = {
  50: "#F4F1FE",
  100: "#E9E3FD",
  200: "#D6CCFA",
  300: "#BCABF5",
  400: "#A189EE",
  500: "#8B7FE8",
  600: "#6F5FD6",
  700: "#5A49B8",
  800: "#463A8F",
  900: "#332B66",
} as const;

export const mint = {
  50: "#ECFBF4",
  100: "#D3F6E5",
  200: "#A8ECCB",
  300: "#7BD9B0",
  400: "#4FC894",
  500: "#2FB67E",
  600: "#1E9468",
  700: "#177451",
} as const;

export const sky = {
  50: "#ECF7FE",
  100: "#D4EDFC",
  200: "#AEDDF8",
  300: "#8ECAF2",
  400: "#5FB2EA",
  500: "#3E97DC",
  600: "#2A78BE",
  700: "#205F98",
} as const;

export const butter = {
  50: "#FFF8E6",
  100: "#FFEFC2",
  200: "#FFE093",
  300: "#FFD479",
  400: "#FBC24A",
  500: "#F0A91F",
  600: "#C9870D",
} as const;

export const coral = {
  50: "#FFF0EE",
  100: "#FFDED9",
  200: "#FFBDB3",
  300: "#FF9A8C",
  400: "#FF7967",
  500: "#F65440",
  600: "#D63A28",
} as const;

export const ink = {
  50: "#F8F6FC",
  100: "#F1EFF7",
  150: "#EAE7F2",
  200: "#DFDCE9",
  300: "#C4C0D2",
  400: "#A29DB4",
  500: "#807A98",
  600: "#635D80",
  700: "#4E4869",
  800: "#3A3552",
  900: "#2C2840",
  950: "#221F2E",
} as const;

export const cream = "#FFFCFD";
export const paper = "#FFFFFF";

/** Semantic aliases — mirror the `--color-*` aliases in colors.css. */
export const semantic = {
  primary: blossom[500],
  primaryHover: blossom[600],
  primaryPress: blossom[700],
  primarySoft: blossom[100],
  accent: teal[500],
  accentSoft: teal[100],
  success: mint[500],
  successSoft: mint[100],
  info: sky[500],
  infoSoft: sky[100],
  warning: butter[500],
  warningSoft: butter[100],
  danger: coral[500],
  dangerSoft: coral[100],
} as const;

/** Ramp name → CSS custom property prefix, for the mirror guard test. */
export const colorRamps = {
  blossom,
  teal,
  lavender,
  mint,
  sky,
  butter,
  coral,
  ink,
} as const;
