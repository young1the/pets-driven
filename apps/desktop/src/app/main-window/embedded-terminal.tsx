import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { desktopGateway } from "@/app/desktop-gateway";
import "@xterm/xterm/css/xterm.css";

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
  /**
   * A command typed into the shell once it starts, as if the user had entered
   * it. The prompt stays afterwards, so they can watch it run and then keep
   * working in the same session.
   */
  initialInput?: string | null;
  exitedLabel: string;
  className?: string;
}

/**
 * A live in-app terminal backed by a Rust PTY. Mounts one xterm instance and
 * one PTY session; changing `cwd`/`shell` tears down and restarts it (the
 * parent also keys us to force a clean remount).
 */
export function EmbeddedTerminal({
  cwd,
  shell,
  initialInput,
  exitedLabel,
  className,
}: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!desktopGateway.isDesktopRuntime()) {
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

    // xterm has no built-in paste binding: left to itself, Ctrl/Cmd+V sends
    // the literal SYN control byte to the shell, which readline echoes back
    // as "^V" instead of pasting. Intercept it here and paste the clipboard
    // text directly, matching how every other terminal app handles the key.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || event.key.toLowerCase() !== "v") {
        return true;
      }
      if (!event.ctrlKey && !event.metaKey) {
        return true;
      }

      // Returning false only tells xterm to skip the key — the keydown still
      // carries its default action, so the webview runs its own paste and
      // xterm's paste listener inserts the clipboard a second time. Cancel the
      // default so the manual paste below is the only one that lands.
      event.preventDefault();

      void navigator.clipboard
        .readText()
        .then((text) => {
          if (text) {
            term.paste(text);
          }
        })
        .catch(() => {});

      return false;
    });

    void (async () => {
      try {
        const id = await desktopGateway.openTerminal({
          cwd: cwd ?? null,
          shell: shell ?? null,
          cols: term.cols,
          rows: term.rows,
        });
        // The effect may have been torn down while the command was in flight;
        // kill the orphaned session so it doesn't linger.
        if (disposed) {
          void desktopGateway.closeTerminal(id).catch(() => {});
          return;
        }
        sessionId = id;

        unlisteners.push(
          await desktopGateway.subscribeTerminalData((payload) => {
            if (payload.id === id) {
              term.write(new Uint8Array(payload.data));
            }
          }),
        );
        unlisteners.push(
          await desktopGateway.subscribeTerminalExit((payload) => {
            if (payload.id === id) {
              term.write(`\r\n\x1b[2m${exitedLabel}\x1b[0m\r\n`);
            }
          }),
        );

        // The shell buffers stdin, so this is safe to send before its prompt
        // has finished drawing — it runs as soon as the shell reads a line.
        if (initialInput) {
          await desktopGateway.writeTerminal(id, `${initialInput}\r`);
        }
      } catch (error) {
        term.write(`\r\n\x1b[31m${String(error)}\x1b[0m\r\n`);
      }
    })();

    const dataDisposable = term.onData((data) => {
      if (sessionId) {
        void desktopGateway.writeTerminal(sessionId, data).catch(() => {});
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
        void desktopGateway.resizeTerminal(sessionId, term.cols, term.rows).catch(() => {});
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
        void desktopGateway.closeTerminal(sessionId).catch(() => {});
      }
      term.dispose();
    };
  }, [cwd, shell, initialInput, exitedLabel]);

  return <div className={className} ref={containerRef} />;
}
