import { useEffect, useState } from "react";
import {
  type DesktopGateway,
  desktopGateway,
  type TerminalShellOption,
} from "@/app/desktop-gateway";

/**
 * Load the shells the in-app terminal can spawn, detected from the system (via
 * the Rust `list_terminal_shells` command). Resolves to an empty list outside
 * Tauri, so callers should always keep a "system default" option of their own.
 */
export function useTerminalShellOptions(
  gateway: DesktopGateway = desktopGateway,
): TerminalShellOption[] {
  const [options, setOptions] = useState<TerminalShellOption[]>([]);

  useEffect(() => {
    let isActive = true;

    void gateway
      .listTerminalShells()
      .then((list) => {
        if (isActive) {
          setOptions(list);
        }
      })
      .catch(() => {
        if (isActive) {
          setOptions([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [gateway]);

  return options;
}
