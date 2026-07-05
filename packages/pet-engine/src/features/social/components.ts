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

/** The three joint behaviors two pets can share. */
export type SocialSessionKind = "greet" | "chat" | "chase";

/**
 * Session progression. `greet` = move together / close the gap; `play` = the
 * kind-specific interaction (emote exchange, alternating chat, chasing);
 * `part` = wind down before teardown.
 */
export type SocialSessionPhase = "greet" | "play" | "part";

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
 * shared clock and (for chase) whose turn it is to chase. Both participants
 * derive their choreography from this each tick.
 */
export type SocialSessionComponent = {
  type: "SocialSession";
  kind: SocialSessionKind;
  initiatorId: string;
  responderId: string;
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
  /** Whether the initiator and responder have already exchanged their greeting speech. */
  greeted: boolean;
};

/** Back-reference placed on each participating pet. */
export type SocialSessionMemberComponent = {
  type: "SocialSessionMember";
  sessionId: string;
  partnerId: string;
  role: "initiator" | "responder";
};
