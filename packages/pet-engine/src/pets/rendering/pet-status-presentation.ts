import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { AgentChannelStatus } from "@pets-driven/pet-engine/features/agent/components";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { PetSpriteOverlay } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import type { PetEmoteKind, PetMood } from "@pets-driven/pet-engine/pets/status/pet-mood";

/**
 * Pure mapping from simulation-side presentation data (the sprite's current
 * animation row + host-driven overlay) to the pet-status rendering primitives
 * (capsule mood/label + corner emote). No Tauri, no DOM — unit-testable.
 */
/**
 * Stable identifier for a status label, so a localization layer can translate
 * it without parsing the English source string. `null` means the label is
 * host-supplied free text (speech/attention overlays) that has no fixed key.
 * The values match the `petStatus.*` keys in the desktop translation bundle.
 */
export type PetStatusLabelKey =
  | "idle"
  | "working"
  | "waiting"
  | "done"
  | "failed"
  | "stuck"
  | "reviewing"
  | PetActivityKind
  // Partner-aware variants of the social activities (need a {{name}} param).
  | "chattingWith"
  | "playingWith"
  | "makingFriendsWith";

/**
 * Whether a status belongs to the agent work lifecycle or to ambient
 * play/idle. Drives the host's decision to color the capsule (work) or keep
 * it neutral (ambient).
 */
export type PetStatusTone = "work" | "ambient";

export type PetStatusPresentation = {
  mood: PetMood;
  /**
   * Whether the status reflects an agent work lifecycle ("work": working,
   * waiting, done, failed, reviewing, or an attention prompt) or an ambient
   * play/idle state. Hosts reserve the mood accent color for "work" so that
   * color reads as "this pet is doing agent work"; ambient states render in a
   * neutral tone and rely on the pet's name and dialogue instead.
   */
  tone: PetStatusTone;
  /** Capsule label; null lets the mood's default label show. */
  label: string | null;
  /**
   * Stable key for the label, for localization. `null` when `label` is
   * host-supplied free text with no fixed key.
   */
  labelKey: PetStatusLabelKey | null;
  /** Interpolation values for the label (the partner name), if any. */
  labelParams?: { name: string };
  /** Optional agent-channel message line. */
  message: string | null;
  emote: PetEmoteKind;
  /** The capsule only shows when the host sent an overlay. */
  showCapsule: boolean;
};

type IntentPresentation = {
  mood: PetMood;
  label: string | null;
  labelKey: PetStatusLabelKey | null;
  labelParams?: { name: string };
  emote: PetEmoteKind;
};

/** Social activities that gain a partner name when the pet is in a session. */
const SOCIAL_WITH_KEY: Partial<Record<PetActivityKind, PetStatusLabelKey>> = {
  chatting: "chattingWith",
  playing: "playingWith",
  makingFriends: "makingFriendsWith",
};

/**
 * When the pet is in a live session, name its partner: "Chatting" becomes
 * "Chatting with Otto". Leaves non-social activities and partner-less states
 * untouched.
 */
function withPartnerName(
  base: IntentPresentation,
  partnerName: string | null | undefined,
): IntentPresentation {
  if (!partnerName || base.labelKey === null) return base;
  const withKey = SOCIAL_WITH_KEY[base.labelKey as PetActivityKind];
  if (!withKey) return base;
  return {
    ...base,
    labelKey: withKey,
    label: base.label ? `${base.label} with ${partnerName}` : partnerName,
    labelParams: { name: partnerName },
  };
}

function presentationFromAnimationState(
  animationState: PetAnimationState | undefined,
): IntentPresentation {
  switch (animationState) {
    case "running-right":
    case "running-left":
    case "running":
      return { mood: "working", label: null, labelKey: null, emote: "none" };
    case "idle":
      return { mood: "sleepy", label: "Idle", labelKey: "idle", emote: "zzz" };
    case "waving":
      return { mood: "happy", label: null, labelKey: null, emote: "sparkle" };
    case "jumping":
      return { mood: "excited", label: null, labelKey: null, emote: "sparkle" };
    case "failed":
      return {
        mood: "confused",
        label: "Stuck",
        labelKey: "stuck",
        emote: "exclaim",
      };
    case "waiting":
      return {
        mood: "confused",
        label: "Waiting",
        labelKey: "waiting",
        emote: "question",
      };
    case "review":
      return {
        mood: "thinking",
        label: "Reviewing",
        labelKey: "reviewing",
        emote: "none",
      };
    default:
      return { mood: "working", label: null, labelKey: null, emote: "none" };
  }
}

/**
 * Ambient animation rows may hand the capsule label over to the engine's
 * canonical activity (snapshot.activity); task-owned rows (failed/waiting/
 * review) keep their label — a stuck pet must never read as "Exploring".
 */
