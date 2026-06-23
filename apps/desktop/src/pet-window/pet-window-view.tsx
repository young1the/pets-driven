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
import { PET_WINDOW_BUBBLE_OVERHEAD, PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import { loadPetWindowSpritesheetUrl } from "@/pet-window/pet-window-spritesheet";
import {
  isFreshPetWindowMessage,
  PET_WINDOW_BINDING_EVENT,
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_RESIZE_EVENT,
  type PetWindowBindingEvent,
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
type PetWindowBindingState = {
  title: string | null;
  isLoading: boolean;
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
      y:
        localY <= PET_WINDOW_BUBBLE_OVERHEAD
          ? localY
          : PET_WINDOW_BUBBLE_OVERHEAD + (localY - PET_WINDOW_BUBBLE_OVERHEAD) / drawScale,
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

function petWindowSizeForScale(scale: number) {
  return {
    width: PET_CELL_SIZE.width * scale,
    height: PET_CELL_SIZE.height * scale + PET_WINDOW_BUBBLE_OVERHEAD,
  };
}

function clampPetWindowScale(scale: number) {
  return Math.max(0.5, Math.min(4, scale));
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
  const isResizingRef = useRef(false);
  const hasShownAfterFirstPositionRef = useRef(false);
  const isPositionDrivenRef = useRef(false);
  const pointerStartRef = useRef<PetWindowPointerStart | null>(null);
  // bodyDownRef tracks the press origin so we can tell a tap from a drag;
  // lastTapAtRef turns two quick taps into a double-click that focuses the
  // bound window.
  const bodyDownRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const lastTapAtRef = useRef(0);
  const [interactionStatus, setInteractionStatus] = useState<string | null>(
    null,
  );
  const [activeMenu, setActiveMenu] = useState<PetWindowMenu | null>(null);
  // Binding state is pushed by the host. bindBubble is a transient confirmation
  // shown when the state changes.
  const [bindingState, setBindingState] = useState<PetWindowBindingState>({
    title: null,
    isLoading: false,
  });
  const bindingTitle = bindingState.title;
  const isBindingLoading = bindingState.isLoading;
  const [bindBubble, setBindBubble] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [spriteScale, setSpriteScale] = useState(1);
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

      const nextSize = { width: frame.window.width, height: frame.window.height };
      if (
        !appliedSizeRef.current ||
        appliedSizeRef.current.width !== nextSize.width ||
        appliedSizeRef.current.height !== nextSize.height
      ) {
        appliedSizeRef.current = nextSize;
        void currentWindow.setSize(new LogicalSize(nextSize.width, nextSize.height));
        setSpriteScale(nextSize.width / PET_CELL_SIZE.width);
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
    if (!isTauri()) {
      return;
    }

    const bindingPromise = listen<PetWindowBindingEvent>(
      PET_WINDOW_BINDING_EVENT,
      (event) => {
        if (event.payload.petId !== pet.petId) {
          return;
        }
        const title = event.payload.title;
        const isLoading = event.payload.isLoading === true;
        setBindingState({ title, isLoading });
        setBindBubble(
          isLoading ? "Connecting..." : title ? `🔗 Bound: ${title}` : "Unbound",
        );
      },
    );

    return () => {
      void bindingPromise.then((unlisten) => unlisten());
    };
  }, [pet.petId]);

  // Auto-dismiss the transient bind confirmation bubble.
  useEffect(() => {
    if (!bindBubble) {
      return;
    }
    const timer = window.setTimeout(() => setBindBubble(null), 2600);
    return () => window.clearTimeout(timer);
  }, [bindBubble]);

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

  function requestBindingState() {
    setBindingState((current) => ({ ...current, isLoading: true }));
    emitPetWindowSignal("menu.request-binding");
  }

  function requestStartSession() {
    setBindingState((current) => ({ ...current, isLoading: true }));
    setBindBubble("Connecting...");
    emitPetWindowSignal("menu.start-session");
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
      const nextSize = petWindowSizeForScale(newScale);
      appliedSizeRef.current = nextSize;
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
      isResizingRef.current = true;
      resizeStartRef.current = { screenX: event.screenX, screenY: event.screenY, scale: spriteScale };
      pointerStartRef.current = "resize";
      event.currentTarget.setPointerCapture?.(event.pointerId);
      void setNativeCursorPassthrough(false);
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
      const finalScale = clampPetWindowScale(resizeStartRef.current.scale + delta / 100);
      appliedSizeRef.current = petWindowSizeForScale(finalScale);
      isResizingRef.current = false;
      resizeStartRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
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

      // A press that barely moved is a tap; two quick taps = double-click ->
      // focus the bound window. ponytail: only fires in position-driven mode;
      // native-drag pets hand the gesture to the OS so there is no tap.
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
      // Ask the host for the current binding so the menu reflects live state.
      requestBindingState();
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
          height: `${PET_CELL_SIZE.height * spriteScale + PET_WINDOW_BUBBLE_OVERHEAD}px`,
          width: `${PET_CELL_SIZE.width * spriteScale}px`,
        }}
      >
        <PetSprite
          alt={`Pet Sprite ${pet.petId}`}
          decisionEmote={presentation.decisionEmote}
          elapsedMs={elapsedMs}
          imageUrl={spritesheetUrl}
          intent={presentation.intent}
          overlay={presentation.overlay}
          size={PET_CELL_SIZE}
          scale={spriteScale}
          style={{ marginTop: PET_WINDOW_BUBBLE_OVERHEAD }}
        />
        <IconButton
          className="pet-window-resize-button"
          label="Resize pet"
          size="sm"
          variant="soft"
        >
          <span aria-hidden="true" className="pet-window-resize-button__mark" />
        </IconButton>
        {bindingTitle || isBindingLoading ? (
          <span
            className="pet-window-bind-badge"
            title={isBindingLoading ? "Connecting" : `Bound: ${bindingTitle}`}
            aria-label={
              isBindingLoading ? "Connecting" : `Bound: ${bindingTitle}`
            }
          >
            {isBindingLoading ? "..." : "🔗"}
          </span>
        ) : null}
        {bindBubble ? (
          <span className="pet-window-bind-bubble" role="status">
            {bindBubble}
          </span>
        ) : null}
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
          // Keep clicks inside the menu from reaching the surface's pointer
          // handlers, which would start a window drag and swallow the click.
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          {activeMenu.kind === "body" ? (
            <>
              <span className="pet-window-menu__status" aria-live="polite">
                {isBindingLoading
                  ? "Checking connection..."
                  : bindingTitle
                    ? `🔗 ${bindingTitle}`
                    : "Not connected"}
              </span>
              {bindingTitle && !isBindingLoading ? (
                <>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setActiveMenu(null);
                      emitPetWindowSignal("body.focus");
                    }}
                  >
                    Open session window
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setActiveMenu(null);
                      emitPetWindowSignal("menu.unbind");
                    }}
                  >
                    Unbind window
                  </button>
                </>
              ) : null}
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  requestStartSession();
                }}
              >
                Start new session
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
