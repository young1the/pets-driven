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

/** Very high openness — investigates new space while staying moderately social. */
export const createCuriousPersonality: PersonalityFactory = () => ({
  idleForce: 0.0007,
  activeForce: 0.0013,
  seekForce: 0.0015,
  idleConversationMs: 14000,
  completionIntent: "seek",
  openness: 0.9,
  conscientiousness: 0.35,
  extraversion: 0.55,
  agreeableness: 0.6,
  neuroticism: 0.25,
});

/** High conscientiousness, low neuroticism — steady, calm, and deliberate. */
export const createSteadyPersonality: PersonalityFactory = () => ({
  idleForce: 0.00045,
  activeForce: 0.0009,
  seekForce: 0.0012,
  idleConversationMs: 18000,
  completionIntent: "idle",
  openness: 0.45,
  conscientiousness: 0.85,
  extraversion: 0.45,
  agreeableness: 0.7,
  neuroticism: 0.15,
});

/** High openness + extraversion, low neuroticism — approaches boldly. */
export const createBoldPersonality: PersonalityFactory = () => ({
  idleForce: 0.0009,
  activeForce: 0.0018,
  seekForce: 0.0022,
  idleConversationMs: 8000,
  completionIntent: "seek",
  openness: 0.8,
  conscientiousness: 0.45,
  extraversion: 0.9,
  agreeableness: 0.55,
  neuroticism: 0.12,
});

/** Very high agreeableness, low neuroticism — warm and unhurried, gravitates toward the user. */
export const createGentlePersonality: PersonalityFactory = () => ({
  idleForce: 0.0004,
  activeForce: 0.0008,
  seekForce: 0.001,
  idleConversationMs: 15000,
  completionIntent: "seek",
  openness: 0.4,
  conscientiousness: 0.6,
  extraversion: 0.4,
  agreeableness: 0.9,
  neuroticism: 0.15,
});

/** High openness + extraversion, low conscientiousness — unpredictable and impulsive. */
export const createMischievousPersonality: PersonalityFactory = () => ({
  idleForce: 0.001,
  activeForce: 0.002,
  seekForce: 0.0025,
  idleConversationMs: 7000,
  completionIntent: "seek",
  openness: 0.85,
  conscientiousness: 0.2,
  extraversion: 0.8,
  agreeableness: 0.4,
  neuroticism: 0.3,
});

/** Low extraversion + conscientiousness — barely budges, perfectly content doing nothing. */
export const createLazyPersonality: PersonalityFactory = () => ({
  idleForce: 0.0002,
  activeForce: 0.0005,
  seekForce: 0.0007,
  idleConversationMs: 30000,
  completionIntent: "idle",
  openness: 0.35,
  conscientiousness: 0.25,
  extraversion: 0.15,
  agreeableness: 0.6,
  neuroticism: 0.3,
});

/** Very low neuroticism, balanced traits — unhurried, serene, and easy to be around. */
export const createZenPersonality: PersonalityFactory = () => ({
  idleForce: 0.00035,
  activeForce: 0.0007,
  seekForce: 0.0009,
  idleConversationMs: 20000,
  completionIntent: "idle",
  openness: 0.55,
  conscientiousness: 0.65,
  extraversion: 0.5,
  agreeableness: 0.75,
  neuroticism: 0.05,
});
