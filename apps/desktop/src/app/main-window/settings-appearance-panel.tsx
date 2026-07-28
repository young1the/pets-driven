import { localeLabels, useTranslation } from "@pets-driven/i18n";
import { locales, useDesktopLocale } from "@/app/i18n/desktop-locale";
import {
  hint,
  label,
  rowStyle,
  seg,
  segWrap,
  swatch,
} from "@/app/main-window/settings-section.styles";
import { ACCENTS, useDesktopTheme } from "@/app/theme/desktop-theme";

/**
 * How the app looks and which language it speaks. Takes no props: theme and
 * locale live in their own providers, not in the persisted state document.
 */
export function SettingsAppearancePanel() {
  const { t } = useTranslation("desktop");
  const { locale, setLocale } = useDesktopLocale();
  const { mode, setMode, accent, setAccent } = useDesktopTheme();

  return (
    <>
      {/* Appearance — flips the whole-app light/dark/system theme. */}
      <div style={rowStyle()}>
        <span style={label}>{t("settings.appearance")}</span>
        <p style={hint}>{t("settings.appearanceDesc")}</p>
        <div style={segWrap}>
          <button onClick={() => setMode("light")} style={seg(mode === "light")} type="button">
            ☀ {t("settings.themeLight")}
          </button>
          <button onClick={() => setMode("dark")} style={seg(mode === "dark")} type="button">
            ☾ {t("settings.themeDark")}
          </button>
          <button onClick={() => setMode("system")} style={seg(mode === "system")} type="button">
            ◐ {t("settings.themeSystem")}
          </button>
        </div>
      </div>

      {/* App accent color — recolors accents across the whole app. */}
      <div style={rowStyle()}>
        <span style={label}>{t("settings.accentColor")}</span>
        <p style={hint}>{t("settings.accentColorDesc")}</p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {ACCENTS.map((color) => (
            <button
              aria-label={color.name}
              key={color.id}
              onClick={() => setAccent(color.id)}
              style={swatch(color.hex, accent === color.id)}
              title={color.name}
              type="button"
            />
          ))}
        </div>
      </div>

      {/* Language — real, persisted locale switch. */}
      <div style={rowStyle(true)}>
        <span style={label}>{t("settings.language")}</span>
        <p style={hint}>{t("settings.languageDesc")}</p>
        <div style={segWrap}>
          {locales.map((value) => (
            <button
              key={value}
              onClick={() => setLocale(value)}
              style={seg(locale === value)}
              type="button"
            >
              {localeLabels[value]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
