import {
  type IconProps,
  PaletteIcon,
  PawIcon,
  PlugIcon,
  TerminalIcon,
  TrashIcon,
} from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import type { ComponentType } from "react";
import { useState } from "react";
import {
  SettingsAgentPanel,
  type SettingsAgentPanelProps,
} from "@/app/main-window/settings-agent-panel";
import { SettingsAppearancePanel } from "@/app/main-window/settings-appearance-panel";
import {
  SettingsPetsPanel,
  type SettingsPetsPanelProps,
} from "@/app/main-window/settings-pets-panel";
import {
  SettingsResetPanel,
  type SettingsResetPanelProps,
} from "@/app/main-window/settings-reset-panel";
import {
  SettingsTerminalPanel,
  type SettingsTerminalPanelProps,
} from "@/app/main-window/settings-terminal-panel";
import "@/app/main-window/settings-section.css";

export type { AgentPluginConnection } from "@/app/main-window/settings-agent-panel";

/**
 * The screen is one prop bag — the host wires settings once — split by kind
 * only at the point it is rendered, so each panel still declares what it needs.
 */
export type SettingsSectionProps = SettingsTerminalPanelProps &
  SettingsAgentPanelProps &
  SettingsPetsPanelProps &
  SettingsResetPanelProps;

/** The categories the rail offers, in the order they appear. */
export type SettingsCategory = "terminal" | "agent" | "pets" | "appearance" | "reset";

const CATEGORIES: {
  id: SettingsCategory;
  icon: ComponentType<IconProps>;
  /** Marks the one category whose actions delete something. */
  danger?: true;
}[] = [
  { id: "terminal", icon: TerminalIcon },
  { id: "agent", icon: PlugIcon },
  { id: "pets", icon: PawIcon },
  { id: "appearance", icon: PaletteIcon },
  { id: "reset", icon: TrashIcon, danger: true },
];

/** `settings.sectionTerminal`, `settings.sectionTerminalDesc`, and so on. */
function titleKey(id: SettingsCategory): string {
  return `settings.section${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

/**
 * Settings, split by kind: a category rail beside one panel at a time. The
 * active category is view state — nothing about which panel is open is worth
 * persisting, and every panel's own settings are already persisted by whoever
 * owns them.
 */
export function SettingsSection(props: SettingsSectionProps) {
  const { t } = useTranslation("desktop");
  const [category, setCategory] = useState<SettingsCategory>("terminal");

  return (
    <div className="pd-settings">
      <nav aria-label={t("settings.sectionsLabel")} className="pd-settings__rail">
        <h2 className="pd-settings__rail-title">{t("settings.title")}</h2>
        {CATEGORIES.map(({ id, icon: Icon, danger }) => (
          <button
            aria-current={category === id}
            className={[
              "pd-settings__nav-item",
              category === id ? "pd-settings__nav-item--active" : "",
              danger ? "pd-settings__nav-item--danger" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={id}
            onClick={() => setCategory(id)}
            type="button"
          >
            <span aria-hidden className="pd-settings__nav-icon">
              <Icon size={16} />
            </span>
            {t(titleKey(id))}
          </button>
        ))}
      </nav>

      <div className="pd-settings__panel">
        <h3 className="pd-settings__panel-title">{t(titleKey(category))}</h3>
        <p className="pd-settings__panel-desc">{t(`${titleKey(category)}Desc`)}</p>
        <div className="pd-settings__card">
          {category === "terminal" ? (
            <SettingsTerminalPanel
              command={props.command}
              onCommand={props.onCommand}
              onTerminalShell={props.onTerminalShell}
              preview={props.preview}
              terminalShell={props.terminalShell}
            />
          ) : category === "agent" ? (
            <SettingsAgentPanel
              hook={props.hook}
              plugins={props.plugins}
              terminalAvailable={props.terminalAvailable}
            />
          ) : category === "pets" ? (
            <SettingsPetsPanel
              onChangePetFolder={props.onChangePetFolder}
              onOpenPetFolder={props.onOpenPetFolder}
              onResetPetFolder={props.onResetPetFolder}
              onSetOverlayMode={props.onSetOverlayMode}
              onSetQuietMode={props.onSetQuietMode}
              overlayMode={props.overlayMode}
              petSourceDirectory={props.petSourceDirectory}
              quietMode={props.quietMode}
            />
          ) : category === "appearance" ? (
            <SettingsAppearancePanel />
          ) : (
            <SettingsResetPanel
              onResetAllSettings={props.onResetAllSettings}
              onResetPets={props.onResetPets}
            />
          )}
        </div>
      </div>
    </div>
  );
}
