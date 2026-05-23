export type PetPersonality = {
  idleSpeed: number;
  activeSpeed: number;
  seekSpeed: number;
  idleConversationMs?: number;
  completionIntent: "idle" | "seek";
};

export type PersonalityFactory = () => PetPersonality;

export const createPlayfulPersonality: PersonalityFactory = () => ({
  idleSpeed: 0.0008,
  activeSpeed: 0.0016,
  seekSpeed: 0.002,
  idleConversationMs: 9000,
  completionIntent: "seek",
});

export const createAttentivePersonality: PersonalityFactory = () => ({
  idleSpeed: 0.0005,
  activeSpeed: 0.001,
  seekSpeed: 0.0016,
  idleConversationMs: 12000,
  completionIntent: "seek",
});

export const createReservedPersonality: PersonalityFactory = () => ({
  idleSpeed: 0.0004,
  activeSpeed: 0.0008,
  seekSpeed: 0.001,
  completionIntent: "idle",
});
