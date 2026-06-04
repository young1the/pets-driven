import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetsDrivenApp } from "@/app/pets-driven-app";
import { CLAUDE_HOOK_INGRESS_EVENT } from "@/adapters/agent-events/claude-hook-ingress";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
} from "@/pet-window/pet-window-messages";

type TauriEventHandler = (event: { payload: unknown }) => void;

function petWindowFramePayload({
  sequence,
  petId,
  x,
  y,
  overlay = { kind: "status", label: "!" },
}: {
  sequence: number;
  petId: string;
  x: number;
  y: number;
  overlay?: { kind: "attention" | "speech" | "status"; label: string } | null;
}) {
  return {
    schemaVersion: 1,
    sequence,
    petId,
    window: { x, y, width: 192, height: 208 },
    sprite: { intent: { kind: "idle" } },
    overlay,
  };
}

const tauriWindowMocks = vi.hoisted(() => ({
  cursorPosition: vi.fn(),
  currentMonitor: vi.fn(),
  outerPosition: vi.fn(),
  setPosition: vi.fn(),
  show: vi.fn(),
  startDragging: vi.fn(),
  setIgnoreCursorEvents: vi.fn(),
}));
const tauriEventMocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
  listeners: new Map<string, TauriEventHandler>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: tauriEventMocks.emitTo,
  listen: tauriEventMocks.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  cursorPosition: tauriWindowMocks.cursorPosition,
  currentMonitor: tauriWindowMocks.currentMonitor,
  getCurrentWindow: vi.fn(() => ({
    label: "pet-window-playground-1",
    outerPosition: tauriWindowMocks.outerPosition,
    setPosition: tauriWindowMocks.setPosition,
    show: tauriWindowMocks.show,
    startDragging: tauriWindowMocks.startDragging,
    setIgnoreCursorEvents: tauriWindowMocks.setIgnoreCursorEvents,
  })),
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
      if (command === "emit_test_claude_hook_ingress_event") {
        tauriEventMocks.listeners.get(CLAUDE_HOOK_INGRESS_EVENT)?.({
          payload: {
            hook_event_name: "PermissionRequest",
            cwd: "D:\\workmanager\\pets-driven",
            message: "Test Claude hook",
          },
        });
        return undefined;
      }

      return undefined;
    });
    tauriWindowMocks.currentMonitor.mockResolvedValue({
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
      },
    });
    tauriWindowMocks.cursorPosition.mockResolvedValue({ x: 392, y: 424 });
    tauriWindowMocks.outerPosition.mockResolvedValue({ x: 120, y: 120 });
    tauriWindowMocks.setPosition.mockResolvedValue(undefined);
    tauriWindowMocks.show.mockResolvedValue(undefined);
    tauriWindowMocks.startDragging.mockReset();
    tauriWindowMocks.setIgnoreCursorEvents.mockReset();
    tauriEventMocks.emitTo.mockReset();
    tauriEventMocks.listeners.clear();
    tauriEventMocks.listen.mockImplementation((eventName, handler) => {
      tauriEventMocks.listeners.set(eventName, handler as TauriEventHandler);
      return Promise.resolve(() => tauriEventMocks.listeners.delete(eventName));
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
      {
        left: 0,
        top: 0,
        width: 192,
        height: 208,
        right: 192,
        bottom: 208,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    invokeMock.mockReset();
    isTauriMock.mockReset();
  });

  it("renders a Pet Window surface from route parameters instead of the management surface", () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

    render(<PetsDrivenApp />);

    expect(screen.getByLabelText("Pet Window pet-a")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pets Driven" }),
    ).not.toBeInTheDocument();
  });

  it("opens and closes playground Pet Windows from the management surface", () => {
    render(<PetsDrivenApp />);

    fireEvent.click(screen.getByRole("button", { name: "Open pet window" }));
    fireEvent.click(screen.getByRole("button", { name: "Open 3 pet windows" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Open fixture pet windows" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close pet windows" }));

    expect(invokeMock).toHaveBeenCalledWith("open_pet_window_playground", {
      count: 1,
    });
    expect(invokeMock).toHaveBeenCalledWith("open_pet_window_playground", {
      count: 3,
    });
    expect(invokeMock).toHaveBeenCalledWith("open_pet_window_playground", {
      count: 7,
    });
    expect(invokeMock).toHaveBeenCalledWith("close_pet_window_playground");
  });

  it("broadcasts playground fixture snapshots to opened Pet Windows", async () => {
    render(<PetsDrivenApp />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open fixture pet windows" }),
    );

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-playground-1",
        PET_WINDOW_FRAME_EVENT,
        expect.objectContaining({
          schemaVersion: 1,
          sequence: expect.any(Number),
          petId: "pet-a",
          window: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            width: expect.any(Number),
            height: expect.any(Number),
          }),
          sprite: expect.objectContaining({
            intent: expect.any(Object),
          }),
        }),
      );
    });
  });

  it("routes Claude hook ingress events into fixture Pet Window frames", async () => {
    render(<PetsDrivenApp />);

    fireEvent.click(screen.getByRole("button", { name: "Open pet window" }));

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(CLAUDE_HOOK_INGRESS_EVENT)).toBe(true);
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-playground-1",
        PET_WINDOW_FRAME_EVENT,
        expect.objectContaining({ petId: "pet-a" }),
      );
    });

    tauriEventMocks.emitTo.mockClear();

    act(() => {
      tauriEventMocks.listeners.get(CLAUDE_HOOK_INGRESS_EVENT)?.({
        payload: {
          hook_event_name: "PermissionRequest",
          cwd: "D:\\workmanager\\pets-driven",
          message: "Allow Bash?",
        },
      });
    });

    await waitFor(() => {
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-playground-1",
        PET_WINDOW_FRAME_EVENT,
        expect.objectContaining({
          petId: "pet-a",
          overlay: { kind: "attention", label: "WAIT" },
        }),
      );
    });
  });

  it("shows Claude hook ingress status and sends a test event from the UI", async () => {
    render(<PetsDrivenApp />);

    fireEvent.click(screen.getByRole("button", { name: "Open pet window" }));

    await waitFor(() => {
      expect(screen.getByTestId("claude-hook-state")).toHaveTextContent("listening");
      expect(screen.getByTestId("claude-hook-url")).toHaveTextContent(
        "http://127.0.0.1:43187/claude-hook",
      );
    });

    tauriEventMocks.emitTo.mockClear();

    fireEvent.click(
      screen.getByRole("button", { name: "Send Claude hook test event" }),
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("emit_test_claude_hook_ingress_event");
      expect(tauriEventMocks.emitTo).toHaveBeenCalledWith(
        "pet-window-playground-1",
        PET_WINDOW_FRAME_EVENT,
        expect.objectContaining({
          petId: "pet-a",
          overlay: { kind: "attention", label: "WAIT" },
        }),
      );
    });
  });

  it("shows Pet Window command failures in the management surface", async () => {
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

      throw new Error("window creation deadlocked");
    });

    render(<PetsDrivenApp />);

    fireEvent.click(screen.getByRole("button", { name: "Open pet window" }));

    await waitFor(() => {
      expect(screen.getByText("window creation deadlocked")).toBeInTheDocument();
    });
  });

  it("toggles native cursor events from Pet Window hit regions", () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
          screenPoint: { x: 392, y: 424 },
        }),
      );
    });
  });

  it("applies fresh Pet Window frames and drops stale ones", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    const handleFrame = tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)!;

    act(() => {
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 2,
          petId: "pet-a",
          x: 333.4,
          y: 444.2,
        }),
      });
    });

    expect(tauriWindowMocks.setPosition).toHaveBeenLastCalledWith({
      x: 333,
      y: 444,
    });
    await waitFor(() => {
      expect(tauriWindowMocks.show).toHaveBeenCalledTimes(1);
    });

    const appliedCallCount = tauriWindowMocks.setPosition.mock.calls.length;

    act(() => {
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-a",
          x: 111,
          y: 222,
        }),
      });
    });

    expect(tauriWindowMocks.setPosition).toHaveBeenCalledTimes(appliedCallCount);
    expect(tauriWindowMocks.show).toHaveBeenCalledTimes(1);
  });

  it("does not re-apply Pet Window positions when rounded coordinates are unchanged", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
          x: 333.2,
          y: 444.2,
        }),
      });
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 2,
          petId: "pet-a",
          x: 333.4,
          y: 444.3,
        }),
      });
    });

    expect(tauriWindowMocks.setPosition).toHaveBeenCalledTimes(1);
    expect(tauriWindowMocks.setPosition).toHaveBeenLastCalledWith({
      x: 333,
      y: 444,
    });
    await waitFor(() => {
      expect(tauriWindowMocks.show).toHaveBeenCalledTimes(1);
    });
  });

  it("ignores frames for other pets before checking freshness", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-b&assetId=gabumon",
    );

    render(<PetsDrivenApp />);

    await waitFor(() => {
      expect(tauriEventMocks.listeners.has(PET_WINDOW_FRAME_EVENT)).toBe(true);
    });

    const handleFrame = tauriEventMocks.listeners.get(PET_WINDOW_FRAME_EVENT)!;

    act(() => {
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 4,
          petId: "pet-a",
          x: 100,
          y: 200,
        }),
      });
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 4,
          petId: "pet-b",
          x: 500,
          y: 600,
        }),
      });
    });

    expect(tauriWindowMocks.setPosition).toHaveBeenCalledTimes(1);
    expect(tauriWindowMocks.setPosition).toHaveBeenLastCalledWith({
      x: 500,
      y: 600,
    });
    await waitFor(() => {
      expect(tauriWindowMocks.show).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps a Pet Window hidden until its own first position update is applied", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-b&assetId=gabumon",
    );

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
          x: 100,
          y: 200,
        }),
      });
    });

    expect(tauriWindowMocks.setPosition).not.toHaveBeenCalled();
    expect(tauriWindowMocks.show).not.toHaveBeenCalled();

    act(() => {
      handleFrame({
        payload: petWindowFramePayload({
          sequence: 1,
          petId: "pet-b",
          x: 500.7,
          y: 600.1,
        }),
      });
    });

    expect(tauriWindowMocks.setPosition).toHaveBeenCalledWith({
      x: 501,
      y: 600,
    });
    await waitFor(() => {
      expect(tauriWindowMocks.show).toHaveBeenCalledTimes(1);
    });
  });

  it("forwards host-driven body drag input instead of starting native window dragging", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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

  it("routes overlay clicks without starting Pet Window dragging", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
    expect(screen.getByTestId("pet-context-menu")).toBeInTheDocument();
    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
  });

  it("routes overlay right-clicks to the Pet Overlay Menu input", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
    expect(screen.getByTestId("pet-overlay-menu")).toBeInTheDocument();
    expect(tauriWindowMocks.startDragging).not.toHaveBeenCalled();
  });

  it("treats the overlay region as transparent when presentation has no overlay", async () => {
    window.history.replaceState(
      {},
      "",
      "/?surface=pet-window&petId=pet-a&assetId=patamon",
    );

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
});
