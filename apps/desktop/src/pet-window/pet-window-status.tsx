import { useTranslation } from "@pets-driven/i18n";
import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PET_SPEECH_KEY_PREFIX } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";
import { PET_MOODS } from "@pets-driven/pet-engine/pets/status/pet-mood";
import type { PetWindowOverlay } from "@/pet-window/pet-window-messages";

type PetWindowStatusProps = {
  name: string;
  animationState: PetAnimationState;
  activity: PetActivityKind | null;
  partnerName: string | null;
  working: boolean;
  overlay: PetWindowOverlay | null;
  cwd: string | null;
  /**
   * The pet's note when it should be readable right now — the pet is saying it,
   * or the user is hovering the pet to expand the card. Null keeps the note out
   * of the card while `hasNote` still marks that there is one to come back to.
   */
  note: string | null;
  /** True when the pet has a note at all; drives the always-on badge. */
  hasNote: boolean;
  spriteHeight: number;
  /** Pet window resize scale; shrinks the card's own size at small pet sizes
   * so it doesn't loom over a tiny sprite, clamped so text stays legible. */
  scale: number;
};

/** Presentation-only status capsule for a pet window (name, activity, cwd). */
export function PetWindowStatus({
  name,
  animationState,
  activity,
  partnerName,
  working,
  overlay,
  cwd,
  note,
  hasNote,
  spriteHeight,
  scale,
}: PetWindowStatusProps) {
  const { t } = useTranslation("desktop");
  const status = presentPetStatus(animationState, overlay, activity, partnerName, working);
  // Color is reserved for the agent work lifecycle: a "work" tone paints the
  // dot and label with the mood accent, so color alone reads as "this pet is
  // working". Ambient play/idle stays neutral and leans on the name + dialogue.
  const isWork = status.tone === "work";
  const dotColor = isWork ? PET_MOODS[status.mood].accent : "var(--ink-400)";
  const labelColor = isWork ? PET_MOODS[status.mood].accent : "var(--text-muted)";
  // Static labels carry a stable key we can localize; host-supplied free text
  // (speech/attention overlays) has no key, so it shows as-is.
  const label = status.labelKey
    ? t(`petStatus.${status.labelKey}`, status.labelParams)
    : status.label;
  // The agent-channel overlay owns the single message line: social/idle/greet
  // dialogue arrives here as a null-status channel message, agent lines as a
  // status-bearing one. Personality dialogue arrives as a `petSpeech.*` i18n key
  // (localized here); agent-supplied summaries are free text and show verbatim.
  const rawMessage = status.message;
  const messageLine = rawMessage?.startsWith(`${PET_SPEECH_KEY_PREFIX}.`)
    ? t(rawMessage)
    : rawMessage;
  const cardScale = Math.max(0.85, Math.min(1, scale));

  return (
    <div
      className="pet-window-status-card"
      style={
        {
          "--pet-window-dot-color": dotColor,
          "--pet-window-label-color": labelColor,
          "--sprite-h": `${spriteHeight}px`,
          "--pet-window-card-scale": cardScale,
        } as React.CSSProperties
      }
    >
      <div
        className={`pet-window-status-card__inner${cwd || messageLine || note ? " pet-window-status-card__inner--expanded" : ""}`}
      >
        <div className="pet-window-status-card__row">
          <span className="pet-window-status-card__dot" />
          <span className="pet-window-status-card__name">{name}</span>
          {label ? <span className="pet-window-status-card__label">{label}</span> : null}
          {hasNote ? (
            <span
              aria-label={t("petWindow.noteBadgeAria")}
              className="pet-window-status-card__note-badge"
              role="img"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="10"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
                viewBox="0 0 24 24"
                width="10"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </span>
          ) : null}
        </div>
        {messageLine ? <div className="pet-window-status-card__message">{messageLine}</div> : null}
        {note ? <div className="pet-window-status-card__note">{note}</div> : null}
        {cwd ? (
          <div className="pet-window-status-card__cwd">
            <svg
              aria-hidden="true"
              fill="none"
              height="11"
              stroke="var(--lavender-600)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              width="11"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <span>{cwd}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
