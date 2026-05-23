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
} from "@/features/locomotion/components";

export type {
  CanWalkComponent,
  MovementProfileComponent,
  NavigationStateComponent,
  WandersOnArrivalComponent,
} from "@/features/walking/components";

export type {
  CanJumpComponent,
  JumpActionPhase,
  JumpActionStateComponent,
} from "@/features/jumping/components";

export type { CanFlyComponent } from "@/features/flight/components";

export type {
  CanWallClimbComponent,
  ClimbableSurfaceComponent,
  ClimbIntentStateComponent,
  ClimbDismountPhase,
  ClimbDismountStateComponent,
} from "@/features/climbing/components";

import type { TransformComponent, PhysicsBodyComponent, PhysicsMaterialComponent, GroundComponent } from "@/features/physics/components";
import type { ContactStateComponent } from "@/features/contact/components";
import type { IntentStateComponent, PetIdentityComponent, UserAnchorComponent, BehaviorDecisionStateComponent } from "@/features/behavior/components";
import type { AgentBindingComponent, ActivityStateComponent, CompletionBehaviorComponent, SpeechProfileComponent, SpeechStateComponent, IdleConversationComponent } from "@/features/stimulus/components";
import type { WalkingStateComponent, ClimbingStateComponent, FlyingStateComponent, AirborneStateComponent, MotionTargetComponent } from "@/features/locomotion/components";
import type { CanWalkComponent, MovementProfileComponent, NavigationStateComponent, WandersOnArrivalComponent } from "@/features/walking/components";
import type { CanJumpComponent, JumpActionStateComponent } from "@/features/jumping/components";
import type { CanFlyComponent } from "@/features/flight/components";
import type { CanWallClimbComponent, ClimbableSurfaceComponent, ClimbIntentStateComponent, ClimbDismountStateComponent } from "@/features/climbing/components";

export type SimulationComponent =
  | ActivityStateComponent
  | AgentBindingComponent
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
