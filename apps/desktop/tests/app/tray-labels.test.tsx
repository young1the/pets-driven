import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopLocaleProvider, useDesktopLocale } from "@/app/i18n/desktop-locale";
import { useTrayLabels } from "@/app/use-tray-labels";

/**
 * The tray is the app's only surface while the window is closed, and the only
 * one the shell has to label itself — so it is also the only place a language
 * can be left behind. It shipped hardcoded Korean while the app's default
 * locale was English.
 */

const gatewayMocks = vi.hoisted(() => ({ setTrayLabels: vi.fn() }));

vi.mock("@/app/desktop-gateway", () => ({
  desktopGateway: {
    setTrayLabels: (...args: unknown[]) => {
      gatewayMocks.setTrayLabels(...args);
      return Promise.resolve();
    },
  },
}));

function TrayHost() {
  const { setLocale } = useDesktopLocale();
  useTrayLabels();

  return (
    <button onClick={() => setLocale("ja")} type="button">
      switch
    </button>
  );
}

function renderTrayHost() {
  return render(
    <DesktopLocaleProvider>
      <TrayHost />
    </DesktopLocaleProvider>,
  );
}

describe("tray labels", () => {
  it("labels the tray in the language the app is already speaking", () => {
    window.localStorage.setItem("pd-locale", "ko");
    gatewayMocks.setTrayLabels.mockClear();

    renderTrayHost();

    expect(gatewayMocks.setTrayLabels).toHaveBeenCalledWith("열기", "종료");
  });

  it("speaks English by default rather than one hardcoded language", () => {
    window.localStorage.removeItem("pd-locale");
    gatewayMocks.setTrayLabels.mockClear();

    renderTrayHost();

    expect(gatewayMocks.setTrayLabels).toHaveBeenCalledWith("Open", "Quit");
  });

  it("follows the language switcher without a restart", () => {
    window.localStorage.setItem("pd-locale", "ko");
    gatewayMocks.setTrayLabels.mockClear();

    const { getByRole } = renderTrayHost();
    fireEvent.click(getByRole("button", { name: "switch" }));

    expect(gatewayMocks.setTrayLabels).toHaveBeenLastCalledWith("開く", "終了");
  });
});
