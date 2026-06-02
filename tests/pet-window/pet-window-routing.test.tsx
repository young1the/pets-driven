import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetsDrivenApp } from "@/app/pets-driven-app";
import { invoke, isTauri } from "@tauri-apps/api/core";

const tauriWindowMocks = vi.hoisted(() => ({
  currentMonitor: vi.fn(),
  outerPosition: vi.fn(),
  setPosition: vi.fn(),
  startDragging: vi.fn(),
  setIgnoreCursorEvents: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: tauriWindowMocks.currentMonitor,
  getCurrentWindow: vi.fn(() => ({
    outerPosition: tauriWindowMocks.outerPosition,
    setPosition: tauriWindowMocks.setPosition,
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

      return undefined;
    });
    tauriWindowMocks.currentMonitor.mockResolvedValue({
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
      },
    });
    tauriWindowMocks.outerPosition.mockResolvedValue({ x: 120, y: 120 });
    tauriWindowMocks.setPosition.mockResolvedValue(undefined);
    tauriWindowMocks.startDragging.mockReset();
    tauriWindowMocks.setIgnoreCursorEvents.mockReset();
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

  it("shows Pet Window command failures in the management surface", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_codex_pet_packages") {
        return [];
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

  it("starts native Pet Window dragging only from the body", () => {
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
      }),
    );

    expect(tauriWindowMocks.startDragging).toHaveBeenCalled();
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
  });
});
