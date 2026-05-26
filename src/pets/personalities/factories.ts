export type PetPersonality = {
  idleForce: number;
  activeForce: number;
  seekForce: number;
  idleConversationMs?: number;
  completionIntent: "idle" | "seek";
  /** OCEAN Big-Five traits (0..1 each). */
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};

export type PersonalityFactory = () => PetPersonality;

/** High openness + extraversion, low neuroticism — explores and engages freely. */
export const createPlayfulPersonality: PersonalityFactory = () => ({
  idleForce: 0.0008,
  activeForce: 0.0016,
  seekForce: 0.002,
  idleConversationMs: 9000,
  completionIntent: "seek",
  openness: 0.7,
  conscientiousness: 0.4,
  extraversion: 0.85,
  agreeableness: 0.5,
  neuroticism: 0.1,
});

/** High extraversion + agreeableness — seeks the user and engages readily. */
export const createAttentivePersonality: PersonalityFactory = () => ({
  idleForce: 0.0005,
  activeForce: 0.001,
  seekForce: 0.0016,
  idleConversationMs: 12000,
  completionIntent: "seek",
  openness: 0.3,
  conscientiousness: 0.6,
  extraversion: 0.8,
  agreeableness: 0.8,
  neuroticism: 0.2,
});

/** High neuroticism, low extraversion — cautious, prefers staying close. */
export const createReservedPersonality: PersonalityFactory = () => ({
  idleForce: 0.0004,
  activeForce: 0.0008,
  seekForce: 0.001,
  completionIntent: "idle",
  openness: 0.3,
  conscientiousness: 0.5,
  extraversion: 0.2,
  agreeableness: 0.4,
  neuroticism: 0.75,
});
