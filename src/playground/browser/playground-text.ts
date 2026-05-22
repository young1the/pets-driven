export const PLAYGROUND_TEXT = {
  title: "pets-driven playground",
  sendStartedEvent: "Send started event",
  sendWaitingEvent: "Send waiting event",
  sendCompletedEvent: "Send completed event",
  startWalkDemo: "Walk Alice",
  startJumpDemo: "Jump Alice",
  startWallClimbDemo: "Climb Alice",
  walkDemoStimulus: "walk-demo",
  jumpDemoStimulus: "jump-demo",
  wallClimbDemoStimulus: "wall-climb-demo",
  lastStimulusPrefix: "Last stimulus:",
  lastEventTitle: "Last event",
  petStatusTitle: "Pet status",
  behaviorLabTitle: "Behavior lab",
  selectedPetLabel: "Selected pet",
  noSpeech: "No speech",
  walkingDemoSpeech: "Walking to the right",
  jumpDemoSpeech: "Jumping up",
  wallClimbDemoSpeech: "Climbing the wall",
} as const;

export const PLAYGROUND_SAMPLE_EVENT_SUMMARIES = {
  started: "Working",
  waiting: "Needs approval",
  completed: "Done",
} as const;
