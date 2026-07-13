import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@pets-driven/i18n";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  LogicalSize,
  LogicalPosition,
} from "@tauri-apps/api/window";
import { FALLBACK_CODEX_PET_SPRITESHEET_URL } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import {
  msUntilNextAtlasFrame,
  PET_CELL_SIZE,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";
import { IconButton, PET_MOODS } from "@pets-driven/design-system";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
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
import type { PetWindowFixturePresentation } from "@/pet-window/pet-window-fixtures";

type PetWindowViewProps = {
  pet: PetWindowRouteParams;
  /**
   * Browser-fixture only: seeds the presentation/scale that would otherwise
   * arrive from the Tauri PET_WINDOW_FRAME_EVENT stream, which doesn't exist
   * outside the real app. Ignored when running inside Tauri.
   */
  previewPresentation?: PetWindowFixturePresentation;
  previewScale?: number;
};

type PetWindowPointerStart = "body" | "overlay" | "resize" | "transparent";
type PetWindowPresentation = {
  decisionEmote: BehaviorTokenPresentation | null;
  animationState: PetAnimationState;
  activity: PetActivityKind | null;
  /** Session partner name for the capsule label, following the shown activity. */
  partnerName: string | null;
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
    animationState:
      movementDirectionForWindow(index) >= 0 ? "running-right" : "running-left",
    activity: null,
    partnerName: null,
    overlay: { kind: "status", label: "!" },
  };
}

// Browser-preview stand-in for the real app's owned context-menu popup
// window: opens the same `?surface=pet-context-menu` route (see main.tsx) in
// a new tab, since a plain browser tab can't spawn a borderless owned window.
function petContextMenuPreviewUrl(petId: string, petName: string) {
  const url = new URL(window.location.origin);
  url.searchParams.set("surface", "pet-context-menu");
  url.searchParams.set("petId", petId);
  url.searchParams.set("petName", petName);
  url.searchParams.set("note", "");
  return url.toString();
}

function hitLayoutForPresentation(
  presentation: PetWindowPresentation,
): PetWindowHitLayout {
  return {
    ...PET_WINDOW_LAYOUT,
    overlay: presentation.overlay ? PET_WINDOW_LAYOUT.overlay : null,
  };
}

// Same display hysteresis as the main-window card chip: autonomous decisions
// churn every 500ms-2s, so hold each shown activity for a beat. Null → value
// switches immediately (reactions feel instant); value → value/null waits.
const ACTIVITY_MIN_DISPLAY_MS = 1_500;

type ShownActivity = { value: PetActivityKind | null; at: number };

function steadyActivity(
  shown: ShownActivity,
  next: PetActivityKind | null,
  now: number,
): PetActivityKind | null {
  if (next !== shown.value) {
    if (shown.value === null || now - shown.at >= ACTIVITY_MIN_DISPLAY_MS) {
      shown.value = next;
      shown.at = now;
    }
  }
  return shown.value;
}


