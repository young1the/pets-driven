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
  | "dancing"
  | "onTheMove"
  // Expressive idle poses and catalog-exclusive signature activities.
  | "greeting"
  | "grooming"
  | "observing"
  | "beckoning"
  | "fretting"
  | "napping"
  | "meditating"
  | "teasing"
  | "keepingWatch"
  | "peeking"
  | "seekingSolitude"
  | "investigating"
  | "followingRoutine"
  | "strutting"
  | "offeringComfort"
  | "keepingLookout"
  // Second signature activity per personality.
  | "capering"
  | "checkingIn"
  | "hidingAway"
  | "exploringNook"
  | "tidyingUp"
  | "posturing"
  | "nurturing"
  | "scheming"
  | "lounging"
  | "centering"
  | "preening"
  | "scanningNervously"
  | "appraising"
  // Working beats — what the pet is doing while its bound agent runs.
  | "headsDown"
  | "tinkering"
  | "mullingOver"
  | "fussingOver"
  | "dawdling"
  | "pacing";

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
  // Hover reactions (cursor over a moving pet); the reason encodes the
  // personality-selected reaction so the activity label matches the pose.
  "hover-startle": "startled",
  "hover-greet": "greeting",
  "hover-affection": "beckoning",
  "hover-observe": "observing",
  "approach-pet": "makingFriends",
  "collision-engage": "makingFriends",
  "approach-pet-success": "foundAFriend",
  "flee-from-pet": "keepingDistance",
  "collision-flee": "keepingDistance",
  "collision-avoid": "keepingDistance",
  "wander-near": "exploring",
  "wander-far": "exploring",
  // Working beats. The pacing one is a movement reason (the walk outlives its
  // claim); the focus poses hold a stationary claim and read from it directly.
  "working-wander": "pacing",
  "working-focus": "headsDown",
  "working-tinker": "tinkering",
  "working-ponder": "mullingOver",
  "working-fuss": "fussingOver",
  "working-loaf": "dawdling",
  "request-climb": "climbing",
  "request-jump": "hopping",
  "collision-jump": "hopping",
  "play-romp": "hopping",
  "play-feint": "teasing",
  "keep-watch": "keepingWatch",
  peek: "peeking",
  withdraw: "seekingSolitude",
  inspect: "investigating",
  "follow-routine": "followingRoutine",
  strut: "strutting",
  "offer-comfort": "offeringComfort",
  "stand-lookout": "keepingLookout",
  // Second signature poses. Like the first-tier expressive poses below, these
  // hold a stationary claim, so they read from the unexpired claim directly.
  caper: "capering",
  "check-in": "checkingIn",
  "hide-away": "hidingAway",
  "explore-nook": "exploringNook",
  "tidy-up": "tidyingUp",
  posture: "posturing",
  nurture: "nurturing",
  scheme: "scheming",
  lounge: "lounging",
  center: "centering",
  preen: "preening",
  "startle-scan": "scanningNervously",
  appraise: "appraising",
  // Expressive idle poses hold a stationary claim (Steering stays "stand"), so
  // unlike the movement reasons above they read purely from the unexpired
  // claim, not from a non-idle intent.
  greet: "greeting",
  groom: "grooming",
  observe: "observing",
  beckon: "beckoning",
  fret: "fretting",
  nap: "napping",
  meditate: "meditating",
  "idle conversation": "chatting",
  // Social sessions (SocialInteractionSystem claims reason `session-${kind}`).
  // These read as the Activity axis even while the pets stand still mid-chat,
  // because the session re-claims every tick so the claim stays unexpired.
  "session-greet": "makingFriends",
  "session-chat": "chatting",
  "session-chase": "playing",
  "session-dance": "dancing",
  "signature-reaction-join": "playing",
  "signature-reaction-cheer": "makingFriends",
  "signature-reaction-watch": "observing",
  "signature-reaction-keep-distance": "keepingDistance",
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

  const mode = components.getComponent(id, "Steering")?.mode ?? "stand";

  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (decision) {
    const stillExecuting = mode !== "stand";
    const unexpired = decision.expiresAt > now;
    if (stillExecuting || unexpired) {
      const activity = DECISION_ACTIVITY[decision.reason];
      if (activity) return activity;
    }
  }

  if (mode === "arrive") return "headingOver";
  if (mode === "pursue") return "onTheMove";
  return null;
}
