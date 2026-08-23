import { useCallback, useEffect, useRef, useState } from "react";

/** How long the pet keeps a note on screen once it brings it up. */
export const NOTE_SPEAK_DURATION_MS = 6_000;
/**
 * How often a quiet pet brings its own note back up. Long on purpose: the note
 * is a reminder the user left for themselves, not chatter, so it should read as
 * the pet remembering something rather than as another idle line.
 */
export const NOTE_IDLE_INTERVAL_MS = 240_000;

type UsePetWindowNoteParams = {
  /** The pet's note, or null when it has none. */
  note: string | null;
  /**
   * True while the pet has nothing else to say — no agent-channel overlay and
   * no running task. The engine owns the single message line, so the note only
   * recites itself into a silence it is not competing for.
   */
  isQuiet: boolean;
  /**
   * Quiet Mode is on for the desktop. The idle recital stops — an unprompted
   * bubble every few minutes is exactly what the user turned off — but a note
   * they have just saved still speaks, because that is the save's only
   * feedback and they asked for it a second ago.
   */
  isQuietModeOn: boolean;
};

/**
 * When a pet says its own note out loud.
 *
 * The note is otherwise write-only from the desktop: it is edited by
 * right-clicking the pet and then only ever read back on the main window's pet
 * card. Speaking it gives the note a presence on the surface the user actually
 * watches, and makes a save visible the moment it happens instead of closing
 * the popup onto an unchanged screen.
 */
export function usePetWindowNote({ note, isQuiet, isQuietModeOn }: UsePetWindowNoteParams) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  // `undefined` means "no note observed yet". A window that opens on a pet
  // which already has a note must not greet the user by reciting it, so the
  // first observed value only establishes the baseline to compare against.
  const lastNoteRef = useRef<string | null | undefined>(undefined);
  const hideTimerRef = useRef<number | null>(null);

  const speak = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }

    setIsSpeaking(true);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setIsSpeaking(false);
    }, NOTE_SPEAK_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // A note the user just wrote is said immediately: that is the only feedback
  // the save gets, since the context-menu popup closes onto the same screen.
  useEffect(() => {
    const previous = lastNoteRef.current;
    lastNoteRef.current = note;

    if (!note) {
      setIsSpeaking(false);
      return;
    }

    if (previous === undefined || note === previous) {
      return;
    }

    speak();
  }, [note, speak]);

  // The idle recital. Keying the interval on `isQuiet` restarts the countdown
  // whenever the pet falls silent again, so a note never lands on the tail of
  // an agent line that just cleared.
  useEffect(() => {
    if (!note || !isQuiet || isQuietModeOn) {
      return;
    }

    const timer = window.setInterval(speak, NOTE_IDLE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [note, isQuiet, isQuietModeOn, speak]);

  return { isSpeaking: isSpeaking && note !== null };
}
