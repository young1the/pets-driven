import { expect, type Page } from "@playwright/test";
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

export class PlaygroundPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("heading", { name: PLAYGROUND_TEXT.title }),
    ).toBeVisible();
    await expect(this.page.getByTestId("world-canvas")).toBeVisible();
  }

  async sendWaitingStimulus() {
    await this.page
      .getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingStimulus })
      .click();
  }

  async expectLastStimulus(stimulus: string) {
    await expect(
      this.page.getByText(`${PLAYGROUND_TEXT.lastStimulusPrefix} ${stimulus}`),
    ).toBeVisible();
  }
}
