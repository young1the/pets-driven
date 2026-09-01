import { useTranslation } from "@pets-driven/i18n";
import "@/pet-window/pet-window-countdown.css";

/**
 * The 3-2-1 a pet wears while its round is about to start.
 *
 * Drawn in the connect notice's slot above the pet rather than in the status
 * card. The card is where a pet reports what its agent is doing, and this app
 * exists to make that reportable — a game starting is not a good enough reason
 * for that line to go missing, not even for three seconds.
 *
 * The glyph is the key so React remounts the element on each number: the beat
 * animation then plays three times, once per digit, instead of once on mount
 * with 2 and 1 appearing flat.
 */
export function PetWindowCountdown({ glyph, scale }: { glyph: string; scale: number }) {
  const { t } = useTranslation("desktop");
  const pillScale = Math.max(0.85, Math.min(1, scale));

  return (
    <div
      aria-label={t("petWindow.countdownAria")}
      className="pet-window-countdown"
      key={glyph}
      role="status"
      style={{ "--pet-window-countdown-scale": pillScale } as React.CSSProperties}
    >
      <span aria-hidden="true">{glyph}</span>
    </div>
  );
}
