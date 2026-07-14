import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { colorRamps, cream, paper } from "../src/tokens/colors";

const colorsCss = readFileSync(
  fileURLToPath(new URL("../src/tokens/colors.css", import.meta.url)),
  "utf8",
);

function cssVariableValue(name: string) {
  const match = colorsCss.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\b`));

  return match ? match[1].toUpperCase() : null;
}

describe("colors.ts mirrors colors.css", () => {
  for (const [rampName, ramp] of Object.entries(colorRamps)) {
    for (const [step, hex] of Object.entries(ramp)) {
      it(`--${rampName}-${step} matches`, () => {
        expect(hex.toUpperCase()).toBe(cssVariableValue(`${rampName}-${step}`));
      });
    }
  }

  it("--cream matches", () => {
    expect(cream.toUpperCase()).toBe(cssVariableValue("cream"));
  });

  it("--paper matches", () => {
    expect(paper.toUpperCase()).toBe(cssVariableValue("paper"));
  });
});
