/**
 * Pet-to-pet social interaction: a lightweight two-participant session layer on
 * top of the existing behavior priority model.
 *
 * Modeled after The Sims' two-Sim interactions and the Overwatch/flecs
 * "relationship-as-its-own-entity" pattern: state that spans two pets lives on
 * a third, spawned SocialSession entity that owns the shared clock, while each
 * participant carries a back-reference (SocialSessionMember). This avoids the
 * double-advance problem you get when the same shared clock is stored on both
 * pets, and keeps the interaction discoverable through ordinary component
 * queries.
 *
 * Lifecycle: an initiator writes a transient SocialInvite onto a target →
 * SocialInteractionSystem lets the target accept (personality/drive-weighted)
 * or decline → on accept a SocialSession entity is spawned and both pets get a
 * SocialSessionMember → the system choreographs both pets per phase until the
 * session ends, then tears the session down and refills each pet's social
 * drive.
 */

/** Marks a pet as able to start and join social sessions. */
export type CanSocializeComponent = {
  type: "CanSocialize";
};

/** How a nearby pet answers another pet's active personality signature. */
export type SignatureReactionKind = "join" | "cheer" | "watch" | "keep-distance";

/**
 * A short, one-sided response to another pet's personality signature.
 *
 * This is deliberately not a Social Session: the source pet keeps owning its
 * solo signature while the responder briefly joins, cheers, watches, or gives
 * it space. The source therefore never needs to accept an invite or change its
 * own choreography.
 */
export type SignatureReactionStateComponent = {
  type: "SignatureReactionState";
  sourceId: string;
  sourceDecisionKind: import("@pets-driven/pet-engine/features/behavior/components").BehaviorDecisionKind;
  sourceDecisionAt: number;
  reaction: SignatureReactionKind;
  /** Existing expressive-pose choreography reused by the responder. */
  pose: string;
  startedAt: number;
  expiresAt: number;
};

/** One source signature occurrence that this pet has already considered. */
export type SeenSignatureReaction = {
  sourceId: string;
  sourceDecisionAt: number;
  reacted: boolean;
};

/**
 * Bounded, session-local memory preventing one held signature from rolling a
 * fresh reaction every simulation tick.
 */
export type SignatureReactionMemoryComponent = {
  type: "SignatureReactionMemory";
  entries: SeenSignatureReaction[];
};

/** The joint behaviors a group of pets can share. */
export type SocialSessionKind = "greet" | "chat" | "chase" | "dance";

/**
 * Session progression. `approach` = move together / close the gap; `play` = the
 * kind-specific interaction (emote exchange, alternating chat, chasing);
 * `part` = wind down before teardown.
 */
export type SocialSessionPhase = "approach" | "play" | "part";

/**
 * Transient offer written by an initiator onto the *target* pet. Read once by
 * SocialInteractionSystem, which either forms a session or drops the invite;
 * it never lingers longer than `expiresAt`.
 */
export type SocialInviteComponent = {
  type: "SocialInvite";
  fromId: string;
  kind: SocialSessionKind;
  createdAt: number;
  expiresAt: number;
};

/**
 * The spawned session entity's state — the single source of truth for the
 * shared clock and (for chase) whose turn it is to chase. Every participant
 * derives its choreography from this each tick.
 *
 * A session holds two participants at birth and can grow to a small group as
 * nearby pets join (see the join flow). Two-party is the base case, not a
 * separate shape.
 */
export type SocialSessionComponent = {
  type: "SocialSession";
  kind: SocialSessionKind;
  /**
   * Everyone currently in the session, in join order. `participantIds[0]` is
   * the initiator (it placed the founding invite); the rest are the responder
   * and any later joiners. Always has at least two while the session lives.
   */
  participantIds: string[];
  phase: SocialSessionPhase;
  startedAt: number;
  /**
   * Hard deadline for teardown. Set to an upper bound at creation (greet
   * timeout + play + part) and tightened once play actually begins — the
   * greet phase is arrival-driven (pets walk up to each other at a saunter),
   * not a fixed timer.
   */
  endsAt: number;
  /** When the pets actually met and play began; null while still approaching. */
  playStartedAt: number | null;
  /** Fixed horizontal centre of a dance phrase; reset when membership changes. */
  danceCentreX?: number | null;
  /** Whether the participants have already exchanged their greeting speech. */
  greeted: boolean;
  /**
   * chase only — the pet currently chasing (the rest are runners). Null until
   * play starts, then set to the initiator. Catching a runner makes that
   * runner the new chaser; the swap timer rotates it otherwise.
   */
  chaserId?: string | null;
  /**
   * chase only — how many times the chaser role has swapped (telemetry / the
   * swap cadence). Optional so pre-chase sessions and older fixtures need not
   * set it.
   */
  chaseSwaps?: number;
  /** chase only — when the last role swap happened (the swap-timer reference). */
  lastChaseSwapAt?: number | null;
  /** chase only — when the last catch cue fired, so it can't machine-gun. */
  lastCatchAt?: number | null;
};

/** Back-reference placed on each participating pet. */
export type SocialSessionMemberComponent = {
  type: "SocialSessionMember";
  sessionId: string;
  /**
   * A representative co-participant, for the status label ("Chatting with
   * Otto"). Exactly the partner in a two-party session; the first other
   * participant in a group. Co-participation is checked by matching sessionId,
   * not this field.
   */
  partnerId: string;
  role: "initiator" | "responder";
};
