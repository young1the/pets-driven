import {
  getWorldViewport,
  type MonitorWorkArea,
} from "@pets-driven/pet-engine/core/monitor-geometry";
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  type Monitor,
} from "@tauri-apps/api/window";
import {
  clampPetWindowScale,
  DEFAULT_PET_WINDOW_SCALE,
  PET_WINDOW_LAYOUT,
} from "@/pet-window/pet-window-layout";

export const DESKTOP_FIXTURE_WORLD_SIZE = { width: 1920, height: 1080 };

export function desktopFixturePetBodySize(
  bounds: { width: number; height: number },
  scale = DEFAULT_PET_WINDOW_SCALE,
) {
  const scaleX = bounds.width / DESKTOP_FIXTURE_WORLD_SIZE.width;
  const scaleY = bounds.height / DESKTOP_FIXTURE_WORLD_SIZE.height;

  return {
    width: (PET_WINDOW_LAYOUT.body.width * scale) / scaleX,
    height: (PET_WINDOW_LAYOUT.body.height * scale) / scaleY,
  };
}

// Adopted pets run in a world sized to the real work area, so their projection
// is 1:1 — the physics body must equal the sprite's body rect directly, not be
// divided by the fixture world scale (which left pets half-sunk behind the
// taskbar).
export function adoptedPetBodySize(scale = 1) {
  const petScale = clampPetWindowScale(scale);

  return {
    width: PET_WINDOW_LAYOUT.body.width * petScale,
    height: PET_WINDOW_LAYOUT.body.height * petScale,
  };
}

export async function loadMainWindowSpawnPoint(): Promise<{
  x: number;
  y: number;
} | null> {
  try {
    const currentWindow = getCurrentWindow();
    const [position, size, monitor] = await Promise.all([
      currentWindow.outerPosition(),
      currentWindow.outerSize(),
      currentMonitor(),
    ]);
    const dpi = monitor?.scaleFactor ?? 1;

    return {
      x: (position.x + size.width / 2) / dpi,
      y: (position.y + size.height / 2) / dpi,
    };
  } catch {
    return null;
  }
}

export function monitorToWorkArea(monitor: Monitor, index: number): MonitorWorkArea {
  const dpi = monitor.scaleFactor;

  return {
    id: monitor.name ?? `monitor-${index + 1}`,
    x: monitor.workArea.position.x / dpi,
    y: monitor.workArea.position.y / dpi,
    width: monitor.workArea.size.width / dpi,
    height: monitor.workArea.size.height / dpi,
  };
}

export function projectionBoundsForMonitors(monitors: MonitorWorkArea[]) {
  return getWorldViewport(monitors);
}

export async function loadDesktopMonitorWorkAreas(): Promise<MonitorWorkArea[]> {
  try {
    const monitors = await availableMonitors();

    if (monitors.length > 0) {
      return monitors.map(monitorToWorkArea);
    }
  } catch {
    // Fall back to the current monitor below.
  }

  const monitor = await currentMonitor();

  return monitor ? [monitorToWorkArea(monitor, 0)] : [];
}