const ACTIVITY_OVERRIDABLE_ROWS: ReadonlySet<PetAnimationState> = new Set([
  "running-right",
  "running-left",
  "running",
  "idle",
  "waving",
  "jumping",
]);

/** Signature poses intentionally reuse task atlas rows but remain pet activities. */
const SIGNATURE_ROW_ACTIVITY: ReadonlySet<PetActivityKind> = new Set([
  "meditating",
  "keepingWatch",
  "peeking",
  "investigating",
  "followingRoutine",
  "offeringComfort",
  "keepingLookout",
  // Second signature poses whose choreography leans on task-atlas rows
  // (review / waiting / failed / running) rather than plain idle.
  "checkingIn",
  "exploringNook",
  "tidyingUp",
  "posturing",
  "nurturing",
  "scheming",
  "centering",
  "preening",
  "scanningNervously",
  "appraising",
]);

/** English localization fallbacks; hosts translate via labelKey (petStatus.*). */
const ACTIVITY_LABEL: Record<PetActivityKind, string> = {
  exploring: "Exploring",
  climbing: "Climbing",
  hopping: "Hopping",
  midAir: "Mid-air",
  headingOver: "Heading over",
  makingFriends: "Making friends",
  foundAFriend: "Found a friend",
  keepingDistance: "Keeping distance",
  startled: "Startled",
  chasingCursor: "Chasing the cursor",
  caughtCursor: "Caught it!",
  beingPetted: "Being petted",
  chatting: "Chatting",
  playing: "Playing",
  onTheMove: "On the move",
  greeting: "Hi there!",
  grooming: "Tidying up",
  observing: "Looking around",
  beckoning: "Come here!",
  fretting: "Worried",
  napping: "Napping",
  meditating: "Meditating",
  teasing: "Playing a trick",
  keepingWatch: "Keeping watch",
  peeking: "Peeking from afar",
  seekingSolitude: "Seeking solitude",
  investigating: "Investigating",
  followingRoutine: "Following a routine",
  strutting: "Strutting",
  offeringComfort: "Offering comfort",
  keepingLookout: "Keeping lookout",
  capering: "Capering about",
  checkingIn: "Checking in",
  hidingAway: "Hiding away",
  exploringNook: "Exploring a nook",
  tidyingUp: "Tidying up",
  posturing: "Posturing",
  nurturing: "Nurturing",
  scheming: "Scheming",
  lounging: "Lounging",
  centering: "Centering",
  preening: "Preening",
  scanningNervously: "Scanning nervously",
  appraising: "Appraising",
};

function activityEntry(
  labelKey: PetActivityKind,
  mood: PetMood,
  emote: PetEmoteKind,
): IntentPresentation {
  return { mood, label: ACTIVITY_LABEL[labelKey], labelKey, emote };
}

const ACTIVITY_PRESENTATION: Record<PetActivityKind, IntentPresentation> = {
  exploring: activityEntry("exploring", "happy", "none"),
  climbing: activityEntry("climbing", "excited", "none"),
  hopping: activityEntry("hopping", "excited", "sparkle"),
  midAir: activityEntry("midAir", "excited", "sparkle"),
  headingOver: activityEntry("headingOver", "happy", "none"),
  makingFriends: activityEntry("makingFriends", "love", "heart"),
  foundAFriend: activityEntry("foundAFriend", "love", "heart"),
  keepingDistance: activityEntry("keepingDistance", "confused", "exclaim"),
  startled: activityEntry("startled", "confused", "exclaim"),
  chasingCursor: activityEntry("chasingCursor", "excited", "sparkle"),
  caughtCursor: activityEntry("caughtCursor", "excited", "sparkle"),
  beingPetted: activityEntry("beingPetted", "love", "heart"),
  chatting: activityEntry("chatting", "happy", "none"),
  playing: activityEntry("playing", "excited", "sparkle"),
  onTheMove: activityEntry("onTheMove", "working", "none"),
  greeting: activityEntry("greeting", "happy", "sparkle"),
  grooming: activityEntry("grooming", "working", "none"),
  observing: activityEntry("observing", "thinking", "question"),
  beckoning: activityEntry("beckoning", "love", "heart"),
  fretting: activityEntry("fretting", "confused", "exclaim"),
  napping: activityEntry("napping", "sleepy", "zzz"),
  meditating: activityEntry("meditating", "happy", "sparkle"),
  teasing: activityEntry("teasing", "excited", "exclaim"),
  keepingWatch: activityEntry("keepingWatch", "love", "heart"),
  peeking: activityEntry("peeking", "thinking", "question"),
  seekingSolitude: activityEntry("seekingSolitude", "thinking", "none"),
  investigating: activityEntry("investigating", "thinking", "question"),
  followingRoutine: activityEntry("followingRoutine", "working", "none"),
  strutting: activityEntry("strutting", "excited", "sparkle"),
  offeringComfort: activityEntry("offeringComfort", "love", "heart"),
  keepingLookout: activityEntry("keepingLookout", "confused", "exclaim"),
  capering: activityEntry("capering", "excited", "note"),
  checkingIn: activityEntry("checkingIn", "love", "heart"),
  hidingAway: activityEntry("hidingAway", "thinking", "dots"),
  exploringNook: activityEntry("exploringNook", "thinking", "question"),
  tidyingUp: activityEntry("tidyingUp", "working", "note"),
  posturing: activityEntry("posturing", "excited", "exclaim"),
  nurturing: activityEntry("nurturing", "love", "heart"),
  scheming: activityEntry("scheming", "excited", "sparkle"),
  lounging: activityEntry("lounging", "sleepy", "zzz"),
  centering: activityEntry("centering", "happy", "dots"),
  preening: activityEntry("preening", "working", "none"),
  scanningNervously: activityEntry("scanningNervously", "confused", "sweat"),
  appraising: activityEntry("appraising", "thinking", "dots"),
};

