import { test } from "@playwright/test";
import { PlaygroundPage } from "./pages/playground.page";

test("playground injects task lifecycle events", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();

  await playground.sendStartedEvent();
  await playground.expectLastEventType("task.started");

  await playground.sendWaitingEvent();
  await playground.expectLastEventType("task.waiting");

  await playground.sendCompletedEvent();
  await playground.expectLastEventType("task.completed");
});

test("waiting events update visible pet status", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();
  await playground.sendWaitingEvent();
  await playground.expectPetAgentStatus("Alice", "WAIT", "Permission required");
});

test("walk demo exposes locomotion state in the playground", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();

  await playground.expectPetLocomotion("Alice", "walk");
  await playground.expectPetSteering("Alice");
});

test("behavior lab inspects pet movement components", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();

  await playground.expectSelectedBehaviorPet("Alice");
  await playground.expectBehaviorComponent("WalkingTag");
  await playground.expectBehaviorComponent("CanWalk");
  await playground.expectBehaviorComponent("CanWallClimb");

  // Dana is the pet in this scenario that cannot climb, so switching pets has
  // to change the list rather than redraw Alice's.
  await playground.selectBehaviorPet("Dana");
  await playground.expectSelectedBehaviorPet("Dana");
  await playground.expectBehaviorComponent("CanWalk");
  await playground.expectNoBehaviorComponent("CanWallClimb");
});
