import { Button, Tabs } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import {
  GearIcon,
  HomeIcon,
  WrenchIcon,
} from "@/app/main-window/main-window-icons";
import {
  HomeSection,
  type HomeSectionProps,
} from "@/app/main-window/home-section";
import {
  PetEditSection,
  type PetEditSectionProps,
  type PetEditView,
} from "@/app/main-window/pet-edit-section";
import {
  SettingsSection,
  type SettingsSectionProps,
} from "@/app/main-window/settings-section";
import {
  DebugSection,
  type DebugSectionProps,
} from "@/app/main-window/debug-section";
import "@/app/main-window/main-window.css";

export type MainWindowTab = "home" | "settings" | "debug";

export interface MainWindowProps {
  tab: MainWindowTab;
  onTab: (tab: MainWindowTab) => void;
  editPet: PetEditView | null;
  home: HomeSectionProps;
  edit: Omit<PetEditSectionProps, "pet">;
  settings: SettingsSectionProps;
  debug: DebugSectionProps;
  toast: string | null;
}

export function MainWindow({
  tab,
  onTab,
  editPet,
  home,
  edit,
  settings,
  debug,
  toast,
}: MainWindowProps) {
  const { t } = useTranslation("desktop");
  return (
    <div className="pd-main pd-main__dots">
      <header className="pd-main__header">
        <Tabs
          items={[
            { value: "home", label: t("nav.home"), icon: <HomeIcon /> },
            { value: "settings", label: t("nav.settings"), icon: <GearIcon /> },
            { value: "debug", label: t("nav.debug"), icon: <WrenchIcon /> },
          ]}
          onChange={(value) => onTab(value as MainWindowTab)}
          value={editPet ? "" : tab}
        />
        {!editPet && tab === "home" && (
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span
              style={{
                whiteSpace: "nowrap",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--text-subtle)",
                marginRight: "2px",
              }}
            >
              {t("nav.onDesktop", { n: home.inField.length })}
            </span>
            <Button onClick={home.onShowAll} size="sm" variant="neutral">
              {t("nav.showAll")}
            </Button>
            <Button onClick={home.onHideAll} size="sm" variant="neutral">
              {t("nav.hideAll")}
            </Button>
          </div>
        )}
      </header>

      {editPet ? (
        <div className="pd-main__body">
          <PetEditSection pet={editPet} {...edit} />
        </div>
      ) : tab === "home" ? (
        <HomeSection {...home} />
      ) : tab === "settings" ? (
        <div className="pd-main__body">
          <SettingsSection {...settings} />
        </div>
      ) : (
        <div className="pd-main__body">
          <DebugSection {...debug} />
        </div>
      )}

      {toast ? (
        <div className="pd-app-toast">
          <span aria-hidden="true">🐾</span>
          <span className="pd-app-toast__label">{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
