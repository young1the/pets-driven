import "@testing-library/jest-dom/vitest";
import { initI18nForTesting } from "@pets-driven/i18n/testing";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Components under test call `useTranslation` without mounting the app's
// `DesktopLocaleProvider`, so initialize a global react-i18next instance in the
// source locale. `useTranslation` falls back to this default instance when no
// provider is present, resolving keys to their English source strings.
initI18nForTesting("en");

afterEach(() => {
  cleanup();
});

// jsdom does not implement PointerEvent; polyfill so fireEvent.pointerDown/Up
// creates real PointerEvents (with button, clientX, clientY, etc.).
if (typeof window !== "undefined" && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    value: PointerEventPolyfill,
    writable: true,
    configurable: true,
  });
}
