import type {
  CanJumpComponent,
  ContactStateComponent,
  JumpActionStateComponent,
  LocomotionStateComponent,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

const JUMP_LANDING_COOLDOWN_MS = 250;

type JumpingEntity = {
  id: string;
  locomotion: LocomotionStateComponent;
  contact: ContactStateComponent;
  jump: CanJumpComponent;
  jumpAction: JumpActionStateComponent;
};

export function runJumpSystem(
  entities: JumpingEntity[],
  deltaMs = 0,
): Force[] {
  return entities.flatMap((entity) => {
    if (entity.jumpAction.phase === "landingCooldown") {
      entity.jumpAction.cooldownMs = Math.max(
        0,
        entity.jumpAction.cooldownMs - deltaMs,
      );

      if (entity.jumpAction.cooldownMs === 0) {
        entity.jumpAction.phase = "ready";
      }

      return [];
    }

    if (entity.jumpAction.phase === "falling" && entity.contact.grounded) {
      entity.jumpAction.phase = "landingCooldown";
      entity.jumpAction.cooldownMs = JUMP_LANDING_COOLDOWN_MS;
      return [];
    }

    if (entity.jumpAction.phase === "rising" && !entity.contact.grounded) {
      entity.jumpAction.phase = "falling";
      return [];
    }

    if (entity.jumpAction.phase !== "requested") {
      return [];
    }

    if (entity.locomotion.baseMode !== "walk" || !entity.contact.grounded) {
      entity.jumpAction.phase = "falling";
      return [];
    }

    entity.jumpAction.phase = "rising";

    return [
      {
        id: entity.id,
        x: 0,
        y: -entity.jump.impulse,
      },
    ];
  });
}
