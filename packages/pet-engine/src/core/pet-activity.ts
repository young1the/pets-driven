import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";

/**
 * Canonical "what is this pet doing right now" key, derived once in the engine
 * so every UI surface (card chip, overlay capsule, diagnostics) reads the same
 * answer instead of re-deriving it from scattered snapshot fields. Keys are
 * stable identifiers a localization layer can translate directly.
 */
export type PetActivityKind =
  | "exploring"
  | "climbing"
  | "hopping"
  | "midAir"
  | "headingOver"
  | "makingFriends"
  | "foundAFriend"
  | "keepingDistance"
  | "startled"
  | "chasingCursor"
  | "caughtCursor"
  | "beingPetted"
  | "chatting"
  | "playing"
  | "onTheMove";

/**
 * Reasons that describe a *movement* the pet may still be executing after the
 * short decision claim expires (autonomous claims last only 500ms while the
 * walk they started can run for seconds). For these, the claim stays the best
 * description of the motion as long as the pet's intent is still non-idle.
 */
const DECISION_ACTIVITY: Record<string, PetActivityKind> = {
  "seek-user": "headingOver",
  "chase-cursor": "chasingCursor",
  "chase-cursor-success": "caughtCursor",
  petting: "beingPetted",
  "approach-pet": "makingFriends",
  "collision-engage": "makingFriends",
  "approach-pet-success": "foundAFriend",
  "flee-from-pet": "keepingDistance",
  "collision-flee": "keepingDistance",
  "collision-avoid": "keepingDistance",
  "wander-near": "exploring",
  "wander-far": "exploring",
  "working-wander": "exploring",
  "request-climb": "climbing",
  "request-jump": "hopping",
  "collision-jump": "hopping",
  "play-romp": "hopping",
  "idle conversation": "chatting",
  // Social sessions (SocialInteractionSystem claims reason `session-${kind}`).
  // These read as the Activity axis even while the pets stand still mid-chat,
  // because the session re-claims every tick so the claim stays unexpired.
  "session-greet": "makingFriends",
  "session-chat": "chatting",
  "session-chase": "playing",
  "social-invite": "makingFriends",
  socialized: "foundAFriend",
};

/**
 * Derive the pet's current activity, or null when it is simply standing by.
 *
 * Priority: an active expression overlay (petting / cursor-catch reactions
 * carry their own state) → a pending collision deliberation (the visible
 * "freeze") → the physical action (climb/jump/airborne) → the behavior
 * decision claim → the coarse intent.
 *
 * The decision claim is used only while it is still *true*: either unexpired,
 * or the pet is still executing the movement it started (intent non-idle).
 * This is what keeps a pet that finished fleeing seconds ago from reading as
 * "keeping distance" while it stands still.
 */
export function derivePetActivity(
  components: ComponentStore,
  id: string,
  now: number,
): PetActivityKind | null {
  const expression = components.getComponent(id, "PetExpressionState");
  if (expression && expression.expiresAt > now) {
    if (expression.source === "petting") return "beingPetted";
    if (expression.source === "chase-cursor") return "caughtCursor";
  }

  const pendingReaction = components.getComponent(id, "PendingReaction");
  if (pendingReaction && now < pendingReaction.reactsAt) return "startled";

  if (
    components.getComponent(id, "ClimbDismountState") ||
    components.getComponent(id, "ClimbIntentState") ||
    components.getComponent(id, "ClimbingTag")
  ) {
    return "climbing";
  }
  if (components.getComponent(id, "JumpActionState")) return "hopping";
  if (components.getComponent(id, "AirborneTag")) return "midAir";

  const intent = components.getComponent(id, "IntentState")?.intent ?? "idle";

  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (decision) {
    const stillExecuting = intent !== "idle";
    const unexpired = decision.expiresAt > now;
    if (stillExecuting || unexpired) {
      const activity = DECISION_ACTIVITY[decision.reason];
      if (activity) return activity;
    }
  }

  if (intent === "seek") return "headingOver";
  if (intent === "active") return "onTheMove";
  return null;
}