export function PetWindowView({
  pet,
  previewPresentation,
  previewScale,
}: PetWindowViewProps) {
  const { t } = useTranslation("desktop");
  const isPreview = !isTauri();
  const surfaceRef = useRef<HTMLElement | null>(null);
  const visualFrameRef = useRef<HTMLSpanElement | null>(null);
  const dragPauseUntilRef = useRef(0);
  const inputSequenceRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const appliedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const appliedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeStartRef = useRef<{
    screenX: number;
    screenY: number;
    scale: number;
  } | null>(null);
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
  const isBodyHoveredRef = useRef(false);
  const [interactionStatus, setInteractionStatus] = useState<string | null>(
    null,
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [spriteScale, setSpriteScale] = useState(
    isPreview && previewScale ? clampPetWindowScale(previewScale) : 1,
  );
  const [spritesheetUrl, setSpritesheetUrl] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<PetWindowPresentation>(() => ({
    ...defaultPresentation(pet.windowIndex),
    ...(isPreview ? previewPresentation : undefined),
  }));
  const [isBodyHovered, setIsBodyHovered] = useState(false);
  const [petName, setPetName] = useState<string | null>(
    isPreview ? (pet.name ?? null) : null,
  );
  const presentationRef = useRef<PetWindowPresentation>(presentation);
  const shownActivityRef = useRef<ShownActivity>({ value: null, at: 0 });
  const petNameRef = useRef<string | null>(null);
  const cwdRef = useRef<string | null>(null);
  // Connect-mode feedback: the prompt while the host waits for a pick, then a
  // short-lived result notice. Non-connect binding updates stay silent.
  const [bindingNotice, setBindingNotice] = useState<string | null>(null);
  const bindingNoticeTimerRef = useRef<number | null>(null);
  // Title held when connect mode started; a cancelled pick reports the same
  // binding back, so an unchanged title means nothing new was connected.
  const connectStartTitleRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("pet-window-document");
    if (isPreview) {
      document.documentElement.classList.add("pet-window-fixture-preview");
    }

    return () => {
      document.documentElement.classList.remove("pet-window-document");
      document.documentElement.classList.remove("pet-window-fixture-preview");
    };
  }, [isPreview]);

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
      if (frame.name) {
        petNameRef.current = frame.name;
        setPetName(frame.name);
      }
      if (frame.cwd !== undefined) cwdRef.current = frame.cwd || null;

      const steadiedActivity = steadyActivity(
        shownActivityRef.current,
        frame.sprite.activity ?? null,
        Date.now(),
      );
      // The partner name follows the shown activity: keep it in step when the
      // new activity wins, hold the previous name while the old label is held.
      const steadiedPartnerName =
        steadiedActivity === (frame.sprite.activity ?? null)
          ? (frame.sprite.partnerName ?? null)
          : presentationRef.current.partnerName;

      if (
        !isSamePetWindowPresentation(
          {
            sprite: {
              decisionEmote: presentationRef.current.decisionEmote,
              animationState: presentationRef.current.animationState,
              activity: presentationRef.current.activity,
              partnerName: presentationRef.current.partnerName,
            },
            overlay: presentationRef.current.overlay,
          },
          {
            sprite: {
              ...frame.sprite,
              activity: steadiedActivity,
              partnerName: steadiedPartnerName,
            },
            overlay: frame.overlay,
          },
        )
      ) {
        presentationRef.current = {
          decisionEmote: frame.sprite.decisionEmote ?? null,
          animationState: frame.sprite.animationState,
          activity: steadiedActivity,
          partnerName: steadiedPartnerName,
          overlay: frame.overlay,
        };
        setPresentation({
          decisionEmote: frame.sprite.decisionEmote ?? null,
          animationState: frame.sprite.animationState,
          activity: steadiedActivity,
          partnerName: steadiedPartnerName,
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
        setSpriteScale(frameScale);
        void currentWindow.setSize(
          new LogicalSize(nextSize.width, nextSize.height),
        );
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

    let unlistenBinding: (() => void) | undefined;

    void listen<PetWindowBindingEvent>(PET_WINDOW_BINDING_EVENT, (event) => {
      const binding = event.payload;

      if (binding.petId !== pet.petId) {
        return;
      }

      if (bindingNoticeTimerRef.current !== null) {
        window.clearTimeout(bindingNoticeTimerRef.current);
        bindingNoticeTimerRef.current = null;
      }

      if (binding.isConnecting) {
        connectStartTitleRef.current = binding.title;
        setBindingNotice(t("petWindow.connectPrompt"));
        return;
      }

      if (connectStartTitleRef.current === undefined) {
        return;
      }

      const isNewBinding =
        binding.title !== null && binding.title !== connectStartTitleRef.current;
      connectStartTitleRef.current = undefined;
      setBindingNotice(
        isNewBinding
          ? t("petWindow.connectedTo", { title: binding.title })
          : t("petWindow.connectCancelled"),
      );
      bindingNoticeTimerRef.current = window.setTimeout(() => {
        bindingNoticeTimerRef.current = null;
        setBindingNotice(null);
      }, 2600);
    }).then((unlisten) => {
      unlistenBinding = unlisten;
    });

    return () => {
      unlistenBinding?.();
      if (bindingNoticeTimerRef.current !== null) {
        window.clearTimeout(bindingNoticeTimerRef.current);
        bindingNoticeTimerRef.current = null;
      }
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

  // Advance the sprite clock only when the atlas is about to flip frames
  // (every 110-320ms) instead of re-rendering at display refresh rate: pet
  // windows are always-on, so a 60Hz rAF loop here was a steady idle-CPU
  // cost per pet. performance.now() shares rAF's time origin, so the
  // animation phase is unchanged.
  const currentAnimationState = presentation.animationState;
  useEffect(() => {
    let isActive = true;
    let timeoutId = 0;

    const tick = () => {
      if (!isActive) {
        return;
      }

      const nextElapsedMs = performance.now();
      setElapsedMs(nextElapsedMs);
      timeoutId = window.setTimeout(
        tick,
        msUntilNextAtlasFrame(currentAnimationState, nextElapsedMs),
      );
    };

    tick();

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [currentAnimationState]);

  function emitPetWindowInput(
    kind: PetWindowInputKind,
    event: React.MouseEvent<HTMLElement>,
    screenPointOverride?: { x: number; y: number },
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
      petName: petNameRef.current ?? undefined,
      windowLabel: getCurrentWindow().label,
      pointerId: pointerIdFromEvent(event),
      kind,
      localPoint,
      screenPoint: screenPointOverride ?? {
        x: event.screenX,
        y: event.screenY,
      },
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

    const hit = classifyPetWindowPoint(
      hitLayoutForPresentation(presentation),
      surfacePointFromEvent(surface, event),
    );

    if (pointerStartRef.current === "resize" && resizeStartRef.current) {
      const delta =
        (event.screenX -
          resizeStartRef.current.screenX +
          event.screenY -
          resizeStartRef.current.screenY) /
        2;
      const newScale = clampPetWindowScale(
        resizeStartRef.current.scale + delta / 100,
      );

      if (!canApplyResizeScale(newScale)) {
        return;
      }

      const nextSize = petWindowSizeForScale(newScale);
      appliedSizeRef.current = nextSize;
      resizeAppliedScaleRef.current = newScale;
      setSpriteScale(newScale);
      if (isTauri()) {
        void getCurrentWindow().setSize(
          new LogicalSize(nextSize.width, nextSize.height),
        );
      }
      return;
    }

    if (pointerStartRef.current === "body" && isPositionDrivenRef.current) {
      emitPetWindowInput("body.pointer.move", event);
      return;
    }

    const nextBodyHovered = hit.kind === "body";
    if (nextBodyHovered !== isBodyHoveredRef.current) {
      isBodyHoveredRef.current = nextBodyHovered;
      setIsBodyHovered(nextBodyHovered);
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
      emitPetWindowInput("overlay.click", event);
      return;
    }

    if (pointerStart === "resize" && resizeStartRef.current) {
      const delta =
        (event.screenX -
          resizeStartRef.current.screenX +
          event.screenY -
          resizeStartRef.current.screenY) /
        2;
      const requestedScale = clampPetWindowScale(
        resizeStartRef.current.scale + delta / 100,
      );
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
      if (isTauri()) {
        void emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_RESIZE_EVENT, {
          petId: pet.petId,
          scale: finalScale,
        } satisfies PetWindowResizeEvent);
      }
      return;
    }

    if (pointerStart === "body") {
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
      void setNativeCursorPassthrough(true);
      return;
    }

    event.preventDefault();
    pointerStartRef.current = null;
    void setNativeCursorPassthrough(false);

    if (isPreview) {
      window.open(
        petContextMenuPreviewUrl(pet.petId, petName ?? pet.petId),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    // Pass clientX/Y (CSS pixels relative to this window's content area) rather
    // than screenX/Y, which is unreliable across monitors in WebView2. The host
    // resolves the physical screen position using the pet window's outer position.
    const clientPoint = { x: event.clientX, y: event.clientY };

    if (hit.kind === "body") {
      setInteractionStatus("Pet context menu");
      emitPetWindowInput("body.contextmenu", event, clientPoint);
      return;
    }

    setInteractionStatus("Overlay context menu");
    emitPetWindowInput("overlay.contextmenu", event, clientPoint);
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
        if (isBodyHoveredRef.current) {
          isBodyHoveredRef.current = false;
          setIsBodyHovered(false);
        }

        if (
          pointerStartRef.current === "body" ||
          pointerStartRef.current === "resize"
        ) {
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
            animationState={presentation.animationState}
            decisionEmote={presentation.decisionEmote}
            elapsedMs={elapsedMs}
            imageUrl={spritesheetUrl}
            overlay={presentation.overlay}
            showStatusBubble={false}
            size={PET_CELL_SIZE}
            scale={spriteScale}
            style={{ marginTop: PET_WINDOW_BUBBLE_OVERHEAD * spriteScale }}
          />
        ) : null}
        {petName !== null ? (
          <PetStatusCard
            activity={presentation.activity}
            partnerName={presentation.partnerName}
            animationState={presentation.animationState}
            cwd={isBodyHovered ? cwdRef.current : null}
            name={petName}
            notice={bindingNotice}
            overlay={presentation.overlay}
            spriteHeight={PET_CELL_SIZE.height * spriteScale}
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
      {interactionStatus ? (
        <span className="pet-window-status" role="status">
          {interactionStatus}
        </span>
      ) : null}
    </main>
  );
}

type PetStatusCardProps = {
  name: string;
  animationState: PetAnimationState;
  activity: PetActivityKind | null;
  partnerName: string | null;
  overlay: PetWindowOverlay | null;
  cwd: string | null;
  /** Transient host notice (e.g. connect-mode) that outranks the status message. */
  notice: string | null;
  spriteHeight: number;
};

function PetStatusCard({
  name,
  animationState,
  activity,
  partnerName,
  overlay,
  cwd,
  notice,
  spriteHeight,
}: PetStatusCardProps) {
  const { t } = useTranslation("desktop");
  const status = presentPetStatus(animationState, overlay, activity, partnerName);
  const accent = PET_MOODS[status.mood].accent;
  // Static labels carry a stable key we can localize; host-supplied free text
  // (speech/attention overlays) has no key, so it shows as-is.
  const label = status.labelKey
    ? t(`petStatus.${status.labelKey}`, status.labelParams)
    : status.label;
  const message = notice ?? status.message;

  return (
    <div
      className="pet-window-status-card"
      style={
        {
          "--pet-window-dot-color": accent,
          "--pet-window-label-color": accent,
          "--sprite-h": `${spriteHeight}px`,
        } as React.CSSProperties
      }
    >
      <div
        className={`pet-window-status-card__inner${cwd || message ? " pet-window-status-card__inner--expanded" : ""}`}
      >
        <div className="pet-window-status-card__row">
          <span className="pet-window-status-card__dot" />
          <span className="pet-window-status-card__name">{name}</span>
          {label ? (
            <span className="pet-window-status-card__label">{label}</span>
          ) : null}
        </div>
        {message ? (
          <div className="pet-window-status-card__message">{message}</div>
        ) : null}
        {cwd ? (
          <div className="pet-window-status-card__cwd">
            <svg
              aria-hidden="true"
              fill="none"
              height="11"
              stroke="var(--lavender-600)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              width="11"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <span>{cwd}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
