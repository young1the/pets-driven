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
    await expect(
      this.page.getByRole("heading", { name: PLAYGROUND_TEXT.behaviorLabTitle }),
    ).toBeVisible();
  }

  async selectPlaygroundView(name: "Demo" | "Jump" | "Climb") {
    await this.page.getByRole("tab", { name, exact: true }).click();
  }

  async sendStartedEvent() {
    await this.page.getByRole("button", { name: "Prompt" }).click();
  }

  async sendWaitingEvent() {
    await this.page.getByRole("button", { name: "Waiting" }).click();
  }

  async sendCompletedEvent() {
    await this.page.getByRole("button", { name: "Done" }).click();
  }

  async startWalkDemo() {
    await this.selectPlaygroundView("Demo");
  }

  async startJumpDemo() {
    await this.selectPlaygroundView("Jump");
  }

  async startWallClimbDemo() {
    await this.selectPlaygroundView("Climb");
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

  async expectPetLocomotion(name: string, mode: string) {
    const row = this.page.getByRole("listitem").filter({
      has: this.page.getByText(name, { exact: true }),
    });
    await expect(row).toBeVisible();
    await expect(row.getByText(mode, { exact: true })).toBeVisible();
  }

  async expectLocomotion(mode: string) {
    await expect(this.page.getByText(mode, { exact: true })).toBeVisible();
  }

  async selectBehaviorPet(name: string) {
    await this.page.getByRole("button", { name, exact: true }).click();
  }

  async expectBehaviorComponent(component: string) {
    await expect(this.page.getByText(component, { exact: true })).toBeVisible();
  }

  async expectSelectedBehaviorPet(name: string) {
    await expect(
      this.page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
}
