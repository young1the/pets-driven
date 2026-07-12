import { DESKTOP_FIXTURES, type DesktopFixtureId } from "@/app/dev-fixtures";
import { PET_WINDOW_FIXTURES } from "@/pet-window/pet-window-fixtures";
import "@/app/dev-fixture-switcher.css";

function petWindowFixtureUrl(fixtureId: string) {
  const fixture = PET_WINDOW_FIXTURES.find((f) => f.id === fixtureId);
  const url = new URL(window.location.origin);
  url.searchParams.set("surface", "pet-window");
  url.searchParams.set("fixture", fixtureId);
  if (fixture) {
    url.searchParams.set("petId", fixture.pet.petId);
    url.searchParams.set("assetId", fixture.pet.assetId);
    url.searchParams.set("windowIndex", String(fixture.pet.windowIndex));
    if (fixture.pet.name) {
      url.searchParams.set("name", fixture.pet.name);
    }
  }
  return url.toString();
}

export function DevFixtureSwitcher({
  activeId,
  onSelect,
}: {
  activeId: DesktopFixtureId;
  onSelect: (fixtureId: string) => void;
}) {
  return (
    <aside className="dev-fixture-switcher" aria-label="Desktop fixture selector">
      <label htmlFor="desktop-fixture-select">Fixture</label>
      <select
        id="desktop-fixture-select"
        onChange={(event) => onSelect(event.target.value)}
        value={activeId}
      >
        {DESKTOP_FIXTURES.map((fixture) => (
          <option key={fixture.id} value={fixture.id}>
            {fixture.label}
          </option>
        ))}
      </select>
      <span>{DESKTOP_FIXTURES.find((fixture) => fixture.id === activeId)?.description}</span>
      <a
        className="dev-fixture-switcher__pet-window-link"
        href={petWindowFixtureUrl(PET_WINDOW_FIXTURES[0].id)}
        rel="noreferrer"
        target="_blank"
      >
        Open pet window ↗
      </a>
    </aside>
  );
}
