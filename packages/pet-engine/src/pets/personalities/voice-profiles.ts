import type { AgentTaskStatus } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import type { SpeechProfileComponent } from "@pets-driven/pet-engine/features/agent/components";
import type {
  PetExpressionEmote,
  PetExpressionMood,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";

type AcknowledgedTaskStatus = Extract<
  AgentTaskStatus,
  "waiting" | "failed" | "completed"
>;

export type AcknowledgeFeedback = {
  speech: string;
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
};

type PersonalityVoiceProfile = Omit<SpeechProfileComponent, "type"> & {
  acknowledge: Record<AcknowledgedTaskStatus, AcknowledgeFeedback>;
};

/** Distinct voice and acknowledgement beats for every Personality Catalog entry. */
export const PERSONALITY_VOICE_PROFILES: Record<
  PetPersonalityId,
  PersonalityVoiceProfile
> = {
  playful: {
    idleCompanion: "Anything fun yet?",
    attentionNeeded: "Hey! I need you over here.",
    taskStarted: "On it. Race you!",
    taskCompleted: "Done! Play time?",
    acknowledge: {
      waiting: { speech: "Thanks! Let us go!", mood: "excited", emote: "sparkle" },
      failed: { speech: "Again! We have got this.", mood: "excited", emote: "sparkle" },
      completed: { speech: "You found it! Ta-da!", mood: "happy", emote: "sparkle" },
    },
  },
  attentive: {
    idleCompanion: "I am right here with you.",
    attentionNeeded: "Could you take a look?",
    taskStarted: "I am on it.",
    taskCompleted: "All done. I kept watch.",
    acknowledge: {
      waiting: { speech: "Thank you. I can continue now.", mood: "love", emote: "heart" },
      failed: { speech: "Thanks for checking on me.", mood: "love", emote: "heart" },
      completed: { speech: "I was waiting for you.", mood: "love", emote: "heart" },
    },
  },
  reserved: {
    idleCompanion: "I will be here.",
    attentionNeeded: "When you have a moment...",
    taskStarted: "I will start quietly.",
    taskCompleted: "It is finished.",
    acknowledge: {
      waiting: { speech: "That is enough. Thank you.", mood: "happy", emote: "none" },
      failed: { speech: "I will try once more.", mood: "thinking", emote: "question" },
      completed: { speech: "You noticed. Thank you.", mood: "happy", emote: "none" },
    },
  },
  curious: {
    idleCompanion: "I wonder what is over there.",
    attentionNeeded: "Come see what I found!",
    taskStarted: "Let me investigate.",
    taskCompleted: "Mystery solved!",
    acknowledge: {
      waiting: { speech: "Oh! That explains it.", mood: "thinking", emote: "question" },
      failed: { speech: "Interesting. What did we miss?", mood: "thinking", emote: "question" },
      completed: { speech: "Want to see what I found?", mood: "excited", emote: "sparkle" },
    },
  },
  steady: {
    idleCompanion: "Everything is in order.",
    attentionNeeded: "I need your decision.",
    taskStarted: "Proceeding now.",
    taskCompleted: "Task complete.",
    acknowledge: {
      waiting: { speech: "Confirmed. Continuing.", mood: "working", emote: "none" },
      failed: { speech: "Understood. I will adjust.", mood: "working", emote: "none" },
      completed: { speech: "Acknowledged. Ready for the next task.", mood: "happy", emote: "none" },
    },
  },
  bold: {
    idleCompanion: "What is next?",
    attentionNeeded: "Your call. Right now.",
    taskStarted: "I am going in.",
    taskCompleted: "Handled.",
    acknowledge: {
      waiting: { speech: "Good. Moving on.", mood: "excited", emote: "exclaim" },
      failed: { speech: "No problem. Another run.", mood: "excited", emote: "exclaim" },
      completed: { speech: "Told you I had it.", mood: "happy", emote: "sparkle" },
    },
  },
  gentle: {
    idleCompanion: "Take your time. I am here.",
    attentionNeeded: "Could you help me, please?",
    taskStarted: "I will take care of it.",
    taskCompleted: "All done for you.",
    acknowledge: {
      waiting: { speech: "Thank you for helping.", mood: "love", emote: "heart" },
      failed: { speech: "It is okay. We can try together.", mood: "love", emote: "heart" },
      completed: { speech: "I am glad you came by.", mood: "love", emote: "heart" },
    },
  },
  mischievous: {
    idleCompanion: "I am definitely behaving.",
    attentionNeeded: "Psst. Come look at this.",
    taskStarted: "Leave it to me. Probably.",
    taskCompleted: "Done. Nothing suspicious happened.",
    acknowledge: {
      waiting: { speech: "Perfect. The plan continues.", mood: "excited", emote: "sparkle" },
      failed: { speech: "That was the practice run.", mood: "happy", emote: "sparkle" },
      completed: { speech: "Surprise! It actually worked.", mood: "excited", emote: "sparkle" },
    },
  },
  lazy: {
    idleCompanion: "I am conserving energy.",
    attentionNeeded: "Could you come over here?",
    taskStarted: "Okay... starting.",
    taskCompleted: "Finished. Nap time.",
    acknowledge: {
      waiting: { speech: "Thanks. That saved me a trip.", mood: "sleepy", emote: "zzz" },
      failed: { speech: "Maybe after a tiny rest.", mood: "sleepy", emote: "zzz" },
      completed: { speech: "Great. Wake me for the next one.", mood: "sleepy", emote: "zzz" },
    },
  },
  zen: {
    idleCompanion: "There is no need to hurry.",
    attentionNeeded: "A quiet decision is needed.",
    taskStarted: "I will begin.",
    taskCompleted: "It is complete.",
    acknowledge: {
      waiting: { speech: "Thank you. The way is clear.", mood: "happy", emote: "sparkle" },
      failed: { speech: "We learned where the path bends.", mood: "thinking", emote: "none" },
      completed: { speech: "A good place to pause.", mood: "happy", emote: "sparkle" },
    },
  },
  aloof: {
    idleCompanion: "I was fine on my own.",
    attentionNeeded: "I require one thing.",
    taskStarted: "I will handle it.",
    taskCompleted: "It is done.",
    acknowledge: {
      waiting: { speech: "That will do.", mood: "working", emote: "none" },
      failed: { speech: "I will deal with it.", mood: "thinking", emote: "none" },
      completed: { speech: "Yes, I finished it.", mood: "happy", emote: "none" },
    },
  },
  skittish: {
    idleCompanion: "Was that something moving?",
    attentionNeeded: "Please come quickly!",
    taskStarted: "Okay. Carefully now.",
    taskCompleted: "It is done... right?",
    acknowledge: {
      waiting: { speech: "Oh! You are here. Good.", mood: "happy", emote: "sparkle" },
      failed: { speech: "I knew something felt wrong!", mood: "confused", emote: "exclaim" },
      completed: { speech: "You startled me! But it is done.", mood: "confused", emote: "exclaim" },
    },
  },
};

export function personalitySpeechProfile(
  catalogId: PetPersonalityId | undefined,
): SpeechProfileComponent | null {
  if (!catalogId) return null;
  const profile = PERSONALITY_VOICE_PROFILES[catalogId];
  return {
    type: "SpeechProfile",
    idleCompanion: profile.idleCompanion,
    attentionNeeded: profile.attentionNeeded,
    taskStarted: profile.taskStarted,
    taskCompleted: profile.taskCompleted,
  };
}

export function personalityAcknowledgeFeedback(
  catalogId: PetPersonalityId | undefined,
  status: AgentTaskStatus,
): AcknowledgeFeedback | null {
  if (!catalogId || !statusFreezesForFeedback(status)) return null;
  return PERSONALITY_VOICE_PROFILES[catalogId].acknowledge[status];
}

function statusFreezesForFeedback(
  status: AgentTaskStatus,
): status is AcknowledgedTaskStatus {
  return status === "waiting" || status === "failed" || status === "completed";
}
