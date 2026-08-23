import { useTranslation } from "@pets-driven/i18n";
import { useEffect } from "react";
import { desktopGateway } from "@/app/desktop-gateway";

/**
 * Keep the tray menu in the user's language.
 *
 * The tray is built by the shell before any webview exists, so it starts in the
 * app's default locale (English) and is relabelled from here — once on startup
 * and again whenever the language switcher changes the locale. The main window
 * is the only caller: the tray is one menu, not one per window.
 *
 * Failures are swallowed. A tray whose labels lag behind the app is a cosmetic
 * problem, and the window it would interrupt is the one the user is reading.
 */
export function useTrayLabels() {
  const { t } = useTranslation("desktop");

  // `t` is re-created for each language, so it is also the signal that the
  // language changed — the tray follows the switcher without a restart, which
  // the suite pins in case that ever stops being true.
  useEffect(() => {
    void desktopGateway.setTrayLabels(t("tray.open"), t("tray.quit")).catch(() => {});
  }, [t]);
}
