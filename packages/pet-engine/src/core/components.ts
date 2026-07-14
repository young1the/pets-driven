export type { AgentTaskStateComponent } from "@pets-driven/pet-engine/features/agent/agent-task-state";
export type {
  ActivityStateComponent,
  AgentBindingComponent,
  AgentChannelSource,
  AgentChannelStateComponent,
  AgentChannelStatus,
  CompletionBehaviorComponent,
  CompletionIntent,
  IdleConversationComponent,
  SpeechProfileComponent,
  TaskMovementHoldComponent,
} from "@pets-driven/pet-engine/features/agent/components";
export type {
  BehaviorDecisionKind,
  BehaviorDecisionSource,
  BehaviorDecisionStateComponent,
  BehaviorDecisionTokenComponent,
  CollisionMemoryComponent,
  FeintStateComponent,
  PendingReactionComponent,
  PersonalityComponent,
  PetExpressionEmote,
  PetExpressionMood,
  PetExpressionSource,
  PetExpressionStateComponent,
  PetIdentityComponent,
  ReactionSource,
  RompStateComponent,
  SteeringComponent,
  SteeringMode,
  UserAnchorComponent,
} from "@pets-driven/pet-engine/features/behavior/components";

export type { ContactStateComponent } from "@pets-driven/pet-engine/features/contact/components";
export type {
  CursorInputComponent,
  CursorSample,
  CursorStateComponent,
} from "@pets-driven/pet-engine/features/cursor/components";
export type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
export type {
  CanControlComponent,
  CanDragComponent,
  DragInteractionComponent,
  KeyboardControlTargetComponent,
  KeyboardInputStateComponent,
  ThrowImpulseComponent,
} from "@pets-driven/pet-engine/features/interaction/components";
export type {
  MoodStateComponent,
  PetExperienceKind,
  RecentExperience,
  RecentExperienceMemoryComponent,
} from "@pets-driven/pet-engine/features/mood/components";
export type {
  AirborneTagComponent,
  CanFlyComponent,
  CanJumpComponent,
  CanWalkComponent,
  CanWallClimbComponent,
  ClimbableSurfaceComponent,
  ClimbDismountPhase,
  ClimbDismountStateComponent,
  ClimbIntentStateComponent,
  ClimbingTagComponent,
  FlyingTagComponent,
  JumpActionPhase,
  JumpActionStateComponent,
  MotionTargetComponent,
  MovementProfileComponent,
  TravelStateComponent,
  WalkingTagComponent,
  WandersOnArrivalComponent,
} from "@pets-driven/pet-engine/features/movement/components";
export type {
  PerceivedEntity,
  PerceptionComponent,
} from "@pets-driven/pet-engine/features/perception/components";
export type {
  GroundComponent,
  PetCollisionComponent,
  PhysicsBodyComponent,
  PhysicsMaterialComponent,
  TransformComponent,
  Vector,
} from "@pets-driven/pet-engine/features/physics/components";
export type {
  CanSocializeComponent,
  SocialInviteComponent,
  SocialSessionComponent,
  SocialSessionKind,
  SocialSessionMemberComponent,
  SocialSessionPhase,
} from "@pets-driven/pet-engine/features/social/components";

import type { AgentTaskStateComponent } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import type {
  ActivityStateComponent,
  AgentBindingComponent,
  AgentChannelStateComponent,
  CompletionBehaviorComponent,
  IdleConversationComponent,
  SpeechProfileComponent,
  TaskMovementHoldComponent,
} from "@pets-driven/pet-engine/features/agent/components";
import type {
  BehaviorDecisionStateComponent,
  BehaviorDecisionTokenComponent,
  CollisionMemoryComponent,
  FeintStateComponent,
  PendingReactionComponent,
  PersonalityComponent,
  PetExpressionStateComponent,
  PetIdentityComponent,
  RompStateComponent,
  SteeringComponent,
  UserAnchorComponent,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { ContactStateComponent } from "@pets-driven/pet-engine/features/contact/components";
import type {
  CursorInputComponent,
  CursorStateComponent,
} from "@pets-driven/pet-engine/features/cursor/components";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import type {
  CanControlComponent,
  CanDragComponent,
  DragInteractionComponent,
  KeyboardControlTargetComponent,
  KeyboardInputStateComponent,
  ThrowImpulseComponent,
} from "@pets-driven/pet-engine/features/interaction/components";
import type {
  MoodStateComponent,
  RecentExperienceMemoryComponent,
} from "@pets-driven/pet-engine/features/mood/components";
import type {
  AirborneTagComponent,
  CanFlyComponent,
  CanJumpComponent,
  CanWalkComponent,
  CanWallClimbComponent,
  ClimbableSurfaceComponent,
  ClimbDismountStateComponent,
  ClimbIntentStateComponent,
  ClimbingTagComponent,
  FlyingTagComponent,
  JumpActionStateComponent,
  MotionTargetComponent,
  MovementProfileComponent,
  TravelStateComponent,
  WalkingTagComponent,
  WandersOnArrivalComponent,
} from "@pets-driven/pet-engine/features/movement/components";
import type { PerceptionComponent } from "@pets-driven/pet-engine/features/perception/components";
import type {
  GroundComponent,
  PetCollisionComponent,
  PhysicsBodyComponent,
  PhysicsMaterialComponent,
  TransformComponent,
} from "@pets-driven/pet-engine/features/physics/components";
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
  | TaskMovementHoldComponent
  | TransformComponent
  | TravelStateComponent
  | ThrowImpulseComponent
  | UserAnchorComponent
  | WalkingTagComponent
  | WandersOnArrivalComponent;

export type ComponentType = Component["type"];

export type ComponentOf<TType extends ComponentType> = Extract<Component, { type: TType }>;
