import {
  Button,
  GearIcon,
  HomeIcon,
  Tabs,
  TerminalIcon,
  WrenchIcon,
} from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { useEffect, useState } from "react";
import { DebugSection, type DebugSectionProps } from "@/app/main-window/debug-section";
import { HomeSection, type HomeSectionProps } from "@/app/main-window/home-section";
import {
  PetEditSection,
  type PetEditSectionProps,
  type PetEditView,
} from "@/app/main-window/pet-edit-section";
import { SettingsSection, type SettingsSectionProps } from "@/app/main-window/settings-section";
import { TerminalSection, type TerminalSectionProps } from "@/app/main-window/terminal-section";
import "@/app/main-window/main-window.css";

export type MainWindowTab = "home" | "terminal" | "settings" | "debug";

export interface MainWindowProps {
  tab: MainWindowTab;
  onTab: (tab: MainWindowTab) => void;
  editPet: PetEditView | null;
  home: HomeSectionProps;
  edit: Omit<PetEditSectionProps, "pet">;
  settings: SettingsSectionProps;
  /** The coach is the terminal tab's own affair, so it is not wired from here. */
  terminal: Omit<TerminalSectionProps, "showOnboarding">;
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
  terminal,
  debug,
  toast,
}: MainWindowProps) {
  const { t } = useTranslation("desktop");
  const terminalVisible = !editPet && tab === "terminal";
  // The terminal tab owns a live PTY, so unmounting it on a tab switch would
  // kill the session and hand the user a fresh shell — losing their scrollback
  // and their working folder — every time they came back. Mount it on the first
  // visit (xterm is lazy, so an untouched tab still costs nothing) and from then
  // on only hide it.
  const [terminalMounted, setTerminalMounted] = useState(terminalVisible);
  useEffect(() => {
    if (terminalVisible) {
      setTerminalMounted(true);
    }
  }, [terminalVisible]);

  return (
    <div className="pd-main pd-main__dots">
      <header className="pd-main__header">
        <Tabs
          items={[
            { value: "home", label: t("nav.home"), icon: <HomeIcon /> },
            {
              value: "terminal",
              label: t("nav.terminal"),
              icon: <TerminalIcon />,
            },
            { value: "settings", label: t("nav.settings"), icon: <GearIcon /> },
            // The debug tab is a dev-only surface (see the "devOnly" badge in
            // DebugSection); hide it entirely from production builds.
            ...(import.meta.env.DEV
              ? [{ value: "debug", label: t("nav.debug"), icon: <WrenchIcon /> }]
              : []),
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
            <Button
              // A pet has to be on the desktop to walk over and collect a
              // trinket; with none out, the drop would land on an empty floor.
              disabled={home.inField.length === 0}
              iconLeft={<span aria-hidden="true">🍪</span>}
              onClick={home.onDropItem}
              size="sm"
              title={t("nav.treatHint")}
              variant="accent"
            >
              {t("nav.treat")}
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
      ) : tab === "debug" ? (
        <div className="pd-main__body">
          <DebugSection {...debug} />
        </div>
      ) : null}

      {/* The terminal tab is the one surface that greets a new user with the
          Cato coach; every other reuse of TerminalSection leaves it off. */}
      {terminalMounted && (
        // `display: contents` keeps .pd-eterm a direct flex child of .pd-main,
        // so the shown terminal lays out exactly as it did when it was rendered
        // inline; `none` takes it out of layout without unmounting it.
        <div style={{ display: terminalVisible ? "contents" : "none" }}>
          <TerminalSection {...terminal} showOnboarding visible={terminalVisible} />
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
