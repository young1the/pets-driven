import type { SimulationComponent } from "@/core/components";
import type { PetPersonality } from "@/pets/personalities/factories";

export function buildPersonalityComponents(personality: PetPersonality): SimulationComponent[] {
  const components: SimulationComponent[] = [
    {
      type: "MovementProfile",
      idleSpeed: personality.idleSpeed,
      activeSpeed: personality.activeSpeed,
      seekSpeed: personality.seekSpeed,
    },
  ];
  if (personality.idleConversationMs !== undefined) {
    components.push({ type: "IdleConversation", idleAfterMs: personality.idleConversationMs });
  }
  components.push({ type: "CompletionBehavior", intentAfterCompletion: personality.completionIntent });
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
