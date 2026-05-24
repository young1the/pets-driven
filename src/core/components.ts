export type { PerceivedEntity, PerceptionComponent } from "@/features/perception/components";
export type { Vector } from "@/features/physics/components";
export type {
  TransformComponent,
  PhysicsBodyComponent,
  PhysicsMaterialComponent,
  GroundComponent,
} from "@/features/physics/components";

export type { ContactStateComponent } from "@/features/contact/components";

export type {
  PetIntent,
  IntentStateComponent,
  PetIdentityComponent,
  UserAnchorComponent,
  BehaviorDecisionSource,
  BehaviorDecisionStateComponent,
  PersonalityComponent,
  BehaviorDecisionKind,
  BehaviorDecisionTokenComponent,
} from "@/features/behavior/components";

export type {
  CompletionIntent,
  AgentBindingComponent,
  ActivityStateComponent,
  CompletionBehaviorComponent,
  SpeechProfileComponent,
  SpeechStateComponent,
  IdleConversationComponent,
} from "@/features/stimulus/components";

export type {
  WalkingStateComponent,
  ClimbingStateComponent,
  FlyingStateComponent,
  AirborneStateComponent,
  MotionTargetComponent,
} from "@/features/movement/components";

export type {
  CanWalkComponent,
  MovementProfileComponent,
  NavigationStateComponent,
  WandersOnArrivalComponent,
} from "@/features/movement/components";

export type {
  CanJumpComponent,
  JumpActionPhase,
  JumpActionStateComponent,
} from "@/features/movement/components";

export type { CanFlyComponent } from "@/features/movement/components";

export type {
  CanWallClimbComponent,
  ClimbableSurfaceComponent,
  ClimbIntentStateComponent,
  ClimbDismountPhase,
  ClimbDismountStateComponent,
} from "@/features/movement/components";

import type { PerceptionComponent } from "@/features/perception/components";
import type { TransformComponent, PhysicsBodyComponent, PhysicsMaterialComponent, GroundComponent } from "@/features/physics/components";
import type { ContactStateComponent } from "@/features/contact/components";
import type { IntentStateComponent, PetIdentityComponent, UserAnchorComponent, BehaviorDecisionStateComponent, PersonalityComponent, BehaviorDecisionTokenComponent } from "@/features/behavior/components";
import type { AgentBindingComponent, ActivityStateComponent, CompletionBehaviorComponent, SpeechProfileComponent, SpeechStateComponent, IdleConversationComponent } from "@/features/stimulus/components";
import type { WalkingStateComponent, ClimbingStateComponent, FlyingStateComponent, AirborneStateComponent, MotionTargetComponent } from "@/features/movement/components";
import type { CanWalkComponent, MovementProfileComponent, NavigationStateComponent, WandersOnArrivalComponent } from "@/features/movement/components";
import type { CanJumpComponent, JumpActionStateComponent } from "@/features/movement/components";
import type { CanFlyComponent } from "@/features/movement/components";
import type { CanWallClimbComponent, ClimbableSurfaceComponent, ClimbIntentStateComponent, ClimbDismountStateComponent } from "@/features/movement/components";

export type SimulationComponent =
  | ActivityStateComponent
  | BehaviorDecisionTokenComponent
  | PerceptionComponent
  | AgentBindingComponent
  | PersonalityComponent
  | AirborneStateComponent
  | BehaviorDecisionStateComponent
  | CanFlyComponent
  | CanJumpComponent
  | CanWalkComponent
  | CanWallClimbComponent
  | ClimbDismountStateComponent
  | ClimbIntentStateComponent
  | ClimbableSurfaceComponent
  | ClimbingStateComponent
  | CompletionBehaviorComponent
  | ContactStateComponent
  | FlyingStateComponent
  | GroundComponent
  | IdleConversationComponent
  | IntentStateComponent
  | JumpActionStateComponent
  | MotionTargetComponent
  | MovementProfileComponent
  | NavigationStateComponent
  | PetIdentityComponent
  | PhysicsBodyComponent
  | PhysicsMaterialComponent
  | SpeechProfileComponent
  | SpeechStateComponent
  | TransformComponent
  | UserAnchorComponent
  | WalkingStateComponent
  | WandersOnArrivalComponent;

export type SimulationComponentType = SimulationComponent["type"];

export type ComponentOf<TType extends SimulationComponentType> = Extract<
  SimulationComponent,
  { type: TType }
>;
