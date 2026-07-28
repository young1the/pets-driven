import { beforeEach, describe, expect, it } from "vitest";
import { PET_OVERLAY_MODE_STORAGE_KEY } from "@/app/local-settings-storage";
import { DEFAULT_PET_OVERLAY_MODE, readPetOverlayMode } from "@/app/pet-overlay-mode";

describe("readPetOverlayMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts on one window per pet, the mode the app has always had", () => {
    expect(DEFAULT_PET_OVERLAY_MODE).toBe("window-per-pet");
    expect(readPetOverlayMode()).toBe("window-per-pet");
  });

  it("reads back a stored mode", () => {
    window.localStorage.setItem(PET_OVERLAY_MODE_STORAGE_KEY, "single-window");

    expect(readPetOverlayMode()).toBe("single-window");
  });

  it("falls back to the default rather than trusting an unknown value", () => {
    // A desktop-wide window is not something to open on the strength of a
    // storage value nobody wrote.
    window.localStorage.setItem(PET_OVERLAY_MODE_STORAGE_KEY, "fullscreen");

    expect(readPetOverlayMode()).toBe(DEFAULT_PET_OVERLAY_MODE);
  });
});
