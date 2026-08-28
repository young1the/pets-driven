export type Vector = {
  x: number;
  y: number;
};

/** World-space position shared by AI, physics sync, and rendering. */
export type TransformComponent = {
  type: "Transform";
  position: Vector;
};

/**
 * Requests a physics body for the entity. Initial placement comes from Transform;
 * physics updates are copied back into Transform by the transform sync system.
 *
 * `width`/`height` are the body's bounding box whatever the shape is, so every
 * caller that only needs a half-extent (contact tests, hit testing, the
 * pet-to-pet overlap sweep) reads them without caring which shape it got. A
 * circle is the square case of that box: its radius is `width / 2`, and the two
 * are kept equal rather than carried as a third field nothing could keep in
 * sync. Shape-specific work — Matter body construction, `setBodySize`, the
 * floor-span scan a trinket drops onto — branches on `shape` explicitly, which
 * is also what keeps a rolling ball from ever being mistaken for a floor.
 */
export type PhysicsBodyComponent = {
  type: "PhysicsBody";
  shape: "rectangle" | "circle";
  width: number;
  height: number;
};

/** Surface tuning for physics bodies. */
export type PhysicsMaterialComponent = {
  type: "PhysicsMaterial";
  friction: number;
  frictionAir?: number;
  restitution: number;
};

/** Marker for entities that act as immovable ground or platform surfaces. */
export type GroundComponent = {
  type: "Ground";
};

/** Physics-derived pet-to-pet contact used as a behavior trigger. */
export type PetCollisionComponent = {
  type: "PetCollision";
  otherEntityId: string;
  otherPosition: Vector;
  startedAt: number;
  lastSeenAt: number;
};
