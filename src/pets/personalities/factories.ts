export type PetPersonality = {
  idleSpeed: number;
  activeSpeed: number;
  seekSpeed: number;
  idleConversationMs?: number;
  completionIntent: "idle" | "seek";
  /** Tendency for exploration — boosts wander-far. */
  curiosity: number;
  /** Tendency to seek the user anchor. */
  sociability: number;
  /** Tendency for action behaviors (jump, climb). */
  playfulness: number;
  /** Tendency to stay near or retreat. */
  shyness: number;
};

export type PersonalityFactory = () => PetPersonality;

export const createPlayfulPersonality: PersonalityFactory = () => ({
  idleSpeed: 0.0008,
  activeSpeed: 0.0016,
  seekSpeed: 0.002,
  idleConversationMs: 9000,
  completionIntent: "seek",
  curiosity: 0.7,
  sociability: 0.4,
  playfulness: 0.9,
  shyness: 0.1,
});

export const createAttentivePersonality: PersonalityFactory = () => ({
  idleSpeed: 0.0005,
  activeSpeed: 0.001,
  seekSpeed: 0.0016,
  idleConversationMs: 12000,
  completionIntent: "seek",
  curiosity: 0.3,
  sociability: 0.85,
  playfulness: 0.3,
  shyness: 0.2,
});

export const createReservedPersonality: PersonalityFactory = () => ({
  idleSpeed: 0.0004,
  activeSpeed: 0.0008,
  seekSpeed: 0.001,
  completionIntent: "idle",
  curiosity: 0.2,
  sociability: 0.2,
  playfulness: 0.15,
  shyness: 0.75,
});
