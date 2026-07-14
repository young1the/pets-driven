import type { Component } from "@pets-driven/pet-engine/core/components";
import type { PetPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";

export function buildPersonalityComponents(personality: PetPersonality): Component[] {
  const components: Component[] = [
    {
      type: "MovementProfile",
      standForce: personality.standForce,
      pursueForce: personality.pursueForce,
      arriveForce: personality.arriveForce,
    },
  ];
  if (personality.idleConversationMs !== undefined) {
    components.push({ type: "IdleConversation", idleAfterMs: personality.idleConversationMs });
  }
  components.push({
    type: "CompletionBehavior",
    intentAfterCompletion: personality.completionIntent,
  });
  components.push({
    type: "Personality",
    openness: personality.openness,
    conscientiousness: personality.conscientiousness,
    extraversion: personality.extraversion,
    agreeableness: personality.agreeableness,
    neuroticism: personality.neuroticism,
  });
  return components;
}
