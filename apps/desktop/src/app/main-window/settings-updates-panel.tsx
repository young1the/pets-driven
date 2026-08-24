import { useTranslation } from "@pets-driven/i18n";
import type { AppUpdateController } from "@/app/app-updates/use-app-update";
import {
  connectionCard,
  connectionText,
  hint,
  label,
  rowStyle,
  smallAction,
  statusDot,
} from "@/app/main-window/settings-section.styles";

export interface SettingsUpdatesPanelProps {
  appUpdate: AppUpdateController;
}

function downloadPercent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) {
    return null;
  }
  return Math.min(100, Math.round((downloaded / total) * 100));
}

/** Version details and the user-initiated signed update flow. */
export function SettingsUpdatesPanel({ appUpdate }: SettingsUpdatesPanelProps) {
  const { t } = useTranslation("desktop");
  const percent = downloadPercent(appUpdate.downloadedBytes, appUpdate.totalBytes);
  const busy = appUpdate.status === "checking" || appUpdate.status === "downloading";

  return (
    <div style={rowStyle(true)}>
      <span style={label}>{t("settings.appVersion")}</span>
      <p style={hint}>{t("settings.appVersionDesc")}</p>

      <div style={connectionCard}>
        <span aria-hidden style={statusDot(appUpdate.status === "error" ? "danger" : "success")} />
        <span style={connectionText}>
          <b>
            {appUpdate.currentVersion
              ? t("settings.currentVersion", { version: appUpdate.currentVersion })
              : t("settings.developmentVersion")}
          </b>
          <small aria-live="polite" style={{ color: "var(--text-muted)", lineHeight: 1.45 }}>
            {appUpdate.status === "loading"
              ? t("settings.versionLoading")
              : appUpdate.status === "checking"
                ? t("settings.updateChecking")
                : appUpdate.status === "up-to-date"
                  ? t("settings.updateUpToDate")
                  : appUpdate.status === "available"
                    ? t("settings.updateAvailable", {
                        version: appUpdate.availableUpdate?.version,
                      })
                    : appUpdate.status === "downloading"
                      ? percent === null
                        ? t("settings.updateDownloading")
                        : t("settings.updateDownloadingPercent", { percent })
                      : appUpdate.status === "installing"
                        ? t("settings.updateInstalling")
                        : appUpdate.status === "error"
                          ? t("settings.updateFailed")
                          : t("settings.updateReady")}
          </small>
        </span>
        {appUpdate.status === "available" ? (
          <button onClick={() => void appUpdate.install()} style={smallAction} type="button">
            {t("settings.updateInstall")}
          </button>
        ) : (
          <button
            disabled={busy || appUpdate.status === "installing" || !appUpdate.currentVersion}
            onClick={() => void appUpdate.check()}
            style={{ ...smallAction, opacity: busy ? 0.65 : 1 }}
            type="button"
          >
            {appUpdate.status === "error" ? t("settings.updateRetry") : t("settings.updateCheck")}
          </button>
        )}
      </div>

      {appUpdate.status === "downloading" ? (
        <progress
          aria-label={t("settings.updateDownloadProgress")}
          max={appUpdate.totalBytes ?? undefined}
          style={{ width: "100%", marginTop: "12px", accentColor: "var(--color-primary)" }}
          value={appUpdate.totalBytes ? appUpdate.downloadedBytes : undefined}
        />
      ) : null}

      {appUpdate.status === "available" ? (
        <>
          <p style={{ ...hint, marginTop: "12px" }}>{t("settings.updateRestartWarning")}</p>
          {appUpdate.availableUpdate?.notes ? (
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>
                {t("settings.updateReleaseNotes")}
              </summary>
              <p style={{ ...hint, whiteSpace: "pre-wrap", marginBottom: 0 }}>
                {appUpdate.availableUpdate.notes}
              </p>
            </details>
          ) : null}
        </>
      ) : null}

      {appUpdate.error ? (
        <p role="alert" style={{ ...hint, color: "#d9544f", marginTop: "12px", marginBottom: 0 }}>
          {appUpdate.error}
        </p>
      ) : null}
    </div>
  );
}
