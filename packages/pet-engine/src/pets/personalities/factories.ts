export type PetPersonality = {
  standForce: number;
  pursueForce: number;
  arriveForce: number;
  idleConversationMs?: number;
  completionIntent: "stand" | "arrive";
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
  standForce: 0.0008,
  pursueForce: 0.0016,
  arriveForce: 0.002,
  idleConversationMs: 9000,
  completionIntent: "arrive",
  openness: 0.7,
  conscientiousness: 0.4,
  extraversion: 0.85,
  agreeableness: 0.5,
  neuroticism: 0.1,
});

/** High extraversion + agreeableness — seeks the user and engages readily. */
export const createAttentivePersonality: PersonalityFactory = () => ({
  standForce: 0.0005,
  pursueForce: 0.001,
  arriveForce: 0.0016,
  idleConversationMs: 12000,
  completionIntent: "arrive",
  openness: 0.3,
  conscientiousness: 0.6,
  extraversion: 0.8,
  agreeableness: 0.8,
  neuroticism: 0.2,
});

/** High neuroticism, low extraversion — cautious, prefers staying close. */
export const createReservedPersonality: PersonalityFactory = () => ({
  standForce: 0.0004,
  pursueForce: 0.0008,
  arriveForce: 0.001,
  completionIntent: "stand",
  openness: 0.3,
  conscientiousness: 0.5,
  extraversion: 0.2,
  agreeableness: 0.4,
  neuroticism: 0.75,
});

/** Very high openness — investigates new space while staying moderately social. */
export const createCuriousPersonality: PersonalityFactory = () => ({
  standForce: 0.0007,
  pursueForce: 0.0013,
  arriveForce: 0.0015,
  idleConversationMs: 14000,
  completionIntent: "arrive",
  openness: 0.9,
  conscientiousness: 0.35,
  extraversion: 0.55,
  agreeableness: 0.6,
  neuroticism: 0.25,
});

/** High conscientiousness, low neuroticism — steady, calm, and deliberate. */
export const createSteadyPersonality: PersonalityFactory = () => ({
  standForce: 0.00045,
  pursueForce: 0.0009,
  arriveForce: 0.0012,
  idleConversationMs: 18000,
  completionIntent: "stand",
  openness: 0.45,
  conscientiousness: 0.85,
  extraversion: 0.45,
  agreeableness: 0.7,
  neuroticism: 0.15,
});

/** High openness + extraversion, low neuroticism — approaches boldly. */
export const createBoldPersonality: PersonalityFactory = () => ({
  standForce: 0.0009,
  pursueForce: 0.0018,
  arriveForce: 0.0022,
  idleConversationMs: 8000,
  completionIntent: "arrive",
  openness: 0.8,
  conscientiousness: 0.45,
  extraversion: 0.9,
  agreeableness: 0.55,
  neuroticism: 0.12,
});

/** Very high agreeableness, low neuroticism — warm and unhurried, gravitates toward the user. */
export const createGentlePersonality: PersonalityFactory = () => ({
  standForce: 0.0004,
  pursueForce: 0.0008,
  arriveForce: 0.001,
  idleConversationMs: 15000,
  completionIntent: "arrive",
  openness: 0.4,
  conscientiousness: 0.6,
  extraversion: 0.4,
  agreeableness: 0.9,
  neuroticism: 0.15,
});

/** High openness + extraversion, low conscientiousness — unpredictable and impulsive. */
export const createMischievousPersonality: PersonalityFactory = () => ({
  standForce: 0.001,
  pursueForce: 0.002,
  arriveForce: 0.0025,
  idleConversationMs: 7000,
  completionIntent: "arrive",
  openness: 0.85,
  conscientiousness: 0.2,
  extraversion: 0.8,
  agreeableness: 0.4,
  neuroticism: 0.3,
});

/** Low extraversion + conscientiousness — barely budges, perfectly content doing nothing. */
export const createLazyPersonality: PersonalityFactory = () => ({
  standForce: 0.0002,
  pursueForce: 0.0005,
  arriveForce: 0.0007,
  idleConversationMs: 30000,
  completionIntent: "stand",
  openness: 0.35,
  conscientiousness: 0.25,
  extraversion: 0.15,
  agreeableness: 0.6,
  neuroticism: 0.3,
});

/** Very low neuroticism, balanced traits — unhurried, serene, and easy to be around. */
export const createZenPersonality: PersonalityFactory = () => ({
  standForce: 0.00035,
  pursueForce: 0.0007,
  arriveForce: 0.0009,
  idleConversationMs: 20000,
  completionIntent: "stand",
  openness: 0.55,
  conscientiousness: 0.65,
  extraversion: 0.5,
  agreeableness: 0.75,
  neuroticism: 0.05,
});
