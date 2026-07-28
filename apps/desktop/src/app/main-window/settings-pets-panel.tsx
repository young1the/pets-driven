import { ExternalLinkIcon, FolderIcon } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import {
  connectionCard,
  connectionText,
  hint,
  label,
  rowStyle,
  seg,
  segWrap,
  smallAction,
} from "@/app/main-window/settings-section.styles";
import type { PetOverlayMode } from "@/app/pet-overlay-mode";

export interface SettingsPetsPanelProps {
  /** The single folder scanned for pet packs; null = no folder designated. */
  petSourceDirectory: string | null;
  onChangePetFolder: () => void;
  /** Reveal the designated pet folder in Explorer. Only shown when one is set. */
  onOpenPetFolder: () => void;
  /** Clear the designated folder, dropping back to the bundled pets alone. */
  onResetPetFolder: () => void;
  /**
   * Whether each pet gets its own always-on-top window or they all share one
   * transparent, click-through window over the whole desktop.
   */
  overlayMode: PetOverlayMode;
  onSetOverlayMode: (mode: PetOverlayMode) => void;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);

  return parts[parts.length - 1] || path;
}

/** Where pets come from, and how they are put on the desktop. */
export function SettingsPetsPanel({
  petSourceDirectory,
  onChangePetFolder,
  onOpenPetFolder,
  onResetPetFolder,
  overlayMode,
  onSetOverlayMode,
}: SettingsPetsPanelProps) {
  const { t } = useTranslation("desktop");

  return (
    <>
      {/* Pet source folder — the single persisted scan root. */}
      <div style={rowStyle()}>
        <span style={label}>{t("settings.petSourcesTitle")}</span>
        <p style={hint}>{t("settings.petSourcesDesc")}</p>
        {/* Same card shape as the agent connection rows: the folder reads on
            the left, its actions sit alongside it rather than underneath. */}
        <div style={connectionCard}>
          <span style={{ color: "var(--text-muted)", display: "flex" }}>
            <FolderIcon />
          </span>
          <span style={connectionText}>
            <b style={{ color: "var(--text-strong)", fontSize: "13.5px" }}>
              {petSourceDirectory ? folderName(petSourceDirectory) : t("settings.noPetFolder")}
            </b>
            <small
              style={{
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {petSourceDirectory ?? t("settings.noPetFolderHint")}
            </small>
          </span>
          {petSourceDirectory && (
            <button
              onClick={onOpenPetFolder}
              style={{
                ...smallAction,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              title={t("settings.openPetFolder")}
              type="button"
            >
              <ExternalLinkIcon size={14} />
              {t("settings.openPetFolder")}
            </button>
          )}
          <button onClick={onChangePetFolder} style={smallAction} type="button">
            {t("settings.changePetFolder")}
          </button>
          {petSourceDirectory && (
            <button onClick={onResetPetFolder} style={smallAction} type="button">
              {t("settings.clearPetFolder")}
            </button>
          )}
        </div>
      </div>

      {/* How the pets are put on the desktop. One window each layers them
          individually against other apps; one shared window costs a single
          webview however many pets are out. */}
      <div style={rowStyle(true)}>
        <span style={label}>{t("settings.petWindowMode")}</span>
        <p style={hint}>
          {overlayMode === "single-window"
            ? t("settings.petWindowModeSingleDesc")
            : t("settings.petWindowModePerPetDesc")}
        </p>
        <div style={segWrap}>
          <button
            onClick={() => onSetOverlayMode("window-per-pet")}
            style={seg(overlayMode === "window-per-pet")}
            type="button"
          >
            {t("settings.petWindowModePerPet")}
          </button>
          <button
            onClick={() => onSetOverlayMode("single-window")}
            style={seg(overlayMode === "single-window")}
            type="button"
          >
            {t("settings.petWindowModeSingle")}
          </button>
        </div>
      </div>
    </>
  );
}
