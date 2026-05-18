import { test } from "@playwright/test";
import { PlaygroundPage } from "./pages/playground.page";

test("playground renders and accepts a stimulus", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();
  await playground.sendWaitingStimulus();
  await playground.expectLastStimulus("task.waiting");
});
