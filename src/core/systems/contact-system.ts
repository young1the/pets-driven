import type {
  ContactStateComponent,
  PhysicsBodyComponent,
  Vector,
} from "@/core/components/simulation-components";

const CLIMBABLE_CONTACT_X_RADIUS = 56;
const GROUND_CONTACT_TOLERANCE = 4;

type ContactEntity = {
  id: string;
  position: Vector;
  body: PhysicsBodyComponent;
  contact: ContactStateComponent;
};

type ClimbableSurface = {
  id: string;
  position: Vector;
};

type GroundSurface = {
  id: string;
  position: Vector;
  size: {
    width: number;
    height: number;
  };
};

export function runContactSystem(
  entities: ContactEntity[],
  climbableSurfaces: ClimbableSurface[],
  groundSurfaces: GroundSurface[],
) {
  for (const entity of entities) {
    const nearestSurface = climbableSurfaces
      .map((surface) => ({
        surface,
        horizontalDistance: Math.abs(surface.position.x - entity.position.x),
        distance: Math.hypot(surface.position.x - entity.position.x, surface.position.y - entity.position.y),
      }))
      .filter((candidate) => candidate.horizontalDistance <= CLIMBABLE_CONTACT_X_RADIUS)
      .sort(
        (left, right) =>
          left.horizontalDistance - right.horizontalDistance ||
          left.distance - right.distance,
      )[0]?.surface;

    entity.contact.climbableSurfaceId = nearestSurface?.id ?? null;
    entity.contact.climbableSurfacePosition = nearestSurface?.position ?? null;
    entity.contact.grounded = groundSurfaces.some((ground) =>
      isRestingOnGround(entity, ground),
    );
  }
}

function isRestingOnGround(entity: ContactEntity, ground: GroundSurface) {
  const entityHalfWidth = entity.body.width / 2;
  const entityBottom = entity.position.y + entity.body.height / 2;
  const groundHalfWidth = ground.size.width / 2;
  const groundTop = ground.position.y - ground.size.height / 2;
  const horizontallyOverlaps =
    entity.position.x + entityHalfWidth >= ground.position.x - groundHalfWidth &&
    entity.position.x - entityHalfWidth <= ground.position.x + groundHalfWidth;
  const verticalGap = Math.abs(entityBottom - groundTop);

  return horizontallyOverlaps && verticalGap <= GROUND_CONTACT_TOLERANCE;
}
