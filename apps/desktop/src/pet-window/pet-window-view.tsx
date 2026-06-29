import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  LogicalSize,
  LogicalPosition,
} from "@tauri-apps/api/window";
import {
  FALLBACK_CODEX_PET_SPRITESHEET_URL,
} from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { IconButton } from "@pets-driven/design-system";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetSpriteIntent } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-intent";
import { classifyPetWindowPoint } from "@/pet-window/pet-window-hit-region";
import {
  clampPetWindowScale,
  PET_WINDOW_BUBBLE_OVERHEAD,
  PET_WINDOW_MAX_RESIZE_WIDTH,
  PET_WINDOW_LAYOUT,
  petWindowSizeForScale,
} from "@/pet-window/pet-window-layout";
import { loadPetWindowSpritesheetUrl } from "@/pet-window/pet-window-spritesheet";
import {
  isFreshPetWindowMessage,
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_RESIZE_EVENT,
  type PetWindowInputKind,
  type PetWindowFrame,
  type PetWindowOverlay,
  type PetWindowResizeEvent,
  isSamePetWindowPresentation,
} from "@/pet-window/pet-window-messages";
import type { PetWindowHitLayout } from "@/pet-window/pet-window-types";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";

type PetWindowViewProps = {
  pet: PetWindowRouteParams;
};

