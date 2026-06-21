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

  it("covers dynamic Pet Window labels (playground + adopted pets)", () => {
    // "pet-window-*" matches both pet-window-playground-N and the per-pet
    // adopted windows labelled pet-window-<uuid>.
    expect(capability.windows).toContain("pet-window-*");
  });

  it("allows the native window APIs used by Pet Windows", () => {
    expect(capability.permissions).toContain(
      "core:window:allow-current-monitor",
    );
    expect(capability.permissions).toContain(
      "core:window:allow-outer-position",
    );
    expect(capability.permissions).toContain("core:window:allow-set-position");
    expect(capability.permissions).toContain(
      "core:window:allow-set-ignore-cursor-events",
    );
    expect(capability.permissions).toContain(
      "core:window:allow-start-dragging",
    );
  });
});
