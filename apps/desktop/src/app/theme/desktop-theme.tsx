import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type AccentId =
  | "blossom"
  | "lavender"
  | "sky"
  | "coral"
  | "mint"
  | "butter";

/** The six brand accents, matching the `data-accent` ramps in theme.css. */
export const ACCENTS: { id: AccentId; hex: string; name: string }[] = [
  { id: "blossom", hex: "#F95E9E", name: "Blossom" },
  { id: "lavender", hex: "#8B7FE8", name: "Lavender" },
  { id: "sky", hex: "#3E97DC", name: "Sky" },
  { id: "coral", hex: "#F65440", name: "Coral" },
  { id: "mint", hex: "#2FB67E", name: "Mint" },
  { id: "butter", hex: "#F0A91F", name: "Butter" },
];

const MODE_STORAGE_KEY = "pd-theme-mode";
const ACCENT_STORAGE_KEY = "pd-theme-accent";

type ThemeControl = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
};

const ThemeContext = createContext<ThemeControl | null>(null);

function readMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function readAccent(): AccentId {
  if (typeof window === "undefined") {
    return "blossom";
  }
  const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  return ACCENTS.some((accent) => accent.id === stored)
    ? (stored as AccentId)
    : "blossom";
}

/**
 * Applies the chosen appearance mode and accent color to the whole app by
 * stamping `data-theme` / `data-accent` on the document root — theme.css keys
 * its token overrides off those attributes, so every surface, text and accent
 * follows. Persisted to localStorage so the choice survives a restart.
 */
export function DesktopThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  const [accent, setAccent] = useState<AccentId>(readAccent);

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);

    // "system" tracks the OS preference live; light/dark are fixed.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        mode === "system" ? (media.matches ? "dark" : "light") : mode;
      document.documentElement.setAttribute("data-theme", resolved);
    };

    apply();

    if (mode !== "system") {
      return;
    }

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  }, [accent]);

  const control = useMemo<ThemeControl>(
    () => ({ mode, setMode, accent, setAccent }),
    [mode, accent],
  );

  return (
    <ThemeContext.Provider value={control}>{children}</ThemeContext.Provider>
  );
}

/**
 * Read/flip the active theme. Outside a provider (e.g. isolated component
 * tests) it degrades to a read-only default rather than throwing.
 */
export function useDesktopTheme(): ThemeControl {
  const control = useContext(ThemeContext);
  if (!control) {
    return {
      mode: "system",
      setMode: () => {},
      accent: "blossom",
      setAccent: () => {},
    };
  }
  return control;
}
