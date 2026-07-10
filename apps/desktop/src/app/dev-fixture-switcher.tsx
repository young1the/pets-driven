import { DESKTOP_FIXTURES, type DesktopFixtureId } from "@/app/dev-fixtures";
import "@/app/dev-fixture-switcher.css";

export function DevFixtureSwitcher({ activeId }: { activeId: DesktopFixtureId }) {
  function selectFixture(fixtureId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("fixture", fixtureId);
    window.location.assign(url);
  }

  return (
    <aside className="dev-fixture-switcher" aria-label="Desktop fixture selector">
      <label htmlFor="desktop-fixture-select">Fixture</label>
      <select
        id="desktop-fixture-select"
        onChange={(event) => selectFixture(event.target.value)}
        value={activeId}
      >
        {DESKTOP_FIXTURES.map((fixture) => (
          <option key={fixture.id} value={fixture.id}>
            {fixture.label}
          </option>
        ))}
      </select>
      <span>{DESKTOP_FIXTURES.find((fixture) => fixture.id === activeId)?.description}</span>
    </aside>
  );
}
