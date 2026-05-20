import type {
  ContactStateComponent,
  Vector,
} from "@/core/components/simulation-components";

const CLIMBABLE_CONTACT_X_RADIUS = 56;

type ContactEntity = {
  id: string;
  position: Vector;
  contact: ContactStateComponent;
};

type ClimbableSurface = {
  id: string;
  position: Vector;
};

export function runContactSystem(
  entities: ContactEntity[],
  climbableSurfaces: ClimbableSurface[],
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
  }
}
