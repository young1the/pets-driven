export type PetIntent = "idle" | "active" | "seek";

export type Vector = {
  x: number;
  y: number;
};

export type CompletionIntent = "idle" | "seek";
export type LocomotionBaseMode = "walk" | "fly" | "climb";

/**
 * Marker for environmental entities that a climbing-capable pet can attach to.
 * Position belongs to Transform; this component only identifies the surface.
 */
export type ClimbableSurfaceComponent = {
  type: "ClimbableSurface";
};

/**
 * Personality component for pets that keep wandering after reaching a target.
 */
export type WandersOnArrivalComponent = {
  type: "WandersOnArrival";
  arrivalRadius: number;
};

/**
 * Connects a pet entity to the external agent or hook source it represents.
 */
export type AgentBindingComponent = {
  type: "AgentBinding";
  sourceId: string;
};

/**
 * Tracks when the entity last received meaningful activity from its source.
 */
export type ActivityStateComponent = {
  type: "ActivityState";
  lastActiveAt: number;
};

/**
 * Runtime behavior selected when a source reports task completion.
 */
export type CompletionBehaviorComponent = {
  type: "CompletionBehavior";
  intentAfterCompletion: CompletionIntent;
};

/**
 * Runtime environmental contact sensed for an entity.
 */
export type ContactStateComponent = {
  type: "ContactState";
  grounded: boolean;
  climbableSurfaceId: string | null;
  climbableSurfacePosition: Vector | null;
};

/**
 * Runtime capability that triggers speech after the entity has been idle.
 */
export type IdleConversationComponent = {
  type: "IdleConversation";
  idleAfterMs: number;
};

/**
 * Flight movement tuning. Component presence means the entity can fly; the
 * active locomotion state decides whether flight is currently in control.
 */
export type FlightMovementComponent = {
  type: "FlightMovement";
  gravityScale: number;
  hoverStrength: number;
};

/**
 * Current long-lived locomotion mode. Short-lived actions such as jump are
 * represented by their own request state instead of becoming base modes.
 */
export type LocomotionStateComponent = {
  type: "LocomotionState";
  baseMode: LocomotionBaseMode;
};

/**
 * Walk movement tuning. Component presence means the entity can walk; walking
 * only runs when LocomotionState selects the walk mode.
 */
export type WalkMovementComponent = {
  type: "WalkMovement";
  speed: number;
};

/**
 * Jump movement tuning. Component presence means the entity can jump; jumping
 * runs when JumpState requests a one-shot jump action.
 */
export type JumpMovementComponent = {
  type: "JumpMovement";
  impulse: number;
};

/**
 * Mutable jump request state. A pending jump is consumed by JumpSystem so a
 * jump applies one impulse instead of becoming continuous upward thrust.
 */
export type JumpStateComponent = {
  type: "JumpState";
  pending: boolean;
};

/**
 * Wall-climb movement tuning. Component presence means the entity can climb
 * vertical surfaces; climbing only runs when LocomotionState selects climb.
 */
export type WallClimbMovementComponent = {
  type: "WallClimbMovement";
  speed: number;
};

/**
 * Marker for entities that act as immovable ground or platform surfaces.
 */
export type GroundComponent = {
  type: "Ground";
};

/**
 * Stores the current high-level behavior intent selected for the entity.
 */
export type IntentStateComponent = {
  type: "IntentState";
  intent: PetIntent;
};

/**
 * Stores the entity or world position the pet is currently trying to reach.
 */
export type MotionTargetComponent = {
  type: "MotionTarget";
  targetEntityId: string | null;
  targetPosition: Vector | null;
};

/**
 * Stores temporary pathing decisions, such as predictive avoidance waypoints.
 */
export type NavigationStateComponent = {
  type: "NavigationState";
  avoidanceWaypoint: Vector | null;
};

/**
 * Defines how quickly the entity moves for each intent.
 */
export type MovementProfileComponent = {
  type: "MovementProfile";
  idleSpeed: number;
  activeSpeed: number;
  seekSpeed: number;
};

/**
 * Human-facing identity for rendering and status panels.
 */
export type PetIdentityComponent = {
  type: "PetIdentity";
  name: string;
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

/**
 * Surface tuning for physics bodies.
 */
export type PhysicsMaterialComponent = {
  type: "PhysicsMaterial";
  friction: number;
  restitution: number;
};

/**
 * Live speech bubble state. SpeechProfile defines defaults; this stores output.
 */
export type SpeechStateComponent = {
  type: "SpeechState";
  speech: string | null;
};

/**
 * Default speech lines used when an event does not provide its own summary.
 */
export type SpeechProfileComponent = {
  type: "SpeechProfile";
  idleCompanion: string;
  attentionNeeded: string;
  taskStarted: string | null;
  taskCompleted: string | null;
};

/**
 * World-space position shared by AI, physics sync, and rendering.
 */
export type TransformComponent = {
  type: "Transform";
  position: Vector;
};

/**
 * Marker for the entity that represents the user as a seekable target.
 * Position belongs to Transform; this component only identifies the anchor.
 */
export type UserAnchorComponent = {
  type: "UserAnchor";
};

export type SimulationComponent =
  | ActivityStateComponent
  | AgentBindingComponent
  | ClimbableSurfaceComponent
  | CompletionBehaviorComponent
  | ContactStateComponent
  | FlightMovementComponent
  | GroundComponent
  | IdleConversationComponent
  | IntentStateComponent
  | JumpMovementComponent
  | JumpStateComponent
  | LocomotionStateComponent
  | MotionTargetComponent
  | NavigationStateComponent
  | MovementProfileComponent
  | PetIdentityComponent
  | PhysicsBodyComponent
  | PhysicsMaterialComponent
  | SpeechProfileComponent
  | SpeechStateComponent
  | TransformComponent
  | UserAnchorComponent
  | WandersOnArrivalComponent
  | WallClimbMovementComponent
  | WalkMovementComponent;

export type SimulationComponentType = SimulationComponent["type"];

export type ComponentOf<TType extends SimulationComponentType> = Extract<
  SimulationComponent,
  { type: TType }
>;
