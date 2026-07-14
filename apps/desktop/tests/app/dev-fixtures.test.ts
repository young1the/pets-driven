import { describe, expect, it } from "vitest";
import { DESKTOP_FIXTURE_IDS, DESKTOP_FIXTURES, resolveDesktopFixture } from "@/app/dev-fixtures";

describe("desktop development fixtures", () => {
  it("exposes every fixture id exactly once", () => {
    expect(DESKTOP_FIXTURES.map((fixture) => fixture.id)).toEqual(DESKTOP_FIXTURE_IDS);
  });

  it("resolves fixtures only on a loopback development URL", () => {
    expect(
      resolveDesktopFixture("?fixture=mixed", {
        hostname: "localhost",
        isDev: true,
      })?.id,
    ).toBe("mixed");
    expect(
      resolveDesktopFixture("?fixture=mixed", {
        hostname: "pets-driven.example.com",
        isDev: true,
      }),
    ).toBeNull();
    expect(
      resolveDesktopFixture("?fixture=mixed", {
        hostname: "localhost",
        isDev: false,
      }),
    ).toBeNull();
  });

  it("keeps fixture relationships internally consistent", () => {
    for (const fixture of DESKTOP_FIXTURES) {
      const profileIds = new Set(fixture.state.petProfiles.map((profile) => profile.id));
      const directoryIds = new Set(
        fixture.state.registeredWorkingDirectories.map((directory) => directory.id),
      );

      for (const pet of fixture.state.pets) {
        expect(profileIds.has(pet.profileId)).toBe(true);
        if (pet.workingDirectoryId) {
          expect(directoryIds.has(pet.workingDirectoryId)).toBe(true);
        }
      }
    }
  });

  it("includes an onboarding state with no installed Pet Assets", () => {
    const fixture = DESKTOP_FIXTURES.find((candidate) => candidate.id === "onboarding-empty");

    expect(fixture?.state.pets).toEqual([]);
    expect(fixture?.petPackages).toBe("empty");
  });
});
