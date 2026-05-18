import { expect, test } from "@playwright/test";

test("playground renders and accepts a stimulus", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "pets-driven playground" })).toBeVisible();
  await expect(page.getByTestId("world-canvas")).toBeVisible();

  await page.getByRole("button", { name: "Send waiting stimulus" }).click();
  await expect(page.getByText("Last stimulus: task.waiting")).toBeVisible();
});
