import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  getCurrentWindow,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import {
  FALLBACK_CODEX_PET_SPRITESHEET_URL,
  loadCodexPetImage,
} from "@/pets/assets/codex-pet-fixtures";
import { loadAtlasImage } from "@/pets/assets/atlas-loader";
import { PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import { drawPetSpriteCanvas } from "@/pets/rendering/pet-sprite-canvas";
import { resolvePetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";
import type { PetSpriteIntent } from "@/pets/rendering/pet-sprite-intent";
import { classifyPetWindowPoint } from "@/pet-window/pet-window-hit-region";
import {
  isFreshPetWindowMessage,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_POSITION_EVENT,
  PET_WINDOW_PRESENTATION_EVENT,
  type PetWindowInputKind,
  type PetWindowOverlay,
  type PetWindowPositionUpdate,
  type PetWindowPresentationUpdate,
} from "@/pet-window/pet-window-messages";
import type { PetWindowHitLayout } from "@/pet-window/pet-window-types";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";

type PetWindowViewProps = {
  pet: PetWindowRouteParams;
};

type PetWindowPointerStart = "body" | "overlay" | "transparent";
type PetWindowPresentation = {
  intent: PetSpriteIntent;
  overlay: PetWindowOverlay | null;
};

const PET_WINDOW_LAYOUT: PetWindowHitLayout = {
  width: PET_CELL_SIZE.width,
  height: PET_CELL_SIZE.height,
  body: { x: 18, y: 34, width: 156, height: 156 },
  overlay: { x: 54, y: 12, width: 84, height: 28 },
};
const PET_WINDOW_AUTONOMOUS_TICK_MS = 50;
const PET_WINDOW_AUTONOMOUS_SPEED_PX_PER_MS = 0.035;
const PET_WINDOW_AUTONOMOUS_MARGIN = 24;

let restoreCursorEventsTimer: number | null = null;

function canvasPointFromEvent(
  canvas: HTMLCanvasElement,
  event: React.PointerEvent<HTMLCanvasElement>,
) {
  const rect = canvas.getBoundingClientRect();
  const nativeEvent = event.nativeEvent as PointerEvent & {
    offsetX?: number;
    offsetY?: number;
  };

  if (
    Number.isFinite(nativeEvent.offsetX) &&
    Number.isFinite(nativeEvent.offsetY)
  ) {
    return {
      x: nativeEvent.offsetX ?? 0,
      y: nativeEvent.offsetY ?? 0,
    };
  }

  const scaleX = PET_WINDOW_LAYOUT.width / rect.width;
  const scaleY = PET_WINDOW_LAYOUT.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

async function setNativeCursorPassthrough(ignoreCursorEvents: boolean) {
  if (!isTauri()) {
    return;
  }

  if (restoreCursorEventsTimer !== null) {
    window.clearTimeout(restoreCursorEventsTimer);
    restoreCursorEventsTimer = null;
  }

  const currentWindow = getCurrentWindow();

  if (ignoreCursorEvents) {
    restoreCursorEventsTimer = window.setTimeout(() => {
      restoreCursorEventsTimer = null;
      void getCurrentWindow().setIgnoreCursorEvents(false);
    }, 180);
  }

  await currentWindow.setIgnoreCursorEvents(ignoreCursorEvents);
}

async function startNativeWindowDrag() {
  if (!isTauri()) {
    return;
  }

  await getCurrentWindow().startDragging();
}

function movementDirectionForWindow(index: number) {
  return index % 2 === 0 ? -1 : 1;
}

function defaultPresentation(index: number): PetWindowPresentation {
  return {
    intent: {
      kind: "travel",
      direction: movementDirectionForWindow(index) >= 0 ? "right" : "left",
    },
    overlay: { kind: "status", label: "!" },
  };
}

function hitLayoutForPresentation(
  presentation: PetWindowPresentation,
): PetWindowHitLayout {
  return {
    ...PET_WINDOW_LAYOUT,
    overlay: presentation.overlay ? PET_WINDOW_LAYOUT.overlay : null,
  };
}

export function PetWindowView({ pet }: PetWindowViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const autonomousDirectionRef = useRef(
    movementDirectionForWindow(pet.windowIndex),
  );
  const dragPauseUntilRef = useRef(0);
  const inputSequenceRef = useRef(0);
  const positionSequenceRef = useRef(0);
  const presentationSequenceRef = useRef(0);
  const isPositionDrivenRef = useRef(false);
  const pointerStartRef = useRef<PetWindowPointerStart | null>(null);
  const [interactionStatus, setInteractionStatus] = useState<string | null>(
    null,
  );
  const [presentation, setPresentation] = useState<PetWindowPresentation>(() =>
    defaultPresentation(pet.windowIndex),
  );

  useEffect(() => {
    document.documentElement.classList.add("pet-window-document");

    return () => {
      document.documentElement.classList.remove("pet-window-document");
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlistenPosition: (() => void) | undefined;
    let unlistenPresentation: (() => void) | undefined;
    const currentWindow = getCurrentWindow();

    void listen<PetWindowPositionUpdate>(PET_WINDOW_POSITION_EVENT, (event) => {
      const update = event.payload;

      if (
        !isFreshPetWindowMessage(positionSequenceRef.current, update.sequence)
      ) {
        return;
      }

      positionSequenceRef.current = update.sequence;
      isPositionDrivenRef.current = true;
      void currentWindow.setPosition(
        new PhysicalPosition(Math.round(update.x), Math.round(update.y)),
      );
    }).then((unlisten) => {
      unlistenPosition = unlisten;
    });

    void listen<PetWindowPresentationUpdate>(
      PET_WINDOW_PRESENTATION_EVENT,
      (event) => {
        const update = event.payload;

        if (
          !isFreshPetWindowMessage(
            presentationSequenceRef.current,
            update.sequence,
          )
        ) {
          return;
        }

        presentationSequenceRef.current = update.sequence;
        setPresentation({
          intent: update.intent,
          overlay: update.overlay,
        });
      },
    ).then((unlisten) => {
      unlistenPresentation = unlisten;
    });

    return () => {
      unlistenPosition?.();
      unlistenPresentation?.();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    let isActive = true;
    let animationFrame = 0;

    void loadCodexPetImage(pet.assetId, loadAtlasImage)
      .catch(() => loadAtlasImage(FALLBACK_CODEX_PET_SPRITESHEET_URL))
      .then((image) => {
        const draw = (elapsedMs: number) => {
          if (!isActive) {
            return;
          }

          const frame = resolvePetSpriteFrame({
            intent: presentation.intent,
            elapsedMs,
            size: PET_CELL_SIZE,
          });
          context.clearRect(0, 0, PET_CELL_SIZE.width, PET_CELL_SIZE.height);
          drawPetSpriteCanvas(
            context,
            image,
            frame,
            {
              x: PET_CELL_SIZE.width / 2,
              y: PET_CELL_SIZE.height / 2,
            },
          );
          if (presentation.overlay) {
            context.fillStyle = "#ffffff";
            context.fillRect(
              PET_WINDOW_LAYOUT.overlay?.x ?? 0,
              PET_WINDOW_LAYOUT.overlay?.y ?? 0,
              PET_WINDOW_LAYOUT.overlay?.width ?? 0,
              PET_WINDOW_LAYOUT.overlay?.height ?? 0,
            );
            context.strokeStyle = "#2563eb";
            context.strokeRect(
              PET_WINDOW_LAYOUT.overlay?.x ?? 0,
              PET_WINDOW_LAYOUT.overlay?.y ?? 0,
              PET_WINDOW_LAYOUT.overlay?.width ?? 0,
              PET_WINDOW_LAYOUT.overlay?.height ?? 0,
            );
            context.fillStyle = "#172033";
            context.textAlign = "center";
            context.font = "bold 16px Inter, Arial, sans-serif";
            context.fillText(presentation.overlay.label, 96, 32);
          }
          animationFrame = window.requestAnimationFrame(draw);
        };

        animationFrame = window.requestAnimationFrame(draw);
      });

    return () => {
      isActive = false;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [pet.assetId, presentation]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let previousTime = performance.now();
    let isMoving = false;

    const intervalId = window.setInterval(() => {
      if (
        isPositionDrivenRef.current ||
        Date.now() < dragPauseUntilRef.current ||
        isMoving
      ) {
        previousTime = performance.now();
        return;
      }

      isMoving = true;

      void Promise.all([currentWindow.outerPosition(), currentMonitor()])
        .then(([position, monitor]) => {
          if (!monitor) {
            return;
          }

          const now = performance.now();
          const elapsedMs = Math.min(now - previousTime, 100);
          previousTime = now;

          const minX = monitor.workArea.position.x + PET_WINDOW_AUTONOMOUS_MARGIN;
          const maxX =
            monitor.workArea.position.x +
            monitor.workArea.size.width -
            PET_WINDOW_LAYOUT.width -
            PET_WINDOW_AUTONOMOUS_MARGIN;
          let direction = autonomousDirectionRef.current;
          let nextX =
            position.x +
            direction * PET_WINDOW_AUTONOMOUS_SPEED_PX_PER_MS * elapsedMs;

          if (nextX <= minX) {
            nextX = minX;
            direction = 1;
          } else if (nextX >= maxX) {
            nextX = maxX;
            direction = -1;
          }

          autonomousDirectionRef.current = direction;

          return currentWindow.setPosition(
            new PhysicalPosition(Math.round(nextX), position.y),
          );
        })
        .catch(() => {
          previousTime = performance.now();
        })
        .finally(() => {
          isMoving = false;
        });
    }, PET_WINDOW_AUTONOMOUS_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [pet.windowIndex]);

  function emitPetWindowInput(
    kind: PetWindowInputKind,
    event: React.PointerEvent<HTMLCanvasElement>,
  ) {
    if (!isTauri()) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const localPoint = canvasPointFromEvent(canvas, event);
    inputSequenceRef.current += 1;

    void emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_INPUT_EVENT, {
      sequence: inputSequenceRef.current,
      petId: pet.petId,
      windowLabel: getCurrentWindow().label,
      kind,
      localPoint,
      screenPoint: {
        x: event.screenX,
        y: event.screenY,
      },
      button: event.button,
      at: Date.now(),
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      canvasPointFromEvent(canvas, event),
    );

    void setNativeCursorPassthrough(hit.kind === "transparent");
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      canvasPointFromEvent(canvas, event),
    );
    pointerStartRef.current = hit.kind;

    if (hit.kind === "body") {
      setInteractionStatus("Direct manipulation");
      dragPauseUntilRef.current = Date.now() + 1200;
      emitPetWindowInput("body.pointer.down", event);
      void setNativeCursorPassthrough(false);
      void startNativeWindowDrag();
      return;
    }

    if (hit.kind === "overlay") {
      setInteractionStatus("Overlay armed");
      void setNativeCursorPassthrough(false);
      return;
    }

    void setNativeCursorPassthrough(true);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const pointerStart = pointerStartRef.current;

    pointerStartRef.current = null;

    if (!canvas) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      canvasPointFromEvent(canvas, event),
    );

    if (pointerStart === "overlay" && hit.kind === "overlay") {
      setInteractionStatus("Overlay action");
      emitPetWindowInput("overlay.click", event);
      return;
    }

    if (pointerStart === "body") {
      emitPetWindowInput("body.pointer.up", event);
    }

    void setNativeCursorPassthrough(hit.kind === "transparent");
  }

  return (
    <main className="pet-window-surface">
      <canvas
        aria-label={`Pet Window ${pet.petId}`}
        className="pet-window-canvas"
        height={208}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => void setNativeCursorPassthrough(true)}
        ref={canvasRef}
        width={192}
      />
      {interactionStatus ? (
        <span className="pet-window-status" role="status">
          {interactionStatus}
        </span>
      ) : null}
    </main>
  );
}
