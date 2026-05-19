import type { SimulationComponent } from "@/core/components/simulation-components";

export type PersonalityFactory = () => SimulationComponent[];

export const createPlayfulPersonality: PersonalityFactory = () => [
  {
    type: "MovementProfile",
    idleSpeed: 0.0008,
    activeSpeed: 0.0016,
    seekSpeed: 0.002,
  },
  { type: "IdleConversation", idleAfterMs: 9000 },
  {
    type: "CompletionBehavior",
    intentAfterCompletion: "seek",
  },
];

export const createAttentivePersonality: PersonalityFactory = () => [
  {
    type: "MovementProfile",
    idleSpeed: 0.0005,
    activeSpeed: 0.001,
    seekSpeed: 0.0016,
  },
  { type: "IdleConversation", idleAfterMs: 12000 },
  {
    type: "CompletionBehavior",
    intentAfterCompletion: "seek",
  },
];

export const createReservedPersonality: PersonalityFactory = () => [
  {
    type: "MovementProfile",
    idleSpeed: 0.0004,
    activeSpeed: 0.0008,
    seekSpeed: 0.001,
  },
  {
    type: "CompletionBehavior",
    intentAfterCompletion: "idle",
  },
];
