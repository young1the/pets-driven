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
  await playground.expectPetStatus("Alice", "seek-user", "Needs approval");
});
