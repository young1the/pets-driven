import type { AgentHookIngressStatus } from "@/adapters/agent-events/agent-hook-ingress";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/**
 * The status is polled every two seconds, so anything fresher than this would
 * only flicker through a handful of second counts on its way to "1m ago".
 */
const JUST_NOW_MS = 10 * SECOND_MS;

/** The narrow slice of `t` this module needs, so it stays free of React. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

function formatSignalAge(elapsedMs: number, t: Translate): string {
  // A backwards clock (system time changed, or a hook stamped slightly ahead)
  // must not read as a signal from the future.
  const elapsed = Math.max(0, elapsedMs);

  if (elapsed < JUST_NOW_MS) {
    return t("hook.lastSignal.justNow");
  }
  if (elapsed < MINUTE_MS) {
    return t("hook.lastSignal.secondsAgo", { n: Math.floor(elapsed / SECOND_MS) });
  }
  if (elapsed < HOUR_MS) {
    return t("hook.lastSignal.minutesAgo", { n: Math.floor(elapsed / MINUTE_MS) });
  }
  if (elapsed < DAY_MS) {
    return t("hook.lastSignal.hoursAgo", { n: Math.floor(elapsed / HOUR_MS) });
  }

  return t("hook.lastSignal.daysAgo", { n: Math.floor(elapsed / DAY_MS) });
}

/**
 * One line for the settings connection card: when the ingress last heard from
 * an agent, and how much it has heard in total.
 *
 * This is the only thing a release build can say about hook traffic — the
 * ingress `eprintln!` traces go to a console the packaged app does not have.
 */
export function describeHookLastSignal(
  status: Pick<AgentHookIngressStatus, "lastEventAt" | "receivedCount" | "lastEventName">,
  t: Translate,
  now: number,
): string {
  if (status.lastEventAt === null || status.receivedCount <= 0) {
    return t("hook.lastSignal.none");
  }

  return t("hook.lastSignal.received", {
    event: status.lastEventName ?? t("hook.lastSignal.unnamedEvent"),
    when: formatSignalAge(now - status.lastEventAt, t),
    n: status.receivedCount,
  });
}
