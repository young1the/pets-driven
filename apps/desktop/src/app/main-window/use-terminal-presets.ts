import { useEffect, useState } from "react";
import { type DesktopGateway, desktopGateway, type TerminalPreset } from "@/app/desktop-gateway";

/**
 * Load the terminals installed on this machine as ready-made launch templates
 * (via the Rust `list_terminal_presets` command).
 *
 * These are a starting point, not the set of terminals that work: the template
 * is an ordinary settings field, so one that is not detected — or not known to
 * the app at all — works by being typed in. Resolves to an empty list outside
 * Tauri, which is why the caller always keeps a "system default" option of its
 * own.
 */
export function useTerminalPresets(gateway: DesktopGateway = desktopGateway): TerminalPreset[] {
  const [presets, setPresets] = useState<TerminalPreset[]>([]);

  useEffect(() => {
    let isActive = true;

    void gateway
      .listTerminalPresets()
      .then((list) => {
        if (isActive) {
          // An app build without the command behind this answers with nothing
          // rather than a list, and a settings screen that throws over a
          // convenience would take the whole window with it.
          setPresets(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => {
        if (isActive) {
          setPresets([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [gateway]);

  return presets;
}