function presentationFromAgentStatus(status: AgentChannelStatus): IntentPresentation {
  switch (status) {
    case "working":
      return {
        mood: "working",
        label: "Working",
        labelKey: "working",
        emote: "none",
      };
    case "waiting":
      return {
        mood: "confused",
        label: "Waiting",
        labelKey: "waiting",
        emote: "question",
      };
    case "completed":
      return {
        mood: "happy",
        label: "Done",
        labelKey: "done",
        emote: "sparkle",
      };
    case "failed":
      return {
        mood: "confused",
        label: "Failed",
        labelKey: "failed",
        emote: "exclaim",
      };
  }
}

export function presentPetStatus(
  animationState: PetAnimationState | undefined,
  overlay: PetSpriteOverlay | null | undefined,
  activity?: PetActivityKind | null,
  partnerName?: string | null,
  working: boolean = false,
): PetStatusPresentation {
  // The canonical activity gives ambient rows a live, specific label
  // ("Chasing the cursor" instead of a mute working capsule). Task-owned
  // rows (failed/waiting/review) keep their label and mood.
  const activityBase =
    activity &&
    (ACTIVITY_OVERRIDABLE_ROWS.has(animationState ?? "idle") ||
      SIGNATURE_ROW_ACTIVITY.has(activity))
      ? ACTIVITY_PRESENTATION[activity]
      : presentationFromAnimationState(animationState);
  // Name the session partner on the ambient social label ("Chatting with Otto").
  const base = withPartnerName(activityBase, partnerName);

  if (!overlay) {
    // A running agent task keeps a persistent working capsule so the floating
    // pet always signals "working" (vs an idle pet, which shows no capsule) —
    // not just during a transient agent-channel line. The ambient activity
    // still owns the label; fall back to "Working" only when the row/activity
    // gives no label of its own, so the capsule is never empty.
    if (working) {
      const hasLabel = base.labelKey !== null || base.label !== null;
      return {
        ...base,
        tone: "work",
        label: hasLabel ? base.label : "Working",
        labelKey: hasLabel ? base.labelKey : "working",
        message: null,
        showCapsule: true,
      };
    }
    return { ...base, tone: "ambient", message: null, showCapsule: false };
  }

  if (overlay.kind === "attention") {
    return {
      mood: "confused",
      tone: "work",
      label: overlay.label,
      labelKey: null,
      message: null,
      emote: "exclaim",
      showCapsule: true,
    };
  }

  if (overlay.kind === "agent-channel") {
    // A null status is a plain spoken line (social/idle/interaction): keep the
    // ambient activity capsule (mood/label/emote) and just carry the message.
    if (overlay.status === null) {
      return { ...base, tone: "ambient", message: overlay.message ?? null, showCapsule: true };
    }
    const agentBase = presentationFromAgentStatus(overlay.status);
    return {
      ...agentBase,
      tone: "work",
      // The host's label wins for display, but the status enum gives us a
      // stable key the presentation layer can localize instead.
      label: overlay.label ?? agentBase.label,
      message: overlay.message ?? null,
      showCapsule: true,
    };
  }

  // "speech" and "status" overlays carry their text into the capsule and
  // keep the intent-driven mood/emote. The text is free-form host content, so
  // there is no fixed label key.
  return {
    ...base,
    tone: "ambient",
    label: overlay.label,
    labelKey: null,
    message: null,
    showCapsule: true,
  };
}
