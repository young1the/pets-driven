import { Select } from "@pets-driven/design-system";
import { localeLabels, useTranslation, type Locale } from "@pets-driven/i18n";
import {
  locales,
  useDesktopLocale,
} from "@/app/i18n/desktop-locale";

/**
 * Language picker for the settings surface. Flips the active desktop locale
 * (persisted by `DesktopLocaleProvider`), so the whole app re-renders in the
 * chosen language.
 */
export function DesktopLanguageSwitcher() {
  const { t } = useTranslation("common");
  const { locale, setLocale } = useDesktopLocale();

  return (
    <Select
      label={t("language.switchLabel")}
      onChange={(event) => setLocale(event.target.value as Locale)}
      options={locales.map((value) => ({
        value,
        label: localeLabels[value],
      }))}
      value={locale}
    />
  );
}
