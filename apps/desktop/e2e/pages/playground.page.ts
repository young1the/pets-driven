import { expect, type Page } from "@playwright/test";
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

export class PlaygroundPage {
  constructor(private readonly page: Page) {}

  async goto() {
    // The playground is its own entry beside the app's; "/" is the main window.
    await this.page.goto("/playground.html");
  }

  async expectReady() {
    await expect(this.page.getByRole("heading", { name: PLAYGROUND_TEXT.title })).toBeVisible();
    await expect(this.page.getByTestId("world-canvas")).toBeVisible();
    await expect(
      this.page.getByRole("heading", { name: PLAYGROUND_TEXT.behaviorLabTitle }),
    ).toBeVisible();
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

  async expectLastEventType(type: string) {
    await expect(this.page.getByText(new RegExp(`"type": "${type}"`))).toBeVisible();
  }

  private petRow(name: string) {
    return this.page.getByRole("listitem").filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }

  /** The agent's own report on the pet: its badge, and the line it says. */
  async expectPetAgentStatus(name: string, badge: string, speech: string) {
    const row = this.petRow(name);
    await expect(row).toBeVisible();
    await expect(row.getByText(badge, { exact: true })).toBeVisible();
    await expect(row.getByText(speech, { exact: true })).toBeVisible();
  }

  /**
   * That the row reports a steering mode the engine still uses — not which one.
   * A pet chooses its own errands, so pinning the value here would fail
   * whenever it happened to be standing still; what is worth pinning is the
   * vocabulary, which is what went stale (`idle`/`seek` are retired: see the
   * flagged ambiguities in CONTEXT.md).
   */
  async expectPetSteering(name: string) {
    // Matched against the one cell, not the whole row: the row's text runs
    // together, so a word boundary there has nothing to sit on.
    await expect(this.petRow(name).getByText(/^(stand|pursue|ease)$/)).toBeVisible();
  }

  async expectPetLocomotion(name: string, mode: string) {
    const row = this.petRow(name);
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

  async expectNoBehaviorComponent(component: string) {
    await expect(this.page.getByText(component, { exact: true })).toHaveCount(0);
  }

  async expectSelectedBehaviorPet(name: string) {
    await expect(this.page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
}
