"use client";

import { Button, CheckIcon } from "@pets-driven/design-system";
import { useEffect, useRef, useState } from "react";
import { DOWNLOAD_URL } from "@/lib/site";

/** How long the spinner shows before the button switches to its confirmation. */
const STARTING_MS = 1500;
/** How long the confirmation stays up before the button returns to its label. */
const STARTED_MS = 5000;

type Phase = "idle" | "starting" | "started";

export interface DownloadButtonProps {
  /** Idle label, e.g. "Hatch your first". */
  label: string;
  /** Label while the browser is being handed the file. */
  startingLabel: string;
  /** Label confirming the browser took over. */
  startedLabel: string;
}

/**
 * The installer CTA. `DOWNLOAD_URL` is GitHub's `releases/latest/download`
 * alias, which redirects twice before the browser takes the file over, so a
 * click sits for a moment with nothing on screen changing — and because the
 * response is an attachment the page never navigates, so the click looks like
 * it did nothing at all.
 *
 * Nothing here can observe that handoff: an anchor download fires no load,
 * error, or navigation event the page can hook. So the phases run on a timer
 * rather than pretending to track the transfer, and the wording says the
 * download was *started*, which is the part this actually knows. The anchor
 * keeps its real `href` and its default behaviour — the browser still performs
 * the download, this only narrates it.
 */
export function DownloadButton({ label, startingLabel, startedLabel }: DownloadButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Both timers are cleared on unmount, and on every click, so a second click
  // during the confirmation restarts the sequence instead of being cut short
  // by the first click's pending reset.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) clearTimeout(id);
    };
  }, []);

  function clearTimers() {
    for (const id of timers.current) clearTimeout(id);
    // Emptied in place rather than reassigned: the unmount cleanup above holds
    // this exact array, and swapping in a new one would leave it clearing a
    // stale list while the live timers ran on.
    timers.current.length = 0;
  }

  function handleClick() {
    clearTimers();
    setPhase("starting");
    timers.current.push(
      setTimeout(() => setPhase("started"), STARTING_MS),
      setTimeout(() => setPhase("idle"), STARTING_MS + STARTED_MS),
    );
  }

  const text = phase === "starting" ? startingLabel : phase === "started" ? startedLabel : label;

  return (
    <>
      <Button
        as="a"
        href={DOWNLOAD_URL}
        iconLeft={phase === "started" ? <CheckIcon /> : null}
        loading={phase === "starting"}
        onClick={handleClick}
        size="lg"
        variant="accent"
      >
        {text}
      </Button>
      {/* The label itself is swapped inside a link, which screen readers do not
          announce on their own; this mirrors it into a live region so the state
          change is spoken. */}
      <span aria-live="polite" className="pd-visually-hidden">
        {phase === "idle" ? "" : text}
      </span>
    </>
  );
}
