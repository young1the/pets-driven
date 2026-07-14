import { PET_WINDOW_FIXTURES, type PetWindowFixtureId } from "@/pet-window/pet-window-fixtures";
import "@/pet-window/pet-window-fixture-switcher.css";

function contextMenuPreviewUrl(petId: string, petName: string) {
  const url = new URL(window.location.origin);
  url.searchParams.set("surface", "pet-context-menu");
  url.searchParams.set("petId", petId);
  url.searchParams.set("petName", petName);
  url.searchParams.set("note", "");
  return url.toString();
}

export function PetWindowFixtureSwitcher({
  activeId,
  onSelect,
}: {
  activeId: PetWindowFixtureId;
  onSelect: (fixtureId: string) => void;
}) {
  const activeFixture = PET_WINDOW_FIXTURES.find((fixture) => fixture.id === activeId);

  return (
    <aside className="pet-window-fixture-switcher" aria-label="Pet window fixture selector">
      <label htmlFor="pet-window-fixture-select">Fixture</label>
      <select
        id="pet-window-fixture-select"
        onChange={(event) => onSelect(event.target.value)}
        value={activeId}
      >
        {PET_WINDOW_FIXTURES.map((fixture) => (
          <option key={fixture.id} value={fixture.id}>
            {fixture.label}
          </option>
        ))}
      </select>
      <span>{activeFixture?.description}</span>
      {activeFixture ? (
        <a
          className="pet-window-fixture-switcher__context-menu-link"
          href={contextMenuPreviewUrl(
            activeFixture.pet.petId,
            activeFixture.pet.name ?? activeFixture.pet.petId,
          )}
          rel="noreferrer"
          target="_blank"
        >
          Open context menu ↗
        </a>
      ) : null}
    </aside>
  );
}
