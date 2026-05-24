import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type { Vector } from "@/features/physics/components";

const CLIMBABLE_CONTACT_X_RADIUS = 56;
const GROUND_CONTACT_TOLERANCE = 4;

type ClimbableSurface = { id: string; position: Vector };
type GroundSurface = { id: string; position: Vector; size: { width: number; height: number } };

export function runContactSystem(components: ComponentStore): void {
  const climbableSurfaces: ClimbableSurface[] = [];
  const groundSurfaces: GroundSurface[] = [];

  components.query(["Transform", "ClimbableSurface"], (_id, [transform]) => {
    climbableSurfaces.push({ id: _id, position: transform.position });
  });

  components.query(["Transform", "PhysicsBody", "Ground"], (_id, [transform, body]) => {
    groundSurfaces.push({
      id: _id,
      position: transform.position,
      size: { width: body.width, height: body.height },
    });
  });

  components.query(
    ["Transform", "PhysicsBody", "ContactState"],
    (_id, [transform, body, contact]) => {
      const pos = transform.position;

      const nearestSurface = climbableSurfaces
        .map((surface) => ({
          surface,
          horizontalDistance: Math.abs(surface.position.x - pos.x),
          distance: Math.hypot(surface.position.x - pos.x, surface.position.y - pos.y),
        }))
        .filter((c) => c.horizontalDistance <= CLIMBABLE_CONTACT_X_RADIUS)
        .sort((a, b) => a.horizontalDistance - b.horizontalDistance || a.distance - b.distance)[0]
        ?.surface;

      contact.climbableSurfaceId = nearestSurface?.id ?? null;
      contact.climbableSurfacePosition = nearestSurface?.position ?? null;
      contact.grounded = groundSurfaces.some((ground) => {
        const entityHalfWidth = body.width / 2;
        const entityBottom = pos.y + body.height / 2;
        const groundHalfWidth = ground.size.width / 2;
        const groundTop = ground.position.y - ground.size.height / 2;
        const horizontallyOverlaps =
          pos.x + entityHalfWidth >= ground.position.x - groundHalfWidth &&
          pos.x - entityHalfWidth <= ground.position.x + groundHalfWidth;
        return horizontallyOverlaps && Math.abs(entityBottom - groundTop) <= GROUND_CONTACT_TOLERANCE;
      });
    },
  );
}

// ── System descriptor ──────────────────────────────────────────────────────

export const ContactSystem: SimulationSystem<WorldStepContext> = {
  name: "ContactSystem",
  dependsOn: ["PhysicsTransformSyncSystemPre"],
  reads: ["Transform", "PhysicsBody", "ContactState", "ClimbableSurface", "Ground"],
  writes: ["ContactState"],
  update(ctx) {
    runContactSystem(ctx.components);
  },
};
