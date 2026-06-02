import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type TauriCapability = {
  windows?: string[];
  permissions?: string[];
};

describe("pet window tauri capability", () => {
  const capability = JSON.parse(
    readFileSync(
      join(process.cwd(), "src-tauri", "capabilities", "default.json"),
      "utf8",
    ),
  ) as TauriCapability;

  it("covers dynamic Pet Window labels", () => {
    expect(capability.windows).toContain("pet-window-playground-*");
  });

  it("allows the native window APIs used by Pet Windows", () => {
    expect(capability.permissions).toContain(
      "core:window:allow-current-monitor",
    );
    expect(capability.permissions).toContain(
      "core:window:allow-outer-position",
    );
    expect(capability.permissions).toContain(
      "core:window:allow-set-position",
    );
    expect(capability.permissions).toContain(
      "core:window:allow-set-ignore-cursor-events",
    );
    expect(capability.permissions).toContain(
      "core:window:allow-start-dragging",
    );
  });
});
