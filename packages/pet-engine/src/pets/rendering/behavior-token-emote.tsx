import { PET_MOODS, PetEmote } from "@pets-driven/design-system";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";

type BehaviorTokenEmoteProps = {
  presentation: BehaviorTokenPresentation;
};

export function BehaviorTokenEmote({ presentation }: BehaviorTokenEmoteProps) {
  if (presentation.emote === "none") return null;

  return (
    <span
      aria-label={`Decision token ${presentation.label}`}
      data-decision-emote-tone={presentation.tone}
      title={presentation.label}
    >
      <PetEmote accent={PET_MOODS[presentation.mood]?.accent} kind={presentation.emote} size="sm" />
    </span>
  );
}
