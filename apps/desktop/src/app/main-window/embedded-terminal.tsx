import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// Mirror the Rust payloads from embedded_terminal.rs. `data` arrives as a JSON
// array of bytes, which we hand to xterm as a Uint8Array so control sequences
// and partial UTF-8 survive intact.
type TerminalDataEvent = { id: string; data: number[] };
type TerminalExitEvent = { id: string };

const TERMINAL_DATA_EVENT = "embedded-terminal-data";
const TERMINAL_EXIT_EVENT = "embedded-terminal-exit";

// xterm renders into a canvas, so `var(--...)` font/color tokens must be
// resolved to concrete values before they reach it.
function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// Drive xterm off the design system's "soft terminal" tokens so the in-app
// terminal matches TerminalPreview and the rest of the app. The palette is a
// fixed dark-purple set (identical in light/dark), with mint/teal/blossom
// accents; ANSI slots without a token get theme-consistent pastels.
function readXtermTheme() {
  const background = readToken("--term-bg", "#2a2540");
  const foreground = readToken("--term-fg", "#e7e2f5");
  const muted = readToken("--term-muted", "#a79fc8");
  const green = readToken("--term-prompt", "#7bd9b0");
  const cyan = readToken("--term-accent", "#5fd6c5");
  const magenta = readToken("--term-pink", "#ff9fc7");

  return {
    background,
    foreground,
    cursor: green,
    cursorAccent: background,
    selectionBackground: "rgba(149, 230, 218, 0.28)",
    black: "#1e1a2e",
    red: "#ff8fa3",
    green,
    yellow: "#f3d488",
    blue: "#8fb5f0",
    magenta,
    cyan,
    white: foreground,
    brightBlack: muted,
    brightRed: "#ffa7b6",
    brightGreen: "#93e6c2",
    brightYellow: "#f7e1a3",
    brightBlue: "#a9c8f5",
    brightMagenta: "#ffb8d4",
    brightCyan: "#7fe3d5",
    brightWhite: "#ffffff",
  };
}

export interface EmbeddedTerminalProps {
  /** Working directory to spawn the shell in; null uses the process default. */
  cwd?: string | null;
  /** Program to run; empty/undefined falls back to COMSPEC/SHELL in Rust. */
  shell?: string | null;
  exitedLabel: string;
  className?: string;
}

/**
 * A live in-app terminal backed by a Rust PTY. Mounts one xterm instance and
 * one PTY session; changing `cwd`/`shell` tears down and restarts it (the
 * parent also keys us to force a clean remount).
 */
export function EmbeddedTerminal({ cwd, shell, exitedLabel, className }: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let sessionId: string | null = null;
    const unlisteners: Array<() => void> = [];

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: readToken("--font-mono", 'Menlo, Consolas, "Courier New", monospace'),
      fontSize: 13,
      theme: readXtermTheme(),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    void (async () => {
      try {
        const id = await invoke<string>("terminal_open", {
          cwd: cwd ?? null,
          shell: shell ?? null,
          cols: term.cols,
          rows: term.rows,
        });
        // The effect may have been torn down while the command was in flight;
        // kill the orphaned session so it doesn't linger.
        if (disposed) {
          void invoke("terminal_close", { id }).catch(() => {});
          return;
        }
        sessionId = id;

        unlisteners.push(
          await listen<TerminalDataEvent>(TERMINAL_DATA_EVENT, (event) => {
            if (event.payload.id === id) {
              term.write(new Uint8Array(event.payload.data));
            }
          }),
        );
        unlisteners.push(
          await listen<TerminalExitEvent>(TERMINAL_EXIT_EVENT, (event) => {
            if (event.payload.id === id) {
              term.write(`\r\n\x1b[2m${exitedLabel}\x1b[0m\r\n`);
            }
          }),
        );
      } catch (error) {
        term.write(`\r\n\x1b[31m${String(error)}\x1b[0m\r\n`);
      }
    })();

    const dataDisposable = term.onData((data) => {
      if (sessionId) {
        void invoke("terminal_write", { id: sessionId, data }).catch(() => {});
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Container is hidden (zero size); the next observe fires when shown.
        return;
      }
      if (sessionId) {
        void invoke("terminal_resize", {
          id: sessionId,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      }
    });
    resizeObserver.observe(container);

    term.focus();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      for (const stop of unlisteners) {
        stop();
      }
      if (sessionId) {
        void invoke("terminal_close", { id: sessionId }).catch(() => {});
      }
      term.dispose();
    };
  }, [cwd, shell, exitedLabel]);

  return <div className={className} ref={containerRef} />;
}
