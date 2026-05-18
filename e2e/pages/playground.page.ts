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

  async sendStartedEvent() {
    await this.page
      .getByRole("button", { name: PLAYGROUND_TEXT.sendStartedEvent })
      .click();
  }

  async sendWaitingEvent() {
    await this.page
      .getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent })
      .click();
  }

  async sendCompletedEvent() {
    await this.page
      .getByRole("button", { name: PLAYGROUND_TEXT.sendCompletedEvent })
      .click();
  }

  async expectLastEventType(type: string) {
    await expect(
      this.page.getByText(new RegExp(`"type": "${type}"`)),
    ).toBeVisible();
  }

  async expectPetStatus(name: string, intent: string, speech: string) {
    await expect(this.page.getByText(name, { exact: true })).toBeVisible();
    await expect(this.page.getByText(intent, { exact: true })).toBeVisible();
    await expect(this.page.getByText(speech, { exact: true })).toBeVisible();
  }
}
