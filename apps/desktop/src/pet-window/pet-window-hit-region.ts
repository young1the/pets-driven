import type {
  PetWindowHitLayout,
  PetWindowHitResult,
  PetWindowPoint,
  PetWindowRect,
} from "@/pet-window/pet-window-types";

function containsPoint(rect: PetWindowRect, point: PetWindowPoint) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function classifyPetWindowPoint(
  layout: PetWindowHitLayout,
  point: PetWindowPoint,
): PetWindowHitResult {
  if (layout.overlay && containsPoint(layout.overlay, point)) {
    return {
      kind: "overlay",
      startsDirectManipulation: false,
    };
  }

  if (containsPoint(layout.body, point)) {
    return {
      kind: "body",
      startsDirectManipulation: true,
    };
  }

  return {
    kind: "transparent",
    startsDirectManipulation: false,
  };
}
