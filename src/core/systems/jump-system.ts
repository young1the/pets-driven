import type {
  JumpMovementComponent,
  LocomotionStateComponent,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

type JumpingEntity = {
  id: string;
  locomotion: LocomotionStateComponent;
  jump: JumpMovementComponent;
};

export function runJumpSystem(entities: JumpingEntity[]): Force[] {
  return entities.flatMap((entity) => {
    if (entity.locomotion.activeMode !== "jump") {
      return [];
    }

    return [
      {
        id: entity.id,
        x: 0,
        y: -entity.jump.impulse,
      },
    ];
  });
}
