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

// Design note — personalities are deliberately *caricatured*. Each preset owns a
// distinct corner of OCEAN space with at least one trait pushed to an extreme
// (≤0.15 or ≥0.85), and the four sociability-defining axes (E, A, N) are spread
// wide so the derived behaviors — session accept/decline, invite initiation,
// approach/flee, softmax erraticness (∝ N) — actually diverge in play. Middling
// values read as "everyone is the same"; that is what we are avoiding here.

/** Pure extravert — never still, chases and romps at every chance. */
export const createPlayfulPersonality: PersonalityFactory = () => ({
  standForce: 0.0008,
  pursueForce: 0.0016,
  arriveForce: 0.002,
  idleConversationMs: 9000,
  completionIntent: "arrive",
  openness: 0.75,
  conscientiousness: 0.3,
  extraversion: 0.95,
  agreeableness: 0.55,
  neuroticism: 0.08,
});

/** Devoted companion — glued to the user, warm to a fault, incurious about the rest. */
export const createAttentivePersonality: PersonalityFactory = () => ({
  standForce: 0.0005,
  pursueForce: 0.001,
  arriveForce: 0.0016,
  idleConversationMs: 11000,
  completionIntent: "arrive",
  openness: 0.25,
  conscientiousness: 0.72,
  extraversion: 0.72,
  agreeableness: 0.95,
  neuroticism: 0.15,
});

/** Shy and anxious — hangs back, startles easily, turns down almost every invite. */
export const createReservedPersonality: PersonalityFactory = () => ({
  standForce: 0.0004,
  pursueForce: 0.0008,
  arriveForce: 0.001,
  completionIntent: "stand",
  openness: 0.22,
  conscientiousness: 0.55,
  extraversion: 0.12,
  agreeableness: 0.38,
  neuroticism: 0.82,
});

/** Insatiable explorer — investigates everything, only moderately social. */
export const createCuriousPersonality: PersonalityFactory = () => ({
  standForce: 0.0007,
  pursueForce: 0.0013,
  arriveForce: 0.0015,
  idleConversationMs: 13000,
  completionIntent: "arrive",
  openness: 0.98,
  conscientiousness: 0.35,
  extraversion: 0.45,
  agreeableness: 0.55,
  neuroticism: 0.3,
});

/** Disciplined and unshakeable — deliberate, grounded, sticks to its routine. */
export const createSteadyPersonality: PersonalityFactory = () => ({
  standForce: 0.00045,
  pursueForce: 0.0009,
  arriveForce: 0.0012,
  idleConversationMs: 20000,
  completionIntent: "stand",
  openness: 0.35,
  conscientiousness: 0.95,
  extraversion: 0.4,
  agreeableness: 0.7,
  neuroticism: 0.06,
});

/** Fearless and blunt — barges up to anything, unbothered, low on warmth. */
export const createBoldPersonality: PersonalityFactory = () => ({
  standForce: 0.0009,
  pursueForce: 0.0018,
  arriveForce: 0.0022,
  idleConversationMs: 9000,
  completionIntent: "arrive",
  openness: 0.7,
  conscientiousness: 0.35,
  extraversion: 0.92,
  agreeableness: 0.28,
  neuroticism: 0.05,
});

/** Tender and quiet — hyper-agreeable, unhurried, gravitates gently toward the user. */
export const createGentlePersonality: PersonalityFactory = () => ({
  standForce: 0.0004,
  pursueForce: 0.0008,
  arriveForce: 0.001,
  idleConversationMs: 14000,
  completionIntent: "arrive",
  openness: 0.45,
  conscientiousness: 0.65,
  extraversion: 0.3,
  agreeableness: 0.98,
  neuroticism: 0.12,
});

/** Chaotic trickster — impulsive, undisciplined, and a little contrary. */
export const createMischievousPersonality: PersonalityFactory = () => ({
  standForce: 0.001,
  pursueForce: 0.002,
  arriveForce: 0.0025,
  idleConversationMs: 8000,
  completionIntent: "arrive",
  openness: 0.9,
  conscientiousness: 0.1,
  extraversion: 0.82,
  agreeableness: 0.32,
  neuroticism: 0.35,
});

/** Inert homebody — barely budges, perfectly content doing nothing at all. */
export const createLazyPersonality: PersonalityFactory = () => ({
  standForce: 0.0002,
  pursueForce: 0.0005,
  arriveForce: 0.0007,
  idleConversationMs: 30000,
  completionIntent: "stand",
  openness: 0.28,
  conscientiousness: 0.18,
  extraversion: 0.1,
  agreeableness: 0.55,
  neuroticism: 0.18,
});

/** Serene and unflappable — the calmest pet alive, warm and easy to be around. */
export const createZenPersonality: PersonalityFactory = () => ({
  standForce: 0.00035,
  pursueForce: 0.0007,
  arriveForce: 0.0009,
  idleConversationMs: 22000,
  completionIntent: "stand",
  openness: 0.6,
  conscientiousness: 0.7,
  extraversion: 0.45,
  agreeableness: 0.8,
  neuroticism: 0.02,
});

/** Prickly loner — keeps to itself, ignores the user, turns down company outright. */
export const createAloofPersonality: PersonalityFactory = () => ({
  standForce: 0.00035,
  pursueForce: 0.0007,
  arriveForce: 0.0009,
  idleConversationMs: 24000,
  completionIntent: "stand",
  openness: 0.4,
  conscientiousness: 0.6,
  extraversion: 0.15,
  agreeableness: 0.08,
  neuroticism: 0.3,
});

/** Jittery and high-strung — darts about, spooks at the slightest thing, bolts from company. */
export const createSkittishPersonality: PersonalityFactory = () => ({
  standForce: 0.0006,
  pursueForce: 0.0013,
  arriveForce: 0.0016,
  completionIntent: "stand",
  openness: 0.3,
  conscientiousness: 0.4,
  extraversion: 0.25,
  agreeableness: 0.5,
  neuroticism: 0.95,
});
