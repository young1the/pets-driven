import type { PetsDrivenState } from "@/app-state/pets-driven-state";

/**
 * Dev-only working-directory seed so Claude hook events route somewhere
 * before the connect-agent flow exists. Call sites must gate this behind
 * import.meta.env.DEV — production first-run starts genuinely empty.
 */
export function withDesktopFixtureWorkingDirectories(
  state: PetsDrivenState,
): PetsDrivenState {
  if (state.registeredWorkingDirectories.length > 0) {
    return state;
  }

  return {
    ...state,
    registeredWorkingDirectories: [
      {
        id: "wd-fixture-cms",
        path: "D:\\cms",
        petId: "pet-a",
        agentSourceId: "agent-a",
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "wd-fixture-pets-driven",
        path: "D:\\workmanager\\pets-driven",
        petId: "pet-a",
        agentSourceId: "agent-a",
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  };
}
