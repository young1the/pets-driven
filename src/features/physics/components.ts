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
 */
export type PhysicsBodyComponent = {
  type: "PhysicsBody";
  shape: "rectangle";
  width: number;
  height: number;
};

/** Surface tuning for physics bodies. */
export type PhysicsMaterialComponent = {
  type: "PhysicsMaterial";
  friction: number;
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
