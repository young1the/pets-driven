import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import { useEffect, useRef, useState } from "react";
import { ownWindowPetSurfaceHost, type PetSurfaceHost } from "@/pet-window/pet-surface-host";
import type { PetWindowFixturePresentation } from "@/pet-window/pet-window-fixtures";
import { classifyPetWindowPoint } from "@/pet-window/pet-window-hit-region";
import {
  clampPetWindowScale,
  PET_WINDOW_LAYOUT,
  PET_WINDOW_MAX_RESIZE_WIDTH,
  petWindowSizeForScale,
} from "@/pet-window/pet-window-layout";
import {
  isFreshPetWindowMessage,
  isSamePetWindowPresentation,
  type PetWindowInputKind,
  type PetWindowOverlay,
} from "@/pet-window/pet-window-messages";
import { petWindowTransport } from "@/pet-window/pet-window-transport";
import type { PetWindowHitLayout, PetWindowRouteParams } from "@/pet-window/pet-window-types";

export type PetWindowPresentation = {
  decisionEmote: BehaviorTokenPresentation | null;
  animationState: PetAnimationState;
  activity: PetActivityKind | null;
  /** Session partner name for the capsule label, following the shown activity. */
  partnerName: string | null;
  /** True while an agent task is running, so the capsule stays shown as "working". */
  working: boolean;
  overlay: PetWindowOverlay | null;
};

type PetWindowPointerStart = "body" | "overlay" | "resize" | "transparent";

