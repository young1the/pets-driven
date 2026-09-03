import { useTranslation } from "@pets-driven/i18n";
import type { PetWindowGame } from "@/pet-window/pet-window-messages";
import "@/pet-window/pet-window-game-hud.css";

/**
 * Everything a pet says about the round it is on, in one pill above its head.
 *
 * Drawn in the connect notice's slot rather than in the status card. The card
 * is where a pet reports what its agent is doing, and this app exists to make
 * that reportable — a game is not a good enough reason for that line to go
 * missing, not for three seconds and not for a whole round.
 *
 * It grew out of the opening 3-2-1, which used to be the only thing a round
 * ever showed. Once the count reached zero the pet went back to looking like a
 * pet that had stopped walking for no reason: nothing said the round was still
 * on, nothing said an obstacle had been cleared, and nothing said the pet had
 * anywhere to go. So the same slot now carries the round for its whole length,
 * and the countdown is just its first three seconds.
 */
export function PetWindowGameHud({ game, scale }: { game: PetWindowGame; scale: number }) {
  const { t } = useTranslation("desktop");
  const pillScale = Math.max(0.85, Math.min(1, scale));

  if (game.countdown) {
    return (
      <div
        aria-label={t("petWindow.countdownAria")}
        className="pet-window-game pet-window-game--countdown"
        // The glyph is the key so React remounts the element on each number:
        // the beat animation then plays three times, once per digit, instead of
        // once on mount with 2 and 1 appearing flat.
        key={game.countdown}
        role="status"
        style={{ "--pet-window-game-scale": pillScale } as React.CSSProperties}
      >
        <span aria-hidden="true">{game.countdown}</span>
      </div>
    );
  }

  const showLane = game.control === "user" && game.phase !== "over" && game.lane !== null;

  return (
    <div
      className="pet-window-game"
      role="status"
      style={{ "--pet-window-game-scale": pillScale } as React.CSSProperties}
    >
      <span
        // `cleared` and not `count`: i18next reads `count` as a plural selector
        // and would then look for keys that do not exist.
        aria-label={t(`petWindow.game.${game.phase}`, { cleared: game.cleared })}
        className="pet-window-game__tally"
        // A glyph and a bare number: the label is the whole of what it says, so
        // it is one image rather than two unreadable text nodes.
        role="img"
      >
        <span aria-hidden="true" className="pet-window-game__mark">
          {PHASE_MARK[game.phase]}
        </span>
        {/* Keyed on the number so each new one lands with its own pop. A tally
            that ticks up silently is a tally nobody notices ticking up, which
            is the whole complaint it exists to answer. */}
        <span aria-hidden="true" className="pet-window-game__count" key={game.cleared}>
          {game.cleared}
        </span>
      </span>
      {showLane && game.lane ? (
        <GameLane lane={game.lane} label={t("petWindow.game.lane")} />
      ) : null}
    </div>
  );
}

/**
 * What each phase looks like at a glance.
 *
 * `blocked` is the one that has to read as *not running*: the course has
 * stopped at a gate because the agent is waiting on the user, and the game
 * halting is the report.
 */
const PHASE_MARK: Record<PetWindowGame["phase"], string> = {
  countdown: "🏃",
  running: "🏃",
  blocked: "🚧",
  over: "🏁",
};

/**
 * The lane, as a track with the pet's place on it.
 *
 * The lane is otherwise invisible — the pet simply stops, with nothing to say
 * why or that there was ever anywhere else to go. The track is drawn to the
 * lane's real proportions rather than centred, because it is not symmetric:
 * there is more room forward, into the oncoming course, than there is behind.
 */
function GameLane({ lane, label }: { lane: NonNullable<PetWindowGame["lane"]>; label: string }) {
  const span = lane.back + lane.forward;
  const at = span > 0 ? clamp01((lane.offset + lane.back) / span) : 0.5;
  const anchor = span > 0 ? clamp01(lane.back / span) : 0.5;

  return (
    <span aria-label={label} className="pet-window-game__lane" role="img">
      <span aria-hidden="true" className="pet-window-game__lane-track">
        <span className="pet-window-game__lane-anchor" style={{ left: `${anchor * 100}%` }} />
        <span className="pet-window-game__lane-pip" style={{ left: `${at * 100}%` }} />
      </span>
    </span>
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
