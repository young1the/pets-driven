export type PetIntent = "idle" | "active" | "seek";

export type Vector = {
  x: number;
  y: number;
};

export type AgentBindingComponent = {
  type: "AgentBinding";
  sourceId: string;
};

export type ActivityStateComponent = {
  type: "ActivityState";
  lastActiveAt: number;
};

export type IntentStateComponent = {
  type: "IntentState";
  intent: PetIntent;
};

export type MotionTargetComponent = {
  type: "MotionTarget";
  targetEntityId: string | null;
  targetPosition: Vector | null;
};

export type NavigationStateComponent = {
  type: "NavigationState";
  avoidanceWaypoint: Vector | null;
};

export type MovementProfileComponent = {
  type: "MovementProfile";
  idleSpeed: number;
  activeSpeed: number;
  seekSpeed: number;
};

export type PetIdentityComponent = {
  type: "PetIdentity";
  name: string;
};

export type PhysicsBodyComponent = {
  type: "PhysicsBody";
  shape: "rectangle";
  width: number;
  height: number;
};

export type SpeechStateComponent = {
  type: "SpeechState";
  speech: string | null;
};

export type SpeechProfileComponent = {
  type: "SpeechProfile";
  idleCompanion: string;
  attentionNeeded: string;
};

export type TalkativeComponent = {
  type: "Talkative";
  idleAfterMs: number;
};

export type TransformComponent = {
  type: "Transform";
  position: Vector;
};

export type UserAnchorComponent = {
  type: "UserAnchor";
};

export type SimulationComponent =
  | ActivityStateComponent
  | AgentBindingComponent
  | IntentStateComponent
  | MotionTargetComponent
  | NavigationStateComponent
  | MovementProfileComponent
  | PetIdentityComponent
  | PhysicsBodyComponent
  | SpeechProfileComponent
  | SpeechStateComponent
  | TalkativeComponent
  | TransformComponent
  | UserAnchorComponent;

export type SimulationComponentType = SimulationComponent["type"];

export type ComponentOf<TType extends SimulationComponentType> = Extract<
  SimulationComponent,
  { type: TType }
>;