type PetWindowPointerStart = "body" | "overlay" | "resize" | "transparent";
type PetWindowMenu = {
  kind: "body" | "overlay";
  localPoint: { x: number; y: number };
};
type PetWindowPresentation = {
  decisionEmote: BehaviorTokenPresentation | null;
  intent: PetSpriteIntent;
  overlay: PetWindowOverlay | null;
};

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
    const drawScale = rect.width / PET_CELL_SIZE.width;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    return {
      x: localX / drawScale,
      y: localY / drawScale,
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

function canApplyResizeScale(scale: number) {
  return PET_CELL_SIZE.width * scale < PET_WINDOW_MAX_RESIZE_WIDTH;
}

function defaultPresentation(index: number): PetWindowPresentation {
  return {
    decisionEmote: null,
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
  const visualFrameRef = useRef<HTMLSpanElement | null>(null);
  const dragPauseUntilRef = useRef(0);
  const inputSequenceRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const appliedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const appliedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeStartRef = useRef<{ screenX: number; screenY: number; scale: number } | null>(null);
  const resizeAppliedScaleRef = useRef<number | null>(null);
  const isResizingRef = useRef(false);
  const hasShownAfterFirstPositionRef = useRef(false);
  const isPositionDrivenRef = useRef(false);
  const pointerStartRef = useRef<PetWindowPointerStart | null>(null);
  // bodyDownRef tracks the press origin so we can tell a tap from a drag;
  // lastTapAtRef turns two quick taps into a double-click that asks the host to
  // focus the bound window or start a new session.
  const bodyDownRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const lastTapAtRef = useRef(0);
  const [interactionStatus, setInteractionStatus] = useState<string | null>(
    null,
  );
  const [activeMenu, setActiveMenu] = useState<PetWindowMenu | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const notePositionRef = useRef<{ x: number; y: number } | null>(null);
  const petName = pet.name ?? pet.petId;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [spriteScale, setSpriteScale] = useState(1);
  const [spritesheetUrl, setSpritesheetUrl] = useState<string | null>(null);
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

      if (isResizingRef.current) {
        frameSequenceRef.current = frame.sequence;
        return;
      }

      frameSequenceRef.current = frame.sequence;
      isPositionDrivenRef.current = true;

      if (
        !isSamePetWindowPresentation(
          {
            sprite: {
              decisionEmote: presentationRef.current.decisionEmote,
              intent: presentationRef.current.intent,
            },
            overlay: presentationRef.current.overlay,
          },
          { sprite: frame.sprite, overlay: frame.overlay },
        )
      ) {
        presentationRef.current = {
          decisionEmote: frame.sprite.decisionEmote ?? null,
          intent: frame.sprite.intent,
          overlay: frame.overlay,
        };
        setPresentation({
          decisionEmote: frame.sprite.decisionEmote ?? null,
          intent: frame.sprite.intent,
          overlay: frame.overlay,
        });
      }

      const frameScale = clampPetWindowScale(
        frame.window.width / PET_CELL_SIZE.width,
      );
      const nextSize = petWindowSizeForScale(frameScale);
      if (
        !appliedSizeRef.current ||
        appliedSizeRef.current.width !== nextSize.width ||
        appliedSizeRef.current.height !== nextSize.height
      ) {
        appliedSizeRef.current = nextSize;
        void currentWindow.setSize(new LogicalSize(nextSize.width, nextSize.height));
        setSpriteScale(frameScale);
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
        .setPosition(new LogicalPosition(nextPosition.x, nextPosition.y))
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

    setSpritesheetUrl(null);

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

  function emitPetWindowInput(
    kind: PetWindowInputKind,
    event: React.MouseEvent<HTMLElement>,
  ) {
    if (!isTauri()) {
      return;
    }

    const surface = visualFrameRef.current;

    if (!surface) {
      return;
    }

    const localPoint = surfacePointFromEvent(surface, event);
    inputSequenceRef.current += 1;
    const sequence = inputSequenceRef.current;

    void emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_INPUT_EVENT, {
      sequence,
      petId: pet.petId,
      windowLabel: getCurrentWindow().label,
      pointerId: pointerIdFromEvent(event),
      kind,
      localPoint,
      screenPoint: { x: event.screenX, y: event.screenY },
      button: event.button,
      at: Date.now(),
    });
  }

  // Coordinate-free signal to the host for window focus/bind/start actions.
  function emitPetWindowSignal(kind: PetWindowInputKind) {
    if (!isTauri()) {
      return;
    }

    inputSequenceRef.current += 1;
    void emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_INPUT_EVENT, {
      sequence: inputSequenceRef.current,
      petId: pet.petId,
      windowLabel: getCurrentWindow().label,
      pointerId: 0,
      kind,
      localPoint: { x: 0, y: 0 },
      screenPoint: { x: 0, y: 0 },
      at: Date.now(),
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const surface = visualFrameRef.current;

    if (!surface) {
      return;
    }

    // While a menu is open keep the window solid so its buttons stay clickable
    // (passthrough mode would let clicks fall through to whatever is behind).
    if (activeMenu) {
      void setNativeCursorPassthrough(false);
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      surfacePointFromEvent(surface, event),
    );

    if (pointerStartRef.current === "resize" && resizeStartRef.current) {
      const delta = (event.screenX - resizeStartRef.current.screenX + event.screenY - resizeStartRef.current.screenY) / 2;
      const newScale = clampPetWindowScale(resizeStartRef.current.scale + delta / 100);

      if (!canApplyResizeScale(newScale)) {
        return;
      }

      const nextSize = petWindowSizeForScale(newScale);
      appliedSizeRef.current = nextSize;
      resizeAppliedScaleRef.current = newScale;
      setSpriteScale(newScale);
      void getCurrentWindow().setSize(new LogicalSize(nextSize.width, nextSize.height));
      return;
    }

    if (pointerStartRef.current === "body" && isPositionDrivenRef.current) {
      emitPetWindowInput("body.pointer.move", event);
      return;
    }

    void setNativeCursorPassthrough(hit.kind === "transparent");
  }

  function startResize(event: React.PointerEvent<HTMLElement>) {
    event.preventDefault();

    if (!canApplyResizeScale(spriteScale)) {
      isResizingRef.current = false;
      resizeStartRef.current = null;
      resizeAppliedScaleRef.current = null;
      pointerStartRef.current = null;
      void setNativeCursorPassthrough(false);
      return;
    }

    isResizingRef.current = true;
    resizeStartRef.current = {
      screenX: event.screenX,
      screenY: event.screenY,
      scale: spriteScale,
    };
    resizeAppliedScaleRef.current = null;
    pointerStartRef.current = "resize";
    surfaceRef.current?.setPointerCapture?.(event.pointerId);
    void setNativeCursorPassthrough(false);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    const surface = visualFrameRef.current;

    if (!surface) {
      return;
    }

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      surfacePointFromEvent(surface, event),
    );
    pointerStartRef.current = hit.kind;

    if (hit.kind === "body") {
      bodyDownRef.current = { screenX: event.screenX, screenY: event.screenY };
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

    if (hit.kind === "resize") {
      startResize(event);
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
    const surface = visualFrameRef.current;
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

    if (pointerStart === "resize" && resizeStartRef.current) {
      const delta = (event.screenX - resizeStartRef.current.screenX + event.screenY - resizeStartRef.current.screenY) / 2;
      const requestedScale = clampPetWindowScale(resizeStartRef.current.scale + delta / 100);
      const finalScale = canApplyResizeScale(requestedScale)
        ? requestedScale
        : resizeAppliedScaleRef.current;
      isResizingRef.current = false;
      resizeStartRef.current = null;
      resizeAppliedScaleRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      if (finalScale === null) {
        return;
      }

      appliedSizeRef.current = petWindowSizeForScale(finalScale);
      void emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_RESIZE_EVENT, {
        petId: pet.petId,
        scale: finalScale,
      } satisfies PetWindowResizeEvent);
      return;
    }

    if (pointerStart === "body") {
      setActiveMenu(null);
      emitPetWindowInput("body.pointer.up", event);
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      // A press that barely moved is a tap; two quick taps = double-click.
      // This only fires in position-driven mode; native-drag pets hand the
      // gesture to the OS so there is no tap.
      const down = bodyDownRef.current;
      bodyDownRef.current = null;
      if (down) {
        const moved = Math.hypot(
          event.screenX - down.screenX,
          event.screenY - down.screenY,
        );
        if (moved < 6) {
          const now = Date.now();
          if (now - lastTapAtRef.current < 400) {
            lastTapAtRef.current = 0;
            emitPetWindowSignal("body.focus");
          } else {
            lastTapAtRef.current = now;
          }
        }
      }
    }

    void setNativeCursorPassthrough(hit.kind === "transparent");
  }

  function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    const surface = visualFrameRef.current;

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
      onPointerLeave={() => {
        if (pointerStartRef.current === "body" || pointerStartRef.current === "resize") {
          void setNativeCursorPassthrough(false);
          return;
        }

        void setNativeCursorPassthrough(true);
      }}
      ref={surfaceRef}
    >
      <span
        className="pet-window-visual-frame"
        ref={visualFrameRef}
        style={{
          height: `${(PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD) * spriteScale}px`,
          width: `${PET_CELL_SIZE.width * spriteScale}px`,
        }}
      >
        {spritesheetUrl ? (
          <PetSprite
            alt={`Pet Sprite ${pet.petId}`}
            decisionEmote={presentation.decisionEmote}
            elapsedMs={elapsedMs}
            imageUrl={spritesheetUrl}
            intent={presentation.intent}
            overlay={presentation.overlay}
            size={PET_CELL_SIZE}
            scale={spriteScale}
            style={{ marginTop: PET_WINDOW_BUBBLE_OVERHEAD * spriteScale }}
          />
        ) : null}
        <IconButton
          className="pet-window-resize-button"
          label="Resize pet"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            event.stopPropagation();
            startResize(event);
          }}
          size="sm"
          variant="soft"
        >
          <span aria-hidden="true" className="pet-window-resize-button__mark" />
        </IconButton>
      </span>
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
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <div className="pet-window-menu__header">
            <span className="pet-window-menu__name">{petName}</span>
          </div>
          <div className="pet-window-menu__divider" />
          <button
            className="pet-window-menu__item pet-window-menu__item--note"
            role="menuitem"
            type="button"
            onClick={() => {
              notePositionRef.current = activeMenu.localPoint;
              setActiveMenu(null);
              setShowNote(true);
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            노트 작성하기
          </button>
          <button
            className="pet-window-menu__item pet-window-menu__item--close"
            role="menuitem"
            type="button"
            onClick={() => {
              setActiveMenu(null);
              if (isTauri()) {
                void getCurrentWindow().close();
              }
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
            닫기
          </button>
        </div>
      ) : null}
      {showNote ? (
        <div
          aria-label={`${petName}에게 노트`}
          className="pet-window-note"
          style={
            notePositionRef.current
              ? {
                  left: `${Math.min(Math.max(notePositionRef.current.x, 8), PET_WINDOW_LAYOUT.width - 160)}px`,
                  top: `${Math.min(Math.max(notePositionRef.current.y, 8), PET_WINDOW_LAYOUT.height - 130)}px`,
                }
              : {}
          }
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <div className="pet-window-note__header">{petName}에게 메모</div>
          <textarea
            className="pet-window-note__input"
            placeholder="메모를 입력하세요"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <div className="pet-window-note__actions">
            <button
              className="pet-window-note__cancel"
              type="button"
              onClick={() => {
                setShowNote(false);
                setNoteText("");
              }}
            >
              취소
            </button>
            <button
              className="pet-window-note__save"
              type="button"
              onClick={() => {
                setShowNote(false);
                setNoteText("");
              }}
            >
              저장
            </button>
          </div>
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
