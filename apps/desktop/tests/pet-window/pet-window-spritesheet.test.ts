import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { loadPetWindowSpritesheetUrl } from "@/pet-window/pet-window-spritesheet";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const isTauriMock = vi.mocked(isTauri);
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  invokeMock.mockReset();
  isTauriMock.mockReset();
  isTauriMock.mockReturnValue(false);
});

describe("pet window spritesheet loading", () => {
  it("uses the browser Codex pets route outside Tauri", async () => {
    const spritesheet = await loadPetWindowSpritesheetUrl("cato");

    expect(spritesheet.url).toBe("/codex-pets/cato/spritesheet.webp");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("loads Codex pet spritesheets through Tauri and revokes object URLs", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    URL.createObjectURL = vi.fn<typeof URL.createObjectURL>().mockReturnValue("blob:codex-pet");
    URL.revokeObjectURL = vi.fn<typeof URL.revokeObjectURL>();

    const spritesheet = await loadPetWindowSpritesheetUrl("cato");

    expect(invokeMock).toHaveBeenCalledWith("load_codex_pet_spritesheet", {
      assetId: "cato",
    });
    expect(spritesheet.url).toBe("blob:codex-pet");

    spritesheet.dispose();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:codex-pet");
  });
});