function surfacePointFromEvent(element: HTMLElement, event: React.MouseEvent<HTMLElement>) {
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

  if (Number.isFinite(nativeEvent.offsetX) && Number.isFinite(nativeEvent.offsetY)) {
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
    animationState: movementDirectionForWindow(index) >= 0 ? "running-right" : "running-left",
    activity: null,
    partnerName: null,
    working: false,
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

function hitLayoutForPresentation(presentation: PetWindowPresentation): PetWindowHitLayout {
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

/** A blank note is no note: whitespace must not light up the card's badge. */
function normalizeNote(note: string | null): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

type UsePetWindowSurfaceParams = {
  pet: PetWindowRouteParams;
  isPreview: boolean;
  previewPresentation?: PetWindowFixturePresentation;
  previewScale?: number;
  previewNote?: string;
  /**
   * Who owns the surface this pet is drawn on. Defaults to the pet's own OS
   * window; the single-window overlay passes its own so a pet inside it never
   * resizes, drags or hands back a window it shares.
   */
  host?: PetSurfaceHost;
};

/**
 * All of a pet overlay window's imperative behavior: it applies the host's
 * incoming frame stream to the window's presentation, size and position, and
 * turns local pointer gestures (drag, throw, resize, pet, tap, context menu)
 * into host input signals. PetWindowView consumes the returned state and
 * handlers and does nothing but render them.
 */
export function usePetWindowSurface({
  pet,
  isPreview,
  previewPresentation,
  previewScale,
  previewNote,
  host = ownWindowPetSurfaceHost,
}: UsePetWindowSurfaceParams) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const visualFrameRef = useRef<HTMLSpanElement | null>(null);
  const dragPauseUntilRef = useRef(0);
  const inputSequenceRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const appliedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeStartRef = useRef<{
    screenX: number;
    screenY: number;
    scale: number;
  } | null>(null);
  const resizeAppliedScaleRef = useRef<number | null>(null);
  const isResizingRef = useRef(false);
  const isPositionDrivenRef = useRef(false);
  const pointerStartRef = useRef<PetWindowPointerStart | null>(null);
  // bodyDownRef tracks the press origin so we can tell a tap from a drag;
  // lastTapAtRef turns two quick taps into a double-click that asks the host to
  // focus the bound window or start a new session.
  const bodyDownRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const lastTapAtRef = useRef(0);
  const isBodyHoveredRef = useRef(false);
  const isResizeHoveredRef = useRef(false);
  const [interactionStatus, setInteractionStatus] = useState<string | null>(null);
  const [spriteScale, setSpriteScale] = useState(
    isPreview && previewScale ? clampPetWindowScale(previewScale) : 1,
  );
  const [presentation, setPresentation] = useState<PetWindowPresentation>(() => ({
    ...defaultPresentation(pet.windowIndex),
    ...(isPreview ? previewPresentation : undefined),
  }));
  const [isBodyHovered, setIsBodyHovered] = useState(false);
  // Drives the resize button's visibility: shown only while the pointer is
  // over the pet itself (or the handle it already revealed), not anywhere in
  // the transparent window around it.
  const [isResizeAffordanceHovered, setIsResizeAffordanceHovered] = useState(false);
  const [petName, setPetName] = useState<string | null>(isPreview ? (pet.name ?? null) : null);
  // The pet's look can change while its window is open, and the window's URL
  // still carries whichever asset it was opened with — so the frame stream wins
  // once it has told us otherwise.
  const [assetId, setAssetId] = useState<string>(pet.assetId);
  // Unlike the name and folder this is React state, not a ref: the note drives
  // when the pet speaks, so the window has to re-render on the frame that
  // carries a new one rather than waiting for the next presentation change.
  const [note, setNote] = useState<string | null>(
    isPreview ? normalizeNote(previewNote ?? null) : null,
  );
  const presentationRef = useRef<PetWindowPresentation>(presentation);
  const shownActivityRef = useRef<ShownActivity>({ value: null, at: 0 });
  const petNameRef = useRef<string | null>(null);
  const cwdRef = useRef<string | null>(null);

  // Preview has no frame stream, so the seeded note is all a fixture gets —
  // but it still has to track the prop, or switching fixtures (and the note
  // edits the fixture switcher stands in for) would never reach the window.
  useEffect(() => {
    if (!isPreview) {
      return;
    }

    setNote(normalizeNote(previewNote ?? null));
  }, [isPreview, previewNote]);

  useEffect(() => {
    let unlistenFrame: (() => void) | undefined;

    void host
      .subscribeFrame(pet.petId, (frame) => {
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
        if (frame.assetId) {
          setAssetId(frame.assetId);
        }
        if (frame.cwd !== undefined) cwdRef.current = frame.cwd || null;
        if (frame.note !== undefined) setNote(normalizeNote(frame.note));

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
                working: presentationRef.current.working,
              },
              overlay: presentationRef.current.overlay,
            },
            {
              sprite: {
                ...frame.sprite,
                activity: steadiedActivity,
                partnerName: steadiedPartnerName,
                working: frame.sprite.working ?? false,
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
            working: frame.sprite.working ?? false,
            overlay: frame.overlay,
          };
          setPresentation({
            decisionEmote: frame.sprite.decisionEmote ?? null,
            animationState: frame.sprite.animationState,
            activity: steadiedActivity,
            partnerName: steadiedPartnerName,
            working: frame.sprite.working ?? false,
            overlay: frame.overlay,
          });
        }

        // Position is not applied here: the host moves every pet window in one
        // native batch (place_pet_windows), and shows each on its first
        // placement. A frame only carries what this webview has to render.
        const frameScale = clampPetWindowScale(frame.window.width / PET_CELL_SIZE.width);
        const nextSize = petWindowSizeForScale(frameScale);
        if (
          !appliedSizeRef.current ||
          appliedSizeRef.current.width !== nextSize.width ||
          appliedSizeRef.current.height !== nextSize.height
        ) {
          appliedSizeRef.current = nextSize;
          setSpriteScale(frameScale);
          host.applyFrameSize(nextSize.width, nextSize.height);
        }
      })
      .then((unlisten) => {
        unlistenFrame = unlisten;
      });

    return () => {
      unlistenFrame?.();
    };
  }, [pet.petId, host]);

  function emitPetWindowInput(
    kind: PetWindowInputKind,
    event: React.MouseEvent<HTMLElement>,
    screenPointOverride?: { x: number; y: number },
  ) {
    const surface = visualFrameRef.current;

    if (!surface) {
      return;
    }

    const localPoint = surfacePointFromEvent(surface, event);
    inputSequenceRef.current += 1;
    const sequence = inputSequenceRef.current;

    petWindowTransport.sendInput({
      sequence,
      petId: pet.petId,
      petName: petNameRef.current ?? undefined,
      windowLabel: petWindowTransport.windowLabel(),
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
    inputSequenceRef.current += 1;
    petWindowTransport.sendInput({
      sequence: inputSequenceRef.current,
      petId: pet.petId,
      windowLabel: petWindowTransport.windowLabel(),
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
      const newScale = clampPetWindowScale(resizeStartRef.current.scale + delta / 100);

      if (!canApplyResizeScale(newScale)) {
        return;
      }

      const nextSize = petWindowSizeForScale(newScale);
      appliedSizeRef.current = nextSize;
      resizeAppliedScaleRef.current = newScale;
      setSpriteScale(newScale);
      host.applyFrameSize(nextSize.width, nextSize.height);
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

    const nextResizeAffordanceHovered = hit.kind === "body" || hit.kind === "resize";
    if (nextResizeAffordanceHovered !== isResizeHoveredRef.current) {
      isResizeHoveredRef.current = nextResizeAffordanceHovered;
      setIsResizeAffordanceHovered(nextResizeAffordanceHovered);
    }

    host.setCursorPassthrough(hit.kind === "transparent");
  }

  function startResize(event: React.PointerEvent<HTMLElement>) {
    event.preventDefault();

    if (!canApplyResizeScale(spriteScale)) {
      isResizingRef.current = false;
      resizeStartRef.current = null;
      resizeAppliedScaleRef.current = null;
      pointerStartRef.current = null;
      host.setCursorPassthrough(false);
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
    host.setCursorPassthrough(false);
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
    // Everything but transparent space starts a gesture the surface holds
    // until the pointer is released, wherever the pointer travels meanwhile.
    host.notifyCapture(hit.kind !== "transparent");

    if (hit.kind === "body") {
      bodyDownRef.current = { screenX: event.screenX, screenY: event.screenY };
      setInteractionStatus("Direct manipulation");
      dragPauseUntilRef.current = Date.now() + 1200;
      emitPetWindowInput("body.pointer.down", event);
      host.setCursorPassthrough(false);
      if (isPositionDrivenRef.current) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } else {
        host.startDrag();
      }
      return;
    }

    if (hit.kind === "resize") {
      startResize(event);
      return;
    }

    if (hit.kind === "overlay") {
      setInteractionStatus("Overlay armed");
      host.setCursorPassthrough(false);
      return;
    }

    host.setCursorPassthrough(true);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const surface = visualFrameRef.current;
    const pointerStart = pointerStartRef.current;

    pointerStartRef.current = null;
    host.notifyCapture(false);

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
      petWindowTransport.sendResize({
        petId: pet.petId,
        scale: finalScale,
      });
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
        const moved = Math.hypot(event.screenX - down.screenX, event.screenY - down.screenY);
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

    host.setCursorPassthrough(hit.kind === "transparent");
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
      host.setCursorPassthrough(true);
      return;
    }

    event.preventDefault();
    pointerStartRef.current = null;
    host.setCursorPassthrough(false);

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

  function handlePointerLeave() {
    if (isBodyHoveredRef.current) {
      isBodyHoveredRef.current = false;
      setIsBodyHovered(false);
    }

    if (isResizeHoveredRef.current) {
      isResizeHoveredRef.current = false;
      setIsResizeAffordanceHovered(false);
    }

    if (pointerStartRef.current === "body" || pointerStartRef.current === "resize") {
      host.setCursorPassthrough(false);
      return;
    }

    host.notifyCapture(false);
    host.setCursorPassthrough(true);
  }

  return {
    surfaceRef,
    visualFrameRef,
    presentation,
    spriteScale,
    petName,
    assetId,
    note,
    cwdRef,
    interactionStatus,
    isBodyHovered,
    isResizeAffordanceHovered,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handleContextMenu,
    startResize,
  };
}
