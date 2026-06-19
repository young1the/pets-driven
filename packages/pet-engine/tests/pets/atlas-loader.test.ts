import { describe, expect, it, vi } from "vitest";
import { loadAtlasImage } from "@pets-driven/pet-engine/pets/assets/atlas-loader";

describe("atlas loader", () => {
  it("resolves after the browser loads the image", async () => {
    const createdImages: Array<{ src: string; onload: (() => void) | null }> = [];

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private value = "";

      set src(value: string) {
        this.value = value;
        createdImages.push(this);
      }

      get src() {
        return this.value;
      }
    }

    vi.stubGlobal("Image", FakeImage);
    const pending = loadAtlasImage("/pets/jori.webp");
    createdImages[0]?.onload?.();

    await expect(pending).resolves.toBeInstanceOf(FakeImage);
    vi.unstubAllGlobals();
  });
});
