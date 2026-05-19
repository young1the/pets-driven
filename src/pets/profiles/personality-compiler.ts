import type { SimulationComponent } from "@/core/components/simulation-components";
import type { PersonalityComponent } from "./pet-profile";

export function compilePersonalityComponents(
  components: PersonalityComponent[],
): SimulationComponent[] {
  return components.flatMap((component) => {
    if (component.type === "Talkative") {
      return [{ type: "IdleConversation", idleAfterMs: component.idleAfterMs }];
    }

    return [];
  });
}
