import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import { PetEmote } from "@pets-driven/pet-engine/pets/status/pet-emote";
import { PET_MOODS } from "@pets-driven/pet-engine/pets/status/pet-mood";

type BehaviorTokenEmoteProps = {
  presentation: BehaviorTokenPresentation;
};

export function BehaviorTokenEmote({ presentation }: BehaviorTokenEmoteProps) {
  if (presentation.emote === "none") return null;

  return (
    <span
      aria-label={`Decision token ${presentation.label}`}
      role="img"
      data-decision-emote-tone={presentation.tone}
      title={presentation.label}
    >
      <PetEmote accent={PET_MOODS[presentation.mood]?.accent} kind={presentation.emote} size="sm" />
    </span>
  );
}
