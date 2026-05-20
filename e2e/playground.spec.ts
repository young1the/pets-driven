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
  await playground.expectPetStatus("Alice", "seek", "Needs approval");
});

test("walk demo exposes locomotion state in the playground", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();
  await playground.startWalkDemo();

  await playground.expectLocomotion("walk");
  await playground.expectPetStatus("Alice", "idle", "Walking to the right");
});
