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

  async startWalkDemo() {
    await this.page
      .getByRole("button", { name: PLAYGROUND_TEXT.startWalkDemo })
      .click();
  }

  async startJumpDemo() {
    await this.page
      .getByRole("button", { name: PLAYGROUND_TEXT.startJumpDemo })
      .click();
  }

  async startWallClimbDemo() {
    await this.page
      .getByRole("button", { name: PLAYGROUND_TEXT.startWallClimbDemo })
      .click();
  }

  async expectLastEventType(type: string) {
    await expect(
      this.page.getByText(new RegExp(`"type": "${type}"`)),
    ).toBeVisible();
  }

  async expectPetStatus(name: string, intent: string, speech: string) {
    const row = this.page.getByRole("listitem").filter({
      has: this.page.getByText(name, { exact: true }),
    });
    await expect(row).toBeVisible();
    await expect(row.getByText(intent, { exact: true })).toBeVisible();
    await expect(row.getByText(speech, { exact: true })).toBeVisible();
  }

  async expectLocomotion(mode: string) {
    await expect(this.page.getByText(mode, { exact: true })).toBeVisible();
  }
}
