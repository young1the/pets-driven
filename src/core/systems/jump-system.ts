import type {
  CanJumpComponent,
  JumpStateComponent,
  LocomotionStateComponent,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

type JumpingEntity = {
  id: string;
  locomotion: LocomotionStateComponent;
  jump: CanJumpComponent;
  jumpState: JumpStateComponent;
};

export function runJumpSystem(entities: JumpingEntity[]): Force[] {
  return entities.flatMap((entity) => {
    if (!entity.jumpState.pending) {
      return [];
    }

    entity.jumpState.pending = false;

    return [
      {
        id: entity.id,
        x: 0,
        y: -entity.jump.impulse,
      },
    ];
  });
}
