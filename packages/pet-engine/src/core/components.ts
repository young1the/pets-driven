export type { PerceivedEntity, PerceptionComponent } from "@pets-driven/pet-engine/features/perception/components";
export type { Vector } from "@pets-driven/pet-engine/features/physics/components";
export type {
  TransformComponent,
  PhysicsBodyComponent,
  PhysicsMaterialComponent,
  GroundComponent,
  PetCollisionComponent,
} from "@pets-driven/pet-engine/features/physics/components";

export type { ContactStateComponent } from "@pets-driven/pet-engine/features/contact/components";

export type {
  PetIntent,
  IntentStateComponent,
  PetIdentityComponent,
  UserAnchorComponent,
  BehaviorDecisionSource,
  BehaviorDecisionStateComponent,
  HeldAgentStateComponent,
  PersonalityComponent,
  BehaviorDecisionKind,
  BehaviorDecisionTokenComponent,
  ReactionSource,
  PendingReactionComponent,
} from "@pets-driven/pet-engine/features/behavior/components";

export type {
  CompletionIntent,
  AgentBindingComponent,
  ActivityStateComponent,
  CompletionBehaviorComponent,
  SpeechProfileComponent,
  SpeechStateComponent,
  IdleConversationComponent,
} from "@pets-driven/pet-engine/features/agent/components";

export type {
  WalkingTagComponent,
  ClimbingTagComponent,
  FlyingTagComponent,
  AirborneTagComponent,
  MotionTargetComponent,
} from "@pets-driven/pet-engine/features/movement/components";

export type {
  CanWalkComponent,
  MovementProfileComponent,
  WandersOnArrivalComponent,
} from "@pets-driven/pet-engine/features/movement/components";

export type {
  CanJumpComponent,
  JumpActionPhase,
  JumpActionStateComponent,
} from "@pets-driven/pet-engine/features/movement/components";

export type { CanFlyComponent } from "@pets-driven/pet-engine/features/movement/components";

export type {
  CanWallClimbComponent,
  ClimbableSurfaceComponent,
  ClimbIntentStateComponent,
  ClimbDismountPhase,
  ClimbDismountStateComponent,
} from "@pets-driven/pet-engine/features/movement/components";

export type {
  CanDragComponent,
  CanControlComponent,
  KeyboardControlTargetComponent,
  KeyboardInputStateComponent,
  DragInteractionComponent,
  ThrowImpulseComponent,
} from "@pets-driven/pet-engine/features/interaction/components";

import type { PerceptionComponent } from "@pets-driven/pet-engine/features/perception/components";
import type { TransformComponent, PhysicsBodyComponent, PhysicsMaterialComponent, GroundComponent, PetCollisionComponent } from "@pets-driven/pet-engine/features/physics/components";
import type { ContactStateComponent } from "@pets-driven/pet-engine/features/contact/components";
import type { IntentStateComponent, PetIdentityComponent, UserAnchorComponent, BehaviorDecisionStateComponent, HeldAgentStateComponent, PersonalityComponent, BehaviorDecisionTokenComponent, PendingReactionComponent } from "@pets-driven/pet-engine/features/behavior/components";
import type { AgentBindingComponent, ActivityStateComponent, CompletionBehaviorComponent, SpeechProfileComponent, SpeechStateComponent, IdleConversationComponent } from "@pets-driven/pet-engine/features/agent/components";
import type { WalkingTagComponent, ClimbingTagComponent, FlyingTagComponent, AirborneTagComponent, MotionTargetComponent } from "@pets-driven/pet-engine/features/movement/components";
import type { CanWalkComponent, MovementProfileComponent, WandersOnArrivalComponent } from "@pets-driven/pet-engine/features/movement/components";
import type { CanJumpComponent, JumpActionStateComponent } from "@pets-driven/pet-engine/features/movement/components";
import type { CanFlyComponent } from "@pets-driven/pet-engine/features/movement/components";
import type { CanWallClimbComponent, ClimbableSurfaceComponent, ClimbIntentStateComponent, ClimbDismountStateComponent } from "@pets-driven/pet-engine/features/movement/components";
import type { CanDragComponent, CanControlComponent, KeyboardControlTargetComponent, KeyboardInputStateComponent, DragInteractionComponent, ThrowImpulseComponent } from "@pets-driven/pet-engine/features/interaction/components";

export type Component =
  | ActivityStateComponent
  | PendingReactionComponent
  | BehaviorDecisionTokenComponent
  | CanControlComponent
  | CanDragComponent
  | PerceptionComponent
  | AgentBindingComponent
  | PersonalityComponent
  | AirborneTagComponent
  | BehaviorDecisionStateComponent
  | HeldAgentStateComponent
  | CanFlyComponent
  | CanJumpComponent
  | CanWalkComponent
  | CanWallClimbComponent
  | ClimbDismountStateComponent
  | ClimbIntentStateComponent
  | ClimbableSurfaceComponent
  | ClimbingTagComponent
  | CompletionBehaviorComponent
  | ContactStateComponent
  | DragInteractionComponent
  | FlyingTagComponent
  | GroundComponent
  | IdleConversationComponent
  | IntentStateComponent
  | JumpActionStateComponent
  | KeyboardControlTargetComponent
  | KeyboardInputStateComponent
  | MotionTargetComponent
  | MovementProfileComponent
  | PetCollisionComponent
  | PetIdentityComponent
  | PhysicsBodyComponent
  | PhysicsMaterialComponent
  | SpeechProfileComponent
  | SpeechStateComponent
  | TransformComponent
  | ThrowImpulseComponent
  | UserAnchorComponent
  | WalkingTagComponent
  | WandersOnArrivalComponent;

export type ComponentType = Component["type"];

export type ComponentOf<TType extends ComponentType> = Extract<
  Component,
  { type: TType }
>;
