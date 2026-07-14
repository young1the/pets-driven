export type {
  PerceivedEntity,
  PerceptionComponent,
} from "@pets-driven/pet-engine/features/perception/components";
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
  SteeringMode,
  SteeringComponent,
  PetIdentityComponent,
  UserAnchorComponent,
  BehaviorDecisionSource,
  BehaviorDecisionStateComponent,
  PersonalityComponent,
  BehaviorDecisionKind,
  BehaviorDecisionTokenComponent,
  ReactionSource,
  PendingReactionComponent,
  PetExpressionSource,
  PetExpressionMood,
  PetExpressionEmote,
  PetExpressionStateComponent,
  RompStateComponent,
  FeintStateComponent,
  CollisionMemoryComponent,
} from "@pets-driven/pet-engine/features/behavior/components";

export type {
  CompletionIntent,
  AgentBindingComponent,
  AgentChannelSource,
  AgentChannelStatus,
  AgentChannelStateComponent,
  ActivityStateComponent,
  CompletionBehaviorComponent,
  TaskMovementHoldComponent,
  SpeechProfileComponent,
  SpeechStateComponent,
  IdleConversationComponent,
} from "@pets-driven/pet-engine/features/agent/components";

export type { AgentTaskStateComponent } from "@pets-driven/pet-engine/features/agent/agent-task-state";

export type {
  WalkingTagComponent,
  ClimbingTagComponent,
  FlyingTagComponent,
  AirborneTagComponent,
  MotionTargetComponent,
  TravelStateComponent,
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

export type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
export type {
  MoodStateComponent,
  PetExperienceKind,
  RecentExperience,
  RecentExperienceMemoryComponent,
} from "@pets-driven/pet-engine/features/mood/components";
export type {
  CursorSample,
  CursorStateComponent,
  CursorInputComponent,
} from "@pets-driven/pet-engine/features/cursor/components";
export type {
  CanSocializeComponent,
  SocialSessionKind,
  SocialSessionPhase,
  SocialInviteComponent,
  SocialSessionComponent,
  SocialSessionMemberComponent,
} from "@pets-driven/pet-engine/features/social/components";

import type { PerceptionComponent } from "@pets-driven/pet-engine/features/perception/components";
import type {
  TransformComponent,
  PhysicsBodyComponent,
  PhysicsMaterialComponent,
  GroundComponent,
  PetCollisionComponent,
} from "@pets-driven/pet-engine/features/physics/components";
import type { ContactStateComponent } from "@pets-driven/pet-engine/features/contact/components";
import type {
  SteeringComponent,
  PetIdentityComponent,
  UserAnchorComponent,
  BehaviorDecisionStateComponent,
  PersonalityComponent,
  BehaviorDecisionTokenComponent,
  PendingReactionComponent,
  PetExpressionStateComponent,
  RompStateComponent,
  FeintStateComponent,
  CollisionMemoryComponent,
} from "@pets-driven/pet-engine/features/behavior/components";
import type {
  AgentBindingComponent,
  AgentChannelStateComponent,
  ActivityStateComponent,
  CompletionBehaviorComponent,
  TaskMovementHoldComponent,
  SpeechProfileComponent,
  SpeechStateComponent,
  IdleConversationComponent,
} from "@pets-driven/pet-engine/features/agent/components";
import type { AgentTaskStateComponent } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import type {
  WalkingTagComponent,
  ClimbingTagComponent,
  FlyingTagComponent,
  AirborneTagComponent,
  MotionTargetComponent,
  TravelStateComponent,
} from "@pets-driven/pet-engine/features/movement/components";
import type {
  CanWalkComponent,
  MovementProfileComponent,
  WandersOnArrivalComponent,
} from "@pets-driven/pet-engine/features/movement/components";
import type {
  CanJumpComponent,
  JumpActionStateComponent,
} from "@pets-driven/pet-engine/features/movement/components";
import type { CanFlyComponent } from "@pets-driven/pet-engine/features/movement/components";
import type {
  CanWallClimbComponent,
  ClimbableSurfaceComponent,
  ClimbIntentStateComponent,
  ClimbDismountStateComponent,
} from "@pets-driven/pet-engine/features/movement/components";
import type {
  CanDragComponent,
  CanControlComponent,
  KeyboardControlTargetComponent,
  KeyboardInputStateComponent,
  DragInteractionComponent,
  ThrowImpulseComponent,
} from "@pets-driven/pet-engine/features/interaction/components";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import type {
  MoodStateComponent,
  RecentExperienceMemoryComponent,
} from "@pets-driven/pet-engine/features/mood/components";
import type {
  CursorStateComponent,
  CursorInputComponent,
} from "@pets-driven/pet-engine/features/cursor/components";
import type {
  CanSocializeComponent,
  SocialInviteComponent,
  SocialSessionComponent,
  SocialSessionMemberComponent,
} from "@pets-driven/pet-engine/features/social/components";

export type Component =
  | ActivityStateComponent
  | AgentChannelStateComponent
  | PetExpressionStateComponent
  | PendingReactionComponent
  | BehaviorDecisionTokenComponent
  | CanControlComponent
  | CanDragComponent
  | CanSocializeComponent
  | SocialInviteComponent
  | SocialSessionComponent
  | SocialSessionMemberComponent
  | PerceptionComponent
  | AgentBindingComponent
  | AgentTaskStateComponent
  | PersonalityComponent
  | AirborneTagComponent
  | BehaviorDecisionStateComponent
  | CanFlyComponent
  | CanJumpComponent
  | CanWalkComponent
  | CanWallClimbComponent
  | ClimbDismountStateComponent
  | ClimbIntentStateComponent
  | ClimbableSurfaceComponent
  | ClimbingTagComponent
  | CollisionMemoryComponent
  | CompletionBehaviorComponent
  | ContactStateComponent
  | CursorStateComponent
  | CursorInputComponent
  | DragInteractionComponent
  | DrivesComponent
  | MoodStateComponent
  | RecentExperienceMemoryComponent
  | FlyingTagComponent
  | GroundComponent
  | IdleConversationComponent
  | SteeringComponent
  | JumpActionStateComponent
  | KeyboardControlTargetComponent
  | KeyboardInputStateComponent
  | MotionTargetComponent
  | MovementProfileComponent
  | PetCollisionComponent
  | PetIdentityComponent
  | PhysicsBodyComponent
  | PhysicsMaterialComponent
  | RompStateComponent
  | FeintStateComponent
  | SpeechProfileComponent
  | SpeechStateComponent
  | TaskMovementHoldComponent
  | TransformComponent
  | TravelStateComponent
  | ThrowImpulseComponent
  | UserAnchorComponent
  | WalkingTagComponent
  | WandersOnArrivalComponent;

export type ComponentType = Component["type"];

export type ComponentOf<TType extends ComponentType> = Extract<Component, { type: TType }>;
