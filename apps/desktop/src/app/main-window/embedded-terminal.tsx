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

/**
 * A prefilled command is there to be *read* before it runs, so a newline would
 * be an Enter the user never pressed. Flatten the text to a single line and
 * leave the execute keystroke to them.
 */
function toSingleLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Put `line` in front of the cursor through xterm's paste path — the same one
 * Ctrl+V takes, so bracketed paste is handled for us — and hand focus to the
 * terminal, leaving the command one Enter away.
 */
function insertForReview(term: Terminal, line: string) {
  term.paste(line);
  term.focus();
}

export interface EmbeddedTerminalProps {
  /** Working directory to spawn the shell in; null uses the process default. */
  cwd?: string | null;
  /** Program to run; empty/undefined falls back to COMSPEC/SHELL in Rust. */
  shell?: string | null;
  /**
   * A command typed into the shell's prompt once it is drawn, but *not* run:
   * the user reads it, edits it if they want, and presses Enter themselves.
   * Changing it restarts the session, so callers hand over one command per
   * mount (and usually key the terminal on it).
   */
  prefill?: string | null;
  /**
   * Fired on every change to whether the shell has a command running: true on
   * the Enter that starts one, false once it is back at its prompt. While it is
   * false the session is disposable; while it is true, tearing it down
   * interrupts the command.
   */
  onRunningChange?: (running: boolean) => void;
  /**
   * Whether the terminal is on screen. A parent that keeps the PTY alive across
   * tab switches hides it rather than unmounting it, and xterm cannot measure
   * itself while it has no box — so it refits and takes the caret back when it
   * returns, and never steals focus from another tab if a restart (a changed
   * `shell`) remounts it while it is away. Defaults to true.
   */
  visible?: boolean;
  exitedLabel: string;
  className?: string;
}

/**
 * How often to ask the OS whether the shell is still busy. Only runs between
 * an Enter and the command finishing, so it costs nothing at an idle prompt.
 */
const BUSY_POLL_MS = 700;

/**
 * A live in-app terminal backed by a Rust PTY. Mounts one xterm instance and
 * one PTY session; changing `cwd`/`shell` tears down and restarts it (the
 * parent also keys us to force a clean remount).
 */
export function EmbeddedTerminal({
  cwd,
  shell,
  prefill,
  onRunningChange,
  visible = true,
  exitedLabel,
  className,
}: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref rather than read from the closure: a callback prop in the
  // effect's deps would restart the PTY on every render of the parent.
  const onRunningChangeRef = useRef(onRunningChange);
  onRunningChangeRef.current = onRunningChange;
  // Same reason: `visible` only decides whether the fresh terminal grabs focus,
  // and putting it in the deps would restart the PTY every time it changed.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Reached by the re-show effect below, which must not own the terminal.
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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
    // The shell echoes what it reads, so text sent before the prompt is drawn
    // lands truncated or overwritten — and a command the user cannot read is
    // one they cannot review. Hold it until the session's first byte arrives.
    let pendingPrefill = prefill ? toSingleLine(prefill) : "";
    // Whether we have told the parent a command is running, and the poll that
    // watches for it finishing.
    let running = false;
    let busyPollId: number | null = null;
    const unlisteners: Array<() => void> = [];

    function stopBusyPoll() {
      if (busyPollId !== null) {
        window.clearInterval(busyPollId);
        busyPollId = null;
      }
    }

    /**
     * Watch for the command finishing. The shell prints its prompt with the
     * same bytes it prints everything else, so the output stream cannot tell us
     * this — only the OS can, by way of what the shell has spawned.
     */
    function startBusyPoll() {
      stopBusyPoll();
      busyPollId = window.setInterval(() => {
        const id = sessionId;
        if (!id) {
          return;
        }
        void desktopGateway
          .isTerminalBusy(id)
          .then((busy) => {
            if (disposed || busy || !running) {
              return;
            }
            running = false;
            stopBusyPoll();
            onRunningChangeRef.current?.(false);
          })
          // A probe we cannot answer leaves `running` as it is: the parent keeps
          // treating the session as busy, which is the harmless direction.
          .catch(() => {});
      }, BUSY_POLL_MS);
    }

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
    termRef.current = term;
    fitRef.current = fitAddon;

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
            if (payload.id !== id) {
              return;
            }
            term.write(new Uint8Array(payload.data));

            // The prompt is on screen now, so the command goes in where the
            // user can actually read it before deciding to run it.
            if (pendingPrefill) {
              const line = pendingPrefill;
              pendingPrefill = "";
              insertForReview(term, line);
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
      } catch (error) {
        term.write(`\r\n\x1b[31m${String(error)}\x1b[0m\r\n`);
      }
    })();

    const dataDisposable = term.onData((data) => {
      if (sessionId) {
        void desktopGateway.writeTerminal(sessionId, data).catch(() => {});
      }
      // Enter hands the line to the shell, so from here on assume a command is
      // running until the OS says otherwise. Answers typed into something
      // already running arrive the same way, hence the `running` guard —
      // starting is a transition, not every carriage return.
      if (!running && sessionId && data.includes("\r")) {
        running = true;
        startBusyPoll();
        onRunningChangeRef.current?.(true);
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

    // A restart while the terminal is off screen (a changed shell, say) must
    // not pull the caret out of whatever the user is actually typing in.
    if (visibleRef.current) {
      term.focus();
    }

    return () => {
      disposed = true;
      termRef.current = null;
      fitRef.current = null;
      // A restart is a deliberate clean slate; text queued for the session
      // being torn down must not land in the one that replaces it.
      pendingPrefill = "";
      stopBusyPoll();
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
  }, [cwd, shell, prefill, exitedLabel]);

  // Coming back on screen. The ResizeObserver above refits and tells the PTY on
  // its own once the box is back, so all this owes the user is the caret —
  // re-fitting here just saves the frame the observer would take to catch up.
  useEffect(() => {
    const term = termRef.current;
    if (!visible || !term) {
      return;
    }
    try {
      fitRef.current?.fit();
    } catch {
      // Still without a box; the ResizeObserver refits when it gets one.
    }
    term.focus();
  }, [visible]);

  return <div className={className} ref={containerRef} />;
}
