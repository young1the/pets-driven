import { createPlayfulPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetsDrivenApp } from "@/app/pets-driven-app";
import type { PetsDrivenState } from "@/app-state/pets-driven-state";
import { PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import {
  PET_WINDOW_BINDING_EVENT,
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_RESIZE_EVENT,
} from "@/pet-window/pet-window-messages";

type TauriEventHandler = (event: { payload: unknown }) => void;

function domRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function petWindowFramePayload({
  sequence,
  petId,
  x,
  y,
  width = PET_WINDOW_LAYOUT.width,
  height = PET_WINDOW_LAYOUT.height,
  overlay = { kind: "status", label: "!" },
}: {
  sequence: number;
  petId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  overlay?: { kind: "attention" | "speech" | "status"; label: string } | null;
}) {
  return {
    schemaVersion: 1,
    sequence,
    petId,
    window: { x, y, width, height },
    sprite: { animationState: "idle" },
    overlay,
  };
}

function showAllAdoptedPets() {
  fireEvent.click(screen.getByRole("button", { name: "Show all" }));
}

const tauriWindowMocks = vi.hoisted(() => ({
  availableMonitors: vi.fn(),
  cursorPosition: vi.fn(),
  currentMonitor: vi.fn(),
  outerPosition: vi.fn(),
  outerSize: vi.fn(),
  setPosition: vi.fn(),
  setSize: vi.fn(),
  show: vi.fn(),
  startDragging: vi.fn(),
  setIgnoreCursorEvents: vi.fn(),
}));
const tauriEventMocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
  listeners: new Map<string, TauriEventHandler>(),
}));
const dialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: tauriEventMocks.emitTo,
  listen: tauriEventMocks.listen,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogMocks.open,
}));

vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: tauriWindowMocks.availableMonitors,
  cursorPosition: tauriWindowMocks.cursorPosition,
  currentMonitor: tauriWindowMocks.currentMonitor,
  getCurrentWindow: vi.fn(() => ({
    label: "pet-window-playground-1",
    outerPosition: tauriWindowMocks.outerPosition,
    outerSize: tauriWindowMocks.outerSize,
    setPosition: tauriWindowMocks.setPosition,
    setSize: tauriWindowMocks.setSize,
    show: tauriWindowMocks.show,
    startDragging: tauriWindowMocks.startDragging,
    setIgnoreCursorEvents: tauriWindowMocks.setIgnoreCursorEvents,
  })),
  LogicalPosition: class LogicalPosition {
    x: number;
    y: number;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  LogicalSize: class LogicalSize {
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
  PhysicalPosition: class PhysicalPosition {
    x: number;
    y: number;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

const invokeMock = vi.mocked(invoke);
const isTauriMock = vi.mocked(isTauri);
const GIT_BASH_PATH = "C:\\Program Files\\Git\\bin\\bash.exe";
const testPetsDrivenState: PetsDrivenState = {
  schemaVersion: 1,
  registeredWorkingDirectories: [
    {
      id: "wd-cms",
      path: "D:\\cms",
      petId: "pet-a",
      agentSourceId: "agent-a",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "wd-pets-driven",
      path: "D:\\workmanager\\pets-driven",
      petId: "pet-a",
      agentSourceId: "agent-a",
      createdAt: 2,
      updatedAt: 2,
    },
  ],
  pets: [
    {
      id: "pet-a",
      workingDirectoryId: "wd-cms",
      assetId: "bloop",
      profileId: "profile-pet-a",
      name: "Otto",
      adoptedAt: 1,
      archived: false,
      visible: true,
    },
  ],
  petProfiles: [
    {
      id: "profile-pet-a",
      petAssetId: "bloop",
      personalityId: "playful",
      personality: createPlayfulPersonality(),
    },
  ],
  sessionCommand: "claude",
  terminalShell: null,
  petSourceDirectory: null,
};

describe("pet window product route", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    isTauriMock.mockReturnValue(true);
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
      }
      if (command === "get_claude_hook_ingress_status") {
        return {
          url: "http://127.0.0.1:43187/claude-hook",
          state: "listening",
          error: null,
        };
      }
      if (command === "read_pets_driven_state") {
        return testPetsDrivenState;
      }
      if (command === "list_terminal_shells") {
        return [
          { label: "Command Prompt", path: "C:\\Windows\\System32\\cmd.exe" },
          { label: "Git Bash", path: GIT_BASH_PATH },
        ];
      }

      return undefined;
    });
    tauriWindowMocks.currentMonitor.mockResolvedValue({
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
      },
      scaleFactor: 1,
    });
    tauriWindowMocks.availableMonitors.mockResolvedValue([
      {
        name: "primary",
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 1920, height: 1080 },
        },
        scaleFactor: 1,
      },
    ]);
    tauriWindowMocks.cursorPosition.mockResolvedValue({ x: 392, y: 424 });
    tauriWindowMocks.outerPosition.mockResolvedValue({ x: 120, y: 120 });
    tauriWindowMocks.outerSize.mockResolvedValue({ width: 600, height: 400 });
    tauriWindowMocks.setPosition.mockResolvedValue(undefined);
    tauriWindowMocks.setSize.mockResolvedValue(undefined);
    tauriWindowMocks.show.mockResolvedValue(undefined);
    tauriWindowMocks.startDragging.mockReset();
    tauriWindowMocks.setIgnoreCursorEvents.mockReset();
    tauriEventMocks.emitTo.mockReset();
    tauriEventMocks.emitTo.mockResolvedValue(undefined);
    tauriEventMocks.listeners.clear();
    tauriEventMocks.listen.mockImplementation((eventName, handler) => {
      tauriEventMocks.listeners.set(eventName, handler as TauriEventHandler);
      return Promise.resolve(() => tauriEventMocks.listeners.delete(eventName));
    });
    dialogMocks.open.mockReset();
    dialogMocks.open.mockResolvedValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      domRect({
        left: 0,
        top: 0,
        width: PET_WINDOW_LAYOUT.width,
        height: PET_WINDOW_LAYOUT.height,
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    invokeMock.mockReset();
    isTauriMock.mockReset();
  });

  it("renders a Pet Window surface from route parameters instead of the management surface", () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    expect(screen.getByLabelText("Pet Window pet-a")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pets Driven" })).not.toBeInTheDocument();
    expect(tauriEventMocks.listen).not.toHaveBeenCalledWith(
      PET_WINDOW_INPUT_EVENT,
      expect.any(Function),
    );
  });

  it("waits for the Pet Window spritesheet before rendering the shared HTML sprite", async () => {
    isTauriMock.mockReturnValue(false);
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    expect(screen.queryByLabelText("Pet Sprite pet-a")).not.toBeInTheDocument();

    const sprite = await screen.findByLabelText("Pet Sprite pet-a");

    expect(sprite).toHaveStyle({
      backgroundImage: "url(/codex-pets/bloop/spritesheet.webp)",
    });
    expect(document.querySelector("canvas.pet-window-canvas")).not.toBeInTheDocument();
  });

  it("builds adopted Pet Window frames from all desktop monitor work areas", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
      }
      if (command === "get_claude_hook_ingress_status") {
        return {
          url: "http://127.0.0.1:43187/claude-hook",
          state: "listening",
          error: null,
        };
      }
      if (command === "read_pets_driven_state") {
        return {
          ...testPetsDrivenState,
          registeredWorkingDirectories: [
            ...testPetsDrivenState.registeredWorkingDirectories,
            {
              id: "wd-second",
              path: "D:\\second",
              petId: "pet-b",
              agentSourceId: "agent-b",
              createdAt: 3,
              updatedAt: 3,
            },
          ],
          pets: [
            ...testPetsDrivenState.pets,
            {
              id: "pet-b",
              workingDirectoryId: "wd-second",
              assetId: "bloop",
              profileId: "profile-pet-b",
              name: "Mochi",
              adoptedAt: 2,
              archived: false,
              visible: true,
            },
          ],
          petProfiles: [
            ...testPetsDrivenState.petProfiles,
            {
              id: "profile-pet-b",
              petAssetId: "bloop",
              personalityId: "playful",
              personality: createPlayfulPersonality(),
            },
          ],
        } satisfies PetsDrivenState;
      }

      return undefined;
    });
    tauriWindowMocks.availableMonitors.mockResolvedValue([
      {
        name: "left",
        workArea: {
          position: { x: -640, y: 0 },
          size: { width: 640, height: 480 },
        },
        scaleFactor: 1,
      },
      {
        name: "primary",
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 960, height: 540 },
        },
        scaleFactor: 1,
      },
    ]);

    render(<PetsDrivenApp />);

    await screen.findByRole("button", { name: "Open Otto's details" });
    showAllAdoptedPets();

    await waitFor(() => {
      expect(tauriWindowMocks.availableMonitors).toHaveBeenCalled();
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-pet-a",
        PET_WINDOW_FRAME_EVENT,
        expect.objectContaining({
          window: expect.objectContaining({
            x: expect.any(Number),
          }),
        }),
      );
    });

    const petFrameFor = (petId: string) =>
      tauriEventMocks.emitTo.mock.calls.find(
        ([label, eventName, payload]) =>
          label === `pet-window-${petId}` &&
          eventName === PET_WINDOW_FRAME_EVENT &&
          (payload as { petId?: string }).petId === petId,
      )?.[2] as { window: { x: number; width: number } } | undefined;
    const petAFrame = petFrameFor("pet-a");
    const petBFrame = petFrameFor("pet-b");

    // The fixed 192-wide OS window is centred on the pet, so its left edge sits
    // osWindowWidth/2 (96) − frameWidth/2 (48) = 48px further left than the old
    // frame-sized projection placed it.
    expect(petAFrame?.window.x).toBeGreaterThan(310);
    expect(petAFrame?.window.x).toBeLessThan(342);
    expect(petBFrame?.window.x).toBeGreaterThan(310);
    expect(petBFrame?.window.x).toBeLessThan(342);
  });

  it("opens the pet context menu popup when body.contextmenu input arrives at the host", async () => {
    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 1,
          petId: "pet-a",
          windowLabel: "pet-window-pet-a",
          pointerId: 0,
          kind: "body.contextmenu",
          localPoint: { x: 96, y: 112 },
          screenPoint: { x: 400, y: 300 },
          button: 2,
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_pet_context_menu", {
        petId: "pet-a",
        url: "pet-window.html?surface=pet-context-menu&petId=pet-a&petName=Otto&note=",
        localX: 400,
        localY: 300,
      });
    });
  });

  it("saves the pet memo when menu.note-save arrives from the context menu popup", async () => {
    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 1,
          petId: "pet-a",
          windowLabel: "pet-context-menu-pet-a",
          pointerId: 0,
          kind: "menu.note-save",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          memo: "Great work today!",
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      // The memo goes over as a patch, not as the whole state document: a
      // document write would carry this window's stale copy of the roster and
      // erase anything the backend hatched since it was loaded.
      expect(invokeMock).toHaveBeenCalledWith("update_pet_record", {
        input: { petId: "pet-a", memo: "Great work today!" },
      });
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "write_pets_driven_state"),
      ).toHaveLength(0);
    });
  });

  it("does not persist the state blob when pets are shown", async () => {
    render(<PetsDrivenApp />);

    await screen.findByRole("button", { name: "Open Otto's details" });
    showAllAdoptedPets();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_adopted_pet_window", {
        petId: "pet-a",
        assetId: "bloop",
      });
    });

    // `visible` never survives a round trip — the gateway strips it on write and
    // a load defaults it to false — so a toggle has nothing to save. Writing the
    // blob anyway would overwrite whatever the backend hatched in the meantime.
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "write_pets_driven_state"),
    ).toHaveLength(0);
  });

  it("handles duplicate folder-pick input only once", async () => {
    dialogMocks.open.mockResolvedValue("D:\\new-project");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    const inputEvent = {
      payload: {
        sequence: 1,
        petId: "pet-a",
        windowLabel: "pet-context-menu-pet-a",
        pointerId: 0,
        kind: "menu.pick-folder",
        localPoint: { x: 0, y: 0 },
        screenPoint: { x: 0, y: 0 },
        at: Date.now(),
      },
    };

    act(() => {
      const handler = tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT);
      handler?.(inputEvent);
      handler?.(inputEvent);
    });

    await waitFor(() => {
      expect(dialogMocks.open).toHaveBeenCalledExactlyOnceWith({
        directory: true,
        multiple: false,
      });
      expect(invokeMock).toHaveBeenCalledWith("update_pet_record", {
        input: { petId: "pet-a", cwd: "D:\\new-project" },
      });
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "update_pet_record"),
      ).toHaveLength(1);
    });
  });

  it("starts a new terminal channel from body focus when no window is bound", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
      }
      if (command === "get_claude_hook_ingress_status") {
        return {
          url: "http://127.0.0.1:43187/claude-hook",
          state: "listening",
          error: null,
        };
      }
      if (command === "read_pets_driven_state") {
        return testPetsDrivenState;
      }
      if (command === "start_session") {
        return { hwnd: 123, title: "Windows Terminal" };
      }

      return undefined;
    });

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 1,
          petId: "pet-a",
          windowLabel: "pet-window-pet-a",
          pointerId: 0,
          kind: "body.focus",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("start_session", {
        cwd: "D:\\cms",
        command: "claude",
      });
    });
    expect(invokeMock).not.toHaveBeenCalledWith("focus_window", expect.anything());
  });

  it("focuses the bound terminal channel from body focus", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
      }
      if (command === "get_claude_hook_ingress_status") {
        return {
          url: "http://127.0.0.1:43187/claude-hook",
          state: "listening",
          error: null,
        };
      }
      if (command === "read_pets_driven_state") {
        return testPetsDrivenState;
      }
      if (command === "start_session") {
        return { hwnd: 456, title: "Windows Terminal" };
      }
      if (command === "focus_window") {
        return true;
      }

      return undefined;
    });

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 1,
          petId: "pet-a",
          windowLabel: "pet-window-pet-a",
          pointerId: 0,
          kind: "menu.start-session",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("start_session", {
        cwd: "D:\\cms",
        command: "claude",
      });
    });

    invokeMock.mockClear();

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 2,
          petId: "pet-a",
          windowLabel: "pet-window-pet-a",
          pointerId: 0,
          kind: "body.focus",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("focus_window", { hwnd: 456 });
    });
    expect(invokeMock).not.toHaveBeenCalledWith("start_session", expect.anything());
  });

  it("publishes a loading binding state while starting a terminal channel", async () => {
    let resolveStartSession: ((window: { hwnd: number; title: string }) => void) | undefined;

    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
      }
      if (command === "get_claude_hook_ingress_status") {
        return {
          url: "http://127.0.0.1:43187/claude-hook",
          state: "listening",
          error: null,
        };
      }
      if (command === "read_pets_driven_state") {
        return testPetsDrivenState;
      }
      if (command === "start_session") {
        return new Promise((resolve) => {
          resolveStartSession = resolve;
        });
      }

      return undefined;
    });

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 1,
          petId: "pet-a",
          windowLabel: "pet-window-pet-a",
          pointerId: 0,
          kind: "menu.start-session",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-pet-a",
        PET_WINDOW_BINDING_EVENT,
        {
          petId: "pet-a",
          title: null,
          isLoading: true,
        },
      );
    });

    act(() => {
      resolveStartSession?.({ hwnd: 123, title: "Windows Terminal" });
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-pet-a",
        PET_WINDOW_BINDING_EVENT,
        {
          petId: "pet-a",
          title: "Windows Terminal",
          isLoading: false,
        },
      );
    });
  });

  it("binds the window picked in connect mode when menu.find-terminal arrives", async () => {
    let resolveConnectWindow:
      | ((window: { hwnd: number; title: string } | null) => void)
      | undefined;

    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
      }
      if (command === "get_claude_hook_ingress_status") {
        return {
          url: "http://127.0.0.1:43187/claude-hook",
          state: "listening",
          error: null,
        };
      }
      if (command === "read_pets_driven_state") {
        return testPetsDrivenState;
      }
      if (command === "connect_window") {
        return new Promise((resolve) => {
          resolveConnectWindow = resolve;
        });
      }
      if (command === "focus_window") {
        return true;
      }

      return undefined;
    });

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 1,
          petId: "pet-a",
          windowLabel: "pet-context-menu-pet-a",
          pointerId: 0,
          kind: "menu.find-terminal",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-pet-a",
        PET_WINDOW_BINDING_EVENT,
        {
          petId: "pet-a",
          title: null,
          isLoading: true,
          isConnecting: true,
        },
      );
    });

    act(() => {
      resolveConnectWindow?.({ hwnd: 777, title: "Windows Terminal" });
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-pet-a",
        PET_WINDOW_BINDING_EVENT,
        {
          petId: "pet-a",
          title: "Windows Terminal",
          isLoading: false,
        },
      );
    });
    expect(invokeMock).not.toHaveBeenCalledWith("start_session", expect.anything());

    invokeMock.mockClear();

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 2,
          petId: "pet-a",
          windowLabel: "pet-window-pet-a",
          pointerId: 0,
          kind: "body.focus",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("focus_window", { hwnd: 777 });
    });
    expect(invokeMock).not.toHaveBeenCalledWith("start_session", expect.anything());
  });

  it("keeps the binding when connect mode is cancelled", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
      }
      if (command === "get_claude_hook_ingress_status") {
        return {
          url: "http://127.0.0.1:43187/claude-hook",
          state: "listening",
          error: null,
        };
      }
      if (command === "read_pets_driven_state") {
        return testPetsDrivenState;
      }
      if (command === "start_session") {
        return { hwnd: 456, title: "Windows Terminal" };
      }
      if (command === "connect_window") {
        return null;
      }

      return undefined;
    });

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_INPUT_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 1,
          petId: "pet-a",
          windowLabel: "pet-window-pet-a",
          pointerId: 0,
          kind: "menu.start-session",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-pet-a",
        PET_WINDOW_BINDING_EVENT,
        {
          petId: "pet-a",
          title: "Windows Terminal",
          isLoading: false,
        },
      );
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_INPUT_EVENT)?.({
        payload: {
          sequence: 2,
          petId: "pet-a",
          windowLabel: "pet-context-menu-pet-a",
          pointerId: 0,
          kind: "menu.find-terminal",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        },
      });
    });

    // Cancelled pick: the pet reports its existing binding, not a cleared one.
    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-pet-a",
        PET_WINDOW_BINDING_EVENT,
        {
          petId: "pet-a",
          title: "Windows Terminal",
          isLoading: true,
          isConnecting: true,
        },
      );
    });
    await waitFor(() => {
      const bindingCalls = tauriEventMocks.emitTo.mock.calls.filter(
        ([, eventName]) => eventName === PET_WINDOW_BINDING_EVENT,
      );
      expect(bindingCalls.at(-1)?.[2]).toEqual({
        petId: "pet-a",
        title: "Windows Terminal",
        isLoading: false,
      });
    });
  });

  it("toggles native cursor events from Pet Window hit regions", () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);
    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      canvas,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 8,
        clientY: 8,
      }),
    );
    fireEvent(
      canvas,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 96,
        clientY: 112,
      }),
    );

    expect(tauriWindowMocks.setIgnoreCursorEvents).toHaveBeenCalledWith(true);
    expect(tauriWindowMocks.setIgnoreCursorEvents).toHaveBeenCalledWith(false);
  });

  it("restores cursor events after a temporary transparent passthrough", () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);
    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      canvas,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 8,
        clientY: 8,
      }),
    );

    expect(tauriWindowMocks.setIgnoreCursorEvents).toHaveBeenCalledWith(true);

    vi.advanceTimersByTime(220);

    expect(tauriWindowMocks.setIgnoreCursorEvents).toHaveBeenCalledWith(false);
  });

  it("starts native Pet Window dragging only from the body", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);
    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      canvas,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 96,
        clientY: 112,
        screenX: 196,
        screenY: 212,
      }),
    );

    expect(tauriWindowMocks.startDragging).toHaveBeenCalled();
    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        PET_WINDOW_HOST_LABEL,
        PET_WINDOW_INPUT_EVENT,
        expect.objectContaining({
          kind: "body.pointer.down",
          petId: "pet-a",
          windowLabel: "pet-window-playground-1",
          localPoint: { x: 96, y: 112 },
          screenPoint: { x: 196, y: 212 },
        }),
      );
    });
  });

  it("applies fresh Pet Window frames and drops stale ones", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    const handleFrame = tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)!;

    act(() => {
      handleFrame({
        payload: {
          ...petWindowFramePayload({ sequence: 2, petId: "pet-a", x: 333.4, y: 444.2 }),
          name: "Otto",
        },
      });
    });

    expect(await screen.findByText("Otto")).toBeInTheDocument();

    // A frame from behind the sequence high-water mark is discarded, so the
    // name it carries never reaches the window.
    act(() => {
      handleFrame({
        payload: {
          ...petWindowFramePayload({ sequence: 1, petId: "pet-a", x: 111, y: 222 }),
          name: "Stale",
        },
      });
    });

    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    expect(screen.getByText("Otto")).toBeInTheDocument();
  });

  it("shows connect-mode notices on the Pet Window status card", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_BINDING_EVENT)).toBe(true);
    });

    // The status card only renders once a frame has delivered the pet's name.
    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: {
          ...petWindowFramePayload({
            sequence: 1,
            petId: "pet-a",
            x: 10,
            y: 20,
          }),
          name: "Otto",
        },
      });
    });

    const handleBinding = tauriEventMocks.listeners.get(PET_WINDOW_BINDING_EVENT)!;

    act(() => {
      handleBinding({
        payload: {
          petId: "pet-a",
          title: null,
          isLoading: true,
          isConnecting: true,
        },
      });
    });

    expect(await screen.findByText("Click the terminal window to connect")).toBeInTheDocument();

    act(() => {
      handleBinding({
        payload: {
          petId: "pet-a",
          title: "Windows Terminal",
          isLoading: false,
        },
      });
    });

    expect(await screen.findByText("Connected to Windows Terminal")).toBeInTheDocument();

    // A cancelled pick reports the unchanged binding back: no "connected".
    act(() => {
      handleBinding({
        payload: {
          petId: "pet-a",
          title: "Windows Terminal",
          isLoading: true,
          isConnecting: true,
        },
      });
    });
    act(() => {
      handleBinding({
        payload: {
          petId: "pet-a",
          title: "Windows Terminal",
          isLoading: false,
        },
      });
    });

    expect(await screen.findByText("Nothing connected")).toBeInTheDocument();
  });

  it("clears the connect notice even when a later binding update arrives", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_BINDING_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: {
          ...petWindowFramePayload({ sequence: 1, petId: "pet-a", x: 10, y: 20 }),
          name: "Otto",
        },
      });
    });

    const handleBinding = tauriEventMocks.listeners.get(PET_WINDOW_BINDING_EVENT)!;

    act(() => {
      handleBinding({
        payload: { petId: "pet-a", title: null, isLoading: true, isConnecting: true },
      });
    });
    act(() => {
      handleBinding({
        payload: { petId: "pet-a", title: "Windows Terminal", isLoading: false },
      });
    });

    expect(await screen.findByText("Connected to Windows Terminal")).toBeInTheDocument();

    // A stray non-connecting binding event arrives within the 2.6s window
    // (e.g. the user double-clicks the pet to start/focus a session, which
    // emits a loading binding state).
    act(() => {
      handleBinding({
        payload: { petId: "pet-a", title: "Windows Terminal", isLoading: true },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 2800));

    expect(screen.queryByText("Connected to Windows Terminal")).not.toBeInTheDocument();
  });

  it("never places its own OS window — the host owns every pet's position", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)!({
        payload: petWindowFramePayload({ sequence: 1, petId: "pet-a", x: 333.2, y: 444.2 }),
      });
    });

    // Twelve pets each round-tripping their own position through IPC every
    // frame is what made a full roster stutter; place_pet_windows moves them
    // all natively in one batch instead.
    expect(tauriWindowMocks.setPosition).not.toHaveBeenCalled();
    expect(tauriWindowMocks.show).not.toHaveBeenCalled();
  });

  it("ignores frames for other pets before checking freshness", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-b&assetId=otto");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    const handleFrame = tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)!;

    act(() => {
      // Same sequence as pet-b's frame below: counting this one would push the
      // high-water mark up and make pet-b's own frame look stale.
      handleFrame({
        payload: {
          ...petWindowFramePayload({ sequence: 4, petId: "pet-a", x: 100, y: 200 }),
          name: "Not mine",
        },
      });
      handleFrame({
        payload: {
          ...petWindowFramePayload({ sequence: 4, petId: "pet-b", x: 500, y: 600 }),
          name: "Otto",
        },
      });
    });

    expect(await screen.findByText("Otto")).toBeInTheDocument();
    expect(screen.queryByText("Not mine")).not.toBeInTheDocument();
  });

  it("places every deployed pet's window in one batched host call", async () => {
    render(<PetsDrivenApp />);

    await screen.findByRole("button", { name: "Open Otto's details" });
    showAllAdoptedPets();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "place_pet_windows",
        expect.objectContaining({
          placements: expect.arrayContaining([
            expect.objectContaining({
              petId: "pet-a",
              x: expect.any(Number),
              y: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    const placementOf = (call: unknown[]) =>
      (call[1] as { placements: { petId: string; x: number; y: number }[] }).placements.find(
        (placement) => placement.petId === "pet-a",
      );
    const placementCalls = invokeMock.mock.calls.filter(([command]) => {
      return command === "place_pet_windows";
    });

    // Rounded coordinates: a pet that has not visibly moved must stay out of
    // the batch entirely, so no two consecutive calls repeat a placement.
    for (let index = 1; index < placementCalls.length; index += 1) {
      const previous = placementOf(placementCalls[index - 1]);
      const current = placementOf(placementCalls[index]);
      if (previous && current) {
        expect(`${current.x},${current.y}`).not.toBe(`${previous.x},${previous.y}`);
      }
      expect(current === undefined || Number.isInteger(current.x)).toBe(true);
    }
  });

  it("places a pet again when its overlay window was not ready for the batch", async () => {
    const placementCommands: { placements: { petId: string }[] }[] = [];
    const baseInvoke = invokeMock.getMockImplementation()!;
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "place_pet_windows") {
        placementCommands.push(args as { placements: { petId: string }[] });
        // The shell reports the window as still being created, so the host must
        // not treat this placement as applied.
        return ["pet-a"];
      }

      return baseInvoke(command, args);
    });

    render(<PetsDrivenApp />);

    await screen.findByRole("button", { name: "Open Otto's details" });
    showAllAdoptedPets();

    await waitFor(() => {
      expect(
        placementCommands.filter((command) =>
          command.placements.some((placement) => placement.petId === "pet-a"),
        ).length,
      ).toBeGreaterThan(1);
    });
  });

  it("forwards host-driven body drag input instead of starting native window dragging", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 333,
          y: 444,
        }),
      });
    });

    tauriWindowMocks.startDragging.mockReset();
    tauriEventMocks.emitTo.mockReset();

    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      canvas,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 96,
        clientY: 112,
        screenX: 196,
        screenY: 212,
      }),
    );
    fireEvent(
      canvas,
      new MouseEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 106,
        clientY: 122,
        screenX: 206,
        screenY: 222,
      }),
    );
    fireEvent(
      canvas,
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 116,
        clientY: 132,
        screenX: 216,
        screenY: 232,
      }),
    );

    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        PET_WINDOW_HOST_LABEL,
        PET_WINDOW_INPUT_EVENT,
        expect.objectContaining({ kind: "body.pointer.down" }),
      );
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        PET_WINDOW_HOST_LABEL,
        PET_WINDOW_INPUT_EVENT,
        expect.objectContaining({ kind: "body.pointer.move" }),
      );
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        PET_WINDOW_HOST_LABEL,
        PET_WINDOW_INPUT_EVENT,
        expect.objectContaining({ kind: "body.pointer.up" }),
      );
    });
  });

  it("keeps cursor events active when a host-driven body drag leaves the moving window", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 333,
          y: 444,
        }),
      });
    });

    tauriWindowMocks.setIgnoreCursorEvents.mockReset();

    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      canvas,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 96,
        clientY: 112,
        screenX: 196,
        screenY: 212,
      }),
    );
    fireEvent.pointerLeave(canvas, {
      button: 0,
      clientX: 106,
      clientY: 122,
      screenX: 206,
      screenY: 222,
    });

    expect(tauriWindowMocks.setIgnoreCursorEvents).toHaveBeenCalledWith(false);
    expect(tauriWindowMocks.setIgnoreCursorEvents).not.toHaveBeenCalledWith(true);
  });

  it("renders the resize affordance as a small design-system icon button", () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    const resizeButton = screen.getByRole("button", { name: "Resize pet" });

    expect(resizeButton).toHaveClass(
      "pd-iconbtn",
      "pd-iconbtn--soft",
      "pd-iconbtn--sm",
      "pet-window-resize-button",
    );
    expect(resizeButton.parentElement).toHaveClass("pet-window-visual-frame");
    expect(resizeButton).not.toBeDisabled();
  });

  it("uses the visual pet frame for resize hit testing when the native surface is still large", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function getRect(
      this: HTMLElement,
    ) {
      if (this.classList.contains("pet-window-visual-frame")) {
        return domRect({ left: 200, top: 100, width: 96, height: 134 });
      }

      return domRect({ left: 0, top: 0, width: 400, height: 400 });
    });

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 333,
          y: 444,
          width: 96,
          height: 134,
        }),
      });
    });

    tauriWindowMocks.setSize.mockClear();
    tauriWindowMocks.startDragging.mockClear();

    const surface = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      surface,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 290,
        clientY: 224,
        screenX: 290,
        screenY: 224,
      }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 330,
        clientY: 264,
        screenX: 330,
        screenY: 264,
      }),
    );

    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
    expect(tauriWindowMocks.setSize).toHaveBeenCalledWith({
      width: 172.8,
      height: 241.20000000000002,
    });
  });

  it("starts resizing from the visible resize button after the Pet Window is shrunk", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function getRect(
      this: HTMLElement,
    ) {
      if (this.classList.contains("pet-window-visual-frame")) {
        return domRect({ left: 200, top: 100, width: 96, height: 134 });
      }

      return domRect({ left: 0, top: 0, width: 96, height: 134 });
    });

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 333,
          y: 444,
          width: 96,
          height: 134,
        }),
      });
    });

    tauriWindowMocks.setSize.mockClear();
    tauriWindowMocks.startDragging.mockClear();
    tauriEventMocks.emitTo.mockClear();

    const surface = screen.getByLabelText("Pet Window pet-a");
    const resizeButton = screen.getByRole("button", { name: "Resize pet" });

    fireEvent(
      resizeButton,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 276,
        clientY: 244,
        screenX: 276,
        screenY: 244,
      }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 316,
        clientY: 284,
        screenX: 316,
        screenY: 284,
      }),
    );

    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
    expect(tauriWindowMocks.setSize).toHaveBeenCalledWith({
      width: 172.8,
      height: 241.20000000000002,
    });
    expect(tauriEventMocks.emitTo).not.toHaveBeenCalledWith(
      PET_WINDOW_HOST_LABEL,
      PET_WINDOW_INPUT_EVENT,
      expect.objectContaining({ kind: "body.pointer.down" }),
    );
  });

  it("does not resize when the current pet width is already at least 200px", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 333,
          y: 444,
          width: 220,
          height: 307.0833333333333,
        }),
      });
    });

    tauriWindowMocks.setSize.mockClear();
    tauriEventMocks.emitTo.mockClear();

    const surface = screen.getByLabelText("Pet Window pet-a");
    const resizeButton = screen.getByRole("button", { name: "Resize pet" });

    fireEvent(
      resizeButton,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 184,
        clientY: 252,
        screenX: 384,
        screenY: 452,
      }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 784,
        clientY: 852,
        screenX: 984,
        screenY: 1052,
      }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 784,
        clientY: 852,
        screenX: 984,
        screenY: 1052,
      }),
    );

    expect(tauriWindowMocks.setSize).not.toHaveBeenCalled();
    expect(tauriEventMocks.emitTo).not.toHaveBeenCalledWith(
      PET_WINDOW_HOST_LABEL,
      PET_WINDOW_RESIZE_EVENT,
      expect.anything(),
    );
  });

  it("ignores resize moves that would push the pet width to 200px or larger", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    tauriWindowMocks.setSize.mockClear();
    tauriEventMocks.emitTo.mockClear();

    const surface = screen.getByLabelText("Pet Window pet-a");
    const resizeButton = screen.getByRole("button", { name: "Resize pet" });

    fireEvent(
      resizeButton,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 184,
        clientY: 252,
        screenX: 384,
        screenY: 452,
      }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 234,
        clientY: 302,
        screenX: 434,
        screenY: 502,
      }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 234,
        clientY: 302,
        screenX: 434,
        screenY: 502,
      }),
    );

    expect(tauriWindowMocks.setSize).not.toHaveBeenCalled();
    expect(tauriEventMocks.emitTo).not.toHaveBeenCalledWith(
      PET_WINDOW_HOST_LABEL,
      PET_WINDOW_RESIZE_EVENT,
      expect.anything(),
    );
  });
  it("ignores host frame geometry while a Pet Window resize drag is active", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    const handleFrame = tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)!;

    act(() => {
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 333,
          y: 444,
        }),
      });
    });

    tauriWindowMocks.setPosition.mockClear();
    tauriWindowMocks.setSize.mockClear();
    tauriEventMocks.emitTo.mockClear();

    const surface = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      surface,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 184,
        clientY: 252,
        screenX: 384,
        screenY: 452,
      }),
    );

    act(() => {
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 2,
          petId: "pet-a",
          x: 500,
          y: 600,
        }),
      });
    });

    expect(tauriWindowMocks.setPosition).not.toHaveBeenCalled();
    expect(tauriWindowMocks.setSize).not.toHaveBeenCalled();

    fireEvent(
      surface,
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 184,
        clientY: 252,
        screenX: 384,
        screenY: 452,
      }),
    );

    expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
      PET_WINDOW_HOST_LABEL,
      PET_WINDOW_RESIZE_EVENT,
      { petId: "pet-a", scale: 1 },
    );
  });

  it("routes overlay clicks without starting Pet Window dragging", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);
    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      canvas,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 96,
        clientY: 20,
      }),
    );
    fireEvent(
      canvas,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 116,
        clientY: 122,
      }),
    );
    fireEvent(
      canvas,
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 96,
        clientY: 20,
      }),
    );

    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
    expect(await screen.findByText("Overlay action")).toBeInTheDocument();
    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        PET_WINDOW_HOST_LABEL,
        PET_WINDOW_INPUT_EVENT,
        expect.objectContaining({
          kind: "overlay.click",
          petId: "pet-a",
          windowLabel: "pet-window-playground-1",
          localPoint: { x: 96, y: 20 },
        }),
      );
    });
  });

  it("routes body right-clicks to the Pet Context Menu input", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);
    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent.contextMenu(canvas, {
      bubbles: true,
      button: 2,
      clientX: 96,
      clientY: 112,
      screenX: 196,
      screenY: 212,
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        PET_WINDOW_HOST_LABEL,
        PET_WINDOW_INPUT_EVENT,
        expect.objectContaining({
          kind: "body.contextmenu",
          petId: "pet-a",
          windowLabel: "pet-window-playground-1",
          localPoint: { x: 96, y: 112 },
          button: 2,
        }),
      );
    });
    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
  });

  it("routes overlay right-clicks to the Pet Overlay Menu input", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);
    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent.contextMenu(canvas, {
      bubbles: true,
      button: 2,
      clientX: 96,
      clientY: 20,
      screenX: 196,
      screenY: 212,
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        PET_WINDOW_HOST_LABEL,
        PET_WINDOW_INPUT_EVENT,
        expect.objectContaining({
          kind: "overlay.contextmenu",
          petId: "pet-a",
          windowLabel: "pet-window-playground-1",
          localPoint: { x: 96, y: 20 },
          button: 2,
        }),
      );
    });
    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
  });

  it("treats the overlay region as transparent when presentation has no overlay", async () => {
    window.history.replaceState({}, "", "/?surface=pet-window&petId=pet-a&assetId=bloop");

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    act(() => {
      tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)?.({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 333,
          y: 444,
          overlay: null,
        }),
      });
    });

    const canvas = screen.getByLabelText("Pet Window pet-a");

    fireEvent(
      canvas,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 96,
        clientY: 20,
      }),
    );

    expect(tauriEventMocks.emitTo).not.toHaveBeenCalledWith(
      PET_WINDOW_HOST_LABEL,
      PET_WINDOW_INPUT_EVENT,
      expect.objectContaining({ kind: "overlay.click" }),
    );
    expect(tauriWindowMocks.setIgnoreCursorEvents).toHaveBeenCalledWith(true);
  });

  it("points the in-app terminal and the double-click launch line at one shell", async () => {
    render(<PetsDrivenApp />);

    fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
    fireEvent.change(await screen.findByLabelText("Terminal"), {
      target: { value: GIT_BASH_PATH },
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("update_pets_driven_settings", {
        input: {
          terminalShell: GIT_BASH_PATH,
          sessionCommand: `"${GIT_BASH_PATH}" -lc "claude; exec bash"`,
        },
      });
    });
  });
});
