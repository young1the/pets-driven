import { useCallback, useEffect, useState } from "react";
import {
  type AppUpdateEvent,
  type AppUpdateInfo,
  type DesktopGateway,
  desktopGateway,
} from "@/app/desktop-gateway";

export type AppUpdateStatus =
  | "loading"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface AppUpdateController {
  currentVersion: string | null;
  status: AppUpdateStatus;
  availableUpdate: AppUpdateInfo | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  check: () => Promise<void>;
  install: () => Promise<void>;
}

interface AppUpdateState {
  currentVersion: string | null;
  status: AppUpdateStatus;
  availableUpdate: AppUpdateInfo | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
}

const INITIAL_STATE: AppUpdateState = {
  currentVersion: null,
  status: "loading",
  availableUpdate: null,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Own the manual check → download → install lifecycle for the settings panel. */
export function useAppUpdate(gateway: DesktopGateway = desktopGateway): AppUpdateController {
  const [state, setState] = useState<AppUpdateState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    gateway
      .getAppVersion()
      .then((currentVersion) => {
        if (active) {
          setState((current) => ({ ...current, currentVersion, status: "idle" }));
        }
      })
      .catch((error) => {
        if (active) {
          setState((current) => ({
            ...current,
            status: "error",
            error: errorMessage(error),
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [gateway]);

  const check = useCallback(async () => {
    setState((current) => ({ ...current, status: "checking", error: null }));
    try {
      const update = await gateway.checkAppUpdate();
      setState((current) => ({
        ...current,
        currentVersion: update?.currentVersion ?? current.currentVersion,
        status: update ? "available" : "up-to-date",
        availableUpdate: update,
        downloadedBytes: 0,
        totalBytes: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: errorMessage(error),
      }));
    }
  }, [gateway]);

  const install = useCallback(async () => {
    const version = state.availableUpdate?.version;
    if (!version) {
      return;
    }

    setState((current) => ({
      ...current,
      status: "downloading",
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    }));

    const onEvent = (event: AppUpdateEvent) => {
      setState((current) => {
        if (event.event === "started") {
          return {
            ...current,
            status: "downloading",
            downloadedBytes: 0,
            totalBytes: event.contentLength ?? null,
          };
        }
        if (event.event === "progress") {
          return {
            ...current,
            downloadedBytes: current.downloadedBytes + (event.chunkLength ?? 0),
          };
        }
        return { ...current, status: "installing" };
      });
    };

    try {
      await gateway.installAppUpdate(version, onEvent);
      // On Windows the installer normally exits this process. Keeping this
      // state covers the short handoff and non-Windows development builds.
      setState((current) => ({ ...current, status: "installing" }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: errorMessage(error),
      }));
    }
  }, [gateway, state.availableUpdate?.version]);

  return { ...state, check, install };
}
