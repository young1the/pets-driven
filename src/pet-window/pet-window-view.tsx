import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  cursorPosition,
  getCurrentWindow,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import {
  FALLBACK_CODEX_PET_SPRITESHEET_URL,
} from "@/pets/assets/codex-pet-fixtures";
import { PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import { PetSprite } from "@/pets/rendering/pet-sprite";
import type { PetSpriteIntent } from "@/pets/rendering/pet-sprite-intent";
import { classifyPetWindowPoint } from "@/pet-window/pet-window-hit-region";
import { PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import { loadPetWindowSpritesheetUrl } from "@/pet-window/pet-window-spritesheet";
import {
  isFreshPetWindowMessage,
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  type PetWindowInputKind,
  type PetWindowFrame,
  type PetWindowOverlay,
  isSamePetWindowPresentation,
} from "@/pet-window/pet-window-messages";
import type { PetWindowHitLayout } from "@/pet-window/pet-window-types";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";

type PetWindowViewProps = {
  pet: PetWindowRouteParams;
};

type PetWindowPointerStart = "body" | "overlay" | "transparent";
type PetWindowMenu = {
  kind: "body" | "overlay";
  localPoint: { x: number; y: number };
};
type PetWindowPresentation = {
  intent: PetSpriteIntent;
  overlay: PetWindowOverlay | null;
};

const PET_WINDOW_AUTONOMOUS_TICK_MS = 50;
const PET_WINDOW_AUTONOMOUS_SPEED_PX_PER_MS = 0.035;
const PET_WINDOW_AUTONOMOUS_MARGIN = 24;

let restoreCursorEventsTimer: number | null = null;

function surfacePointFromEvent(
  element: HTMLElement,
  event: React.MouseEvent<HTMLElement>,
) {
  const rect = element.getBoundingClientRect();
  const nativeEvent = event.nativeEvent as PointerEvent & {
    offsetX?: number;
    offsetY?: number;
  };

  if (rect.width > 0 && rect.height > 0) {
    const scaleX = PET_WINDOW_LAYOUT.width / rect.width;
    const scaleY = PET_WINDOW_LAYOUT.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  if (
    Number.isFinite(nativeEvent.offsetX) &&
    Number.isFinite(nativeEvent.offsetY)
  ) {
    return {
      x: nativeEvent.offsetX ?? 0,
      y: nativeEvent.offsetY ?? 0,
    };
  }

  return {
    x: 0,
    y: 0,
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

function pointerIdFromEvent(event: React.MouseEvent<HTMLElement>) {
  const pointerEvent = event as React.PointerEvent<HTMLElement>;

  return Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 0;
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
  const surfaceRef = useRef<HTMLElement | null>(null);
  const autonomousDirectionRef = useRef(
    movementDirectionForWindow(pet.windowIndex),
  );
  const dragPauseUntilRef = useRef(0);
  const inputSequenceRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const appliedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const hasShownAfterFirstPositionRef = useRef(false);
  const isPositionDrivenRef = useRef(false);
  const pointerStartRef = useRef<PetWindowPointerStart | null>(null);
  const [interactionStatus, setInteractionStatus] = useState<string | null>(
    null,
  );
  const [activeMenu, setActiveMenu] = useState<PetWindowMenu | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [spritesheetUrl, setSpritesheetUrl] = useState(
    FALLBACK_CODEX_PET_SPRITESHEET_URL,
  );
  const [presentation, setPresentation] = useState<PetWindowPresentation>(() =>
    defaultPresentation(pet.windowIndex),
  );
  const presentationRef = useRef<PetWindowPresentation>(presentation);

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

    let unlistenFrame: (() => void) | undefined;
    const currentWindow = getCurrentWindow();

    void listen<PetWindowFrame>(PET_WINDOW_FRAME_EVENT, (event) => {
      const frame = event.payload;

      if (frame.petId !== pet.petId) {
        return;
      }

      if (!isFreshPetWindowMessage(frameSequenceRef.current, frame.sequence)) {
        return;
      }

      frameSequenceRef.current = frame.sequence;
      isPositionDrivenRef.current = true;

      if (
        !isSamePetWindowPresentation(
          {
            sprite: { intent: presentationRef.current.intent },
            overlay: presentationRef.current.overlay,
          },
          { sprite: frame.sprite, overlay: frame.overlay },
        )
      ) {
        presentationRef.current = {
          intent: frame.sprite.intent,
          overlay: frame.overlay,
        };
        setPresentation({
          intent: frame.sprite.intent,
          overlay: frame.overlay,
        });
      }

      const nextPosition = {
        x: Math.round(frame.window.x),
        y: Math.round(frame.window.y),
      };
      const shouldShowWindow = !hasShownAfterFirstPositionRef.current;

      if (
        appliedPositionRef.current &&
        appliedPositionRef.current.x === nextPosition.x &&
        appliedPositionRef.current.y === nextPosition.y
      ) {
        if (shouldShowWindow) {
          hasShownAfterFirstPositionRef.current = true;
          void currentWindow.show();
        }

        return;
      }

      appliedPositionRef.current = nextPosition;
      if (shouldShowWindow) {
        hasShownAfterFirstPositionRef.current = true;
      }

      void currentWindow
        .setPosition(new PhysicalPosition(nextPosition.x, nextPosition.y))
        .then(() => {
          if (shouldShowWindow) {
            return currentWindow.show();
          }

          return undefined;
        });
    }).then((unlisten) => {
      unlistenFrame = unlisten;
    });

    return () => {
      unlistenFrame?.();
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    let dispose = () => {};

    void loadPetWindowSpritesheetUrl(pet.assetId)
      .catch(() => ({
        url: FALLBACK_CODEX_PET_SPRITESHEET_URL,
        dispose: () => {},
      }))
      .then((spritesheet) => {
        if (!isActive) {
          spritesheet.dispose();
          return;
        }

        dispose = spritesheet.dispose;
        setSpritesheetUrl(spritesheet.url);
      });

    return () => {
      isActive = false;
      dispose();
    };
  }, [pet.assetId]);

  useEffect(() => {
    let isActive = true;
    let animationFrame = 0;

    const tick = (nextElapsedMs: number) => {
      if (!isActive) {
        return;
      }

      setElapsedMs(nextElapsedMs);
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      isActive = false;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

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
    event: React.MouseEvent<HTMLElement>,
  ) {
    if (!isTauri()) {
      return;
    }

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const localPoint = surfacePointFromEvent(surface, event);
    inputSequenceRef.current += 1;
    const sequence = inputSequenceRef.current;

    void cursorPosition()
      .catch(() => ({ x: event.screenX, y: event.screenY }))
      .then((screenPoint) =>
        emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_INPUT_EVENT, {
          sequence,
          petId: pet.petId,
          windowLabel: getCurrentWindow().label,
          pointerId: pointerIdFromEvent(event),
          kind,
          localPoint,
          screenPoint,
          button: event.button,
          at: Date.now(),
        }),
      );
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      surfacePointFromEvent(surface, event),
    );

    if (pointerStartRef.current === "body" && isPositionDrivenRef.current) {
      emitPetWindowInput("body.pointer.move", event);
      return;
    }

    void setNativeCursorPassthrough(hit.kind === "transparent");
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      surfacePointFromEvent(surface, event),
    );
    pointerStartRef.current = hit.kind;

    if (hit.kind === "body") {
      setInteractionStatus("Direct manipulation");
      dragPauseUntilRef.current = Date.now() + 1200;
      emitPetWindowInput("body.pointer.down", event);
      void setNativeCursorPassthrough(false);
      if (isPositionDrivenRef.current) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } else {
        void startNativeWindowDrag();
      }
      return;
    }

    if (hit.kind === "overlay") {
      setInteractionStatus("Overlay armed");
      void setNativeCursorPassthrough(false);
      return;
    }

    void setNativeCursorPassthrough(true);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const surface = surfaceRef.current;
    const pointerStart = pointerStartRef.current;

    pointerStartRef.current = null;

    if (!surface) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      surfacePointFromEvent(surface, event),
    );

    if (pointerStart === "overlay" && hit.kind === "overlay") {
      setInteractionStatus("Overlay action");
      setActiveMenu(null);
      emitPetWindowInput("overlay.click", event);
      return;
    }

    if (pointerStart === "body") {
      setActiveMenu(null);
      emitPetWindowInput("body.pointer.up", event);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    void setNativeCursorPassthrough(hit.kind === "transparent");
  }

  function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      surfacePointFromEvent(surface, event),
    );

    if (hit.kind === "transparent") {
      setActiveMenu(null);
      void setNativeCursorPassthrough(true);
      return;
    }

    event.preventDefault();
    pointerStartRef.current = null;
    void setNativeCursorPassthrough(false);

    if (hit.kind === "body") {
      setInteractionStatus("Pet context menu");
      setActiveMenu({ kind: "body", localPoint: surfacePointFromEvent(surface, event) });
      emitPetWindowInput("body.contextmenu", event);
      return;
    }

    setInteractionStatus("Overlay context menu");
    setActiveMenu({ kind: "overlay", localPoint: surfacePointFromEvent(surface, event) });
    emitPetWindowInput("overlay.contextmenu", event);
  }

  function menuStyle(menu: PetWindowMenu): CSSProperties {
    return {
      left: `${Math.min(Math.max(menu.localPoint.x, 8), PET_WINDOW_LAYOUT.width - 136)}px`,
      top: `${Math.min(Math.max(menu.localPoint.y, 8), PET_WINDOW_LAYOUT.height - 72)}px`,
    };
  }

  return (
    <main
      aria-label={`Pet Window ${pet.petId}`}
      className="pet-window-surface"
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => void setNativeCursorPassthrough(true)}
      ref={surfaceRef}
    >
      <PetSprite
        alt={`Pet Sprite ${pet.petId}`}
        elapsedMs={elapsedMs}
        imageUrl={spritesheetUrl}
        intent={presentation.intent}
        overlay={presentation.overlay}
        size={PET_CELL_SIZE}
      />
      {activeMenu ? (
        <div
          aria-label={
            activeMenu.kind === "body"
              ? "Pet Context Menu"
              : "Pet Overlay Menu"
          }
          className="pet-window-menu"
          data-testid={
            activeMenu.kind === "body"
              ? "pet-context-menu"
              : "pet-overlay-menu"
          }
          role="menu"
          style={menuStyle(activeMenu)}
        >
          {activeMenu.kind === "body" ? (
            <>
              <button role="menuitem" type="button">
                Pet settings
              </button>
              <button role="menuitem" type="button">
                Attention history
              </button>
            </>
          ) : (
            <>
              <button role="menuitem" type="button">
                Minimize overlay
              </button>
              <button role="menuitem" type="button">
                Hide for now
              </button>
            </>
          )}
        </div>
      ) : null}
      {interactionStatus ? (
        <span className="pet-window-status" role="status">
          {interactionStatus}
        </span>
      ) : null}
    </main>
  );
}
