import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAppUpdate } from "@/app/app-updates/use-app-update";
import { type AppUpdateEvent, type DesktopGateway, desktopGateway } from "@/app/desktop-gateway";

function gateway(overrides: Partial<DesktopGateway> = {}): DesktopGateway {
  return {
    ...desktopGateway,
    getAppVersion: vi.fn().mockResolvedValue("1.0.0"),
    checkAppUpdate: vi.fn().mockResolvedValue(null),
    installAppUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useAppUpdate", () => {
  it("loads the packaged version without checking the network", async () => {
    const checkAppUpdate = vi.fn().mockResolvedValue(null);
    const testGateway = gateway({ checkAppUpdate });
    const { result } = renderHook(() => useAppUpdate(testGateway));

    await waitFor(() => expect(result.current.currentVersion).toBe("1.0.0"));
    expect(result.current.status).toBe("idle");
    expect(checkAppUpdate).not.toHaveBeenCalled();
  });

  it("keeps the available release for explicit user approval", async () => {
    const checkAppUpdate = vi.fn().mockResolvedValue({
      currentVersion: "1.0.0",
      version: "1.1.0",
      notes: "New pets.",
      date: "2026-08-24T00:00:00Z",
    });
    const testGateway = gateway({ checkAppUpdate });
    const { result } = renderHook(() => useAppUpdate(testGateway));
    await waitFor(() => expect(result.current.status).toBe("idle"));

    await act(() => result.current.check());

    expect(result.current.status).toBe("available");
    expect(result.current.availableUpdate?.version).toBe("1.1.0");
  });

  it("tracks native download events and hands off to the installer", async () => {
    const installAppUpdate = vi.fn(
      async (_version: string, onEvent: (event: AppUpdateEvent) => void) => {
        onEvent({ event: "started", contentLength: 100 });
        onEvent({ event: "progress", chunkLength: 40 });
        onEvent({ event: "progress", chunkLength: 60 });
        onEvent({ event: "finished" });
      },
    );
    const update = {
      currentVersion: "1.0.0",
      version: "1.1.0",
      notes: null,
      date: null,
    };
    const testGateway = gateway({
      checkAppUpdate: vi.fn().mockResolvedValue(update),
      installAppUpdate,
    });
    const { result } = renderHook(() => useAppUpdate(testGateway));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    await act(() => result.current.check());

    await act(() => result.current.install());

    expect(installAppUpdate).toHaveBeenCalledWith("1.1.0", expect.any(Function));
    expect(result.current.downloadedBytes).toBe(100);
    expect(result.current.totalBytes).toBe(100);
    expect(result.current.status).toBe("installing");
  });
});
