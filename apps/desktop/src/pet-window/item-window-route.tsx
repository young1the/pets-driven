import type { PetItemKind } from "@pets-driven/pet-engine/features/items/components";
import {
  presentWorldItem,
  WORLD_ITEM_PRESENTATION,
} from "@pets-driven/pet-engine/features/items/item-presentation";
import type { WorldPropKind } from "@pets-driven/pet-engine/features/props/components";
import {
  presentWorldProp,
  WORLD_PROP_PRESENTATION,
} from "@pets-driven/pet-engine/features/props/prop-presentation";
import { useEffect, useRef } from "react";
import { BALL_ART_RENDERED_RADIUS_PX, ballArtDataUri, rollRotation } from "@/artwork/prop-artwork";
import { petWindowTransport } from "@/pet-window/pet-window-transport";

/**
 * The overlay for a non-pet entity: one tiny always-on-top window per trinket
 * or prop.
 *
 * It renders straight from its own URL and never subscribes to the frame
 * stream. Neither kind has anything to animate from the simulation — a trinket
 * does not move at all, and a prop's movement is its window's *position*, which
 * the host settles natively (sync_item_windows) rather than paying a
 * cross-webview emit per entity per tick the way pets do.
 */

export type ItemWindowKind = PetItemKind | WorldPropKind;

export type ItemWindowRouteParams = {
  itemId: string;
  kind: ItemWindowKind;
};

function isItemWindowKind(value: string | null): value is ItemWindowKind {
  return value !== null && (value in WORLD_ITEM_PRESENTATION || value in WORLD_PROP_PRESENTATION);
}

function isPropKind(kind: ItemWindowKind): kind is WorldPropKind {
  return kind in WORLD_PROP_PRESENTATION;
}

/** The accessible name, whichever family the kind belongs to. */
function itemWindowLabel(kind: ItemWindowKind): string {
  return isPropKind(kind)
    ? presentWorldProp(kind).label
    : presentWorldItem(kind as PetItemKind).label;
}

/** Resolve the entity a URL asks for, or null when it addresses another surface. */
export function itemWindowRouteParams(search: string): ItemWindowRouteParams | null {
  const params = new URLSearchParams(search);
  if (params.get("surface") !== "item-window") {
    return null;
  }

  const kind = params.get("kind");
  if (!isItemWindowKind(kind)) {
    return null;
  }

  return { itemId: params.get("itemId") ?? "", kind };
}

export function ItemWindowSurface({ item }: { item: ItemWindowRouteParams }) {
  const label = itemWindowLabel(item.kind);
  // A prop gets neither the halo nor the bob. Both say "come and collect me",
  // which is true of a trinket and false of a ball — and the bob in particular
  // would have the artwork drifting up and down inside a window whose position
  // is already being driven by the physics body underneath it.
  const isProp = isPropKind(item.kind);
  const sequenceRef = useRef(0);
  const artRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // The design-system base paints the body; an overlay window must stay
    // fully transparent. Same trick the pet window uses.
    document.documentElement.classList.add("item-window-document");
    return () => {
      document.documentElement.classList.remove("item-window-document");
    };
  }, []);

  /**
   * Roll the ball, from nothing but how far its own window moved.
   *
   * The host has the true rotation — it is right there in the snapshot — but no
   * way to hand it over that this window would want: a prop overlay renders
   * from its URL and subscribes to nothing, and opening a per-prop frame stream
   * to carry one number would cost a cross-webview emit every tick a ball
   * rolls (measured: 318 a minute for a single ball, and linear in how many are
   * out). None of that is needed. A ball rolling without slipping turns
   * `distance / radius`, and the distance is something this window can read off
   * itself — the host is already moving it natively, so `window.screenX`
   * changes on its own. A DOM read in an animation frame, and no IPC at all.
   *
   * Writing the transform straight to the node rather than through state: this
   * runs at frame rate, and React has nothing to say about a number that only
   * ever lands in one style property.
   *
   * If `screenX` turns out not to track a natively-moved window on some
   * platform, the ball simply does not spin — which is exactly where it stood
   * before this existed. There is no worse failure mode to guard against.
   */
  useEffect(() => {
    if (!isProp) return;

    let frame = 0;
    let lastScreenX: number | null = null;
    let radians = 0;

    const step = () => {
      const screenX = window.screenX;
      if (lastScreenX !== null && screenX !== lastScreenX) {
        radians = rollRotation(radians, screenX - lastScreenX, BALL_ART_RENDERED_RADIUS_PX);
        if (artRef.current) {
          artRef.current.style.transform = `rotate(${radians}rad)`;
        }
      }
      lastScreenX = screenX;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isProp]);

  /**
   * Hand a pointer event to the host, which projects it into the world.
   *
   * This is the whole of prop dragging on the desktop. Nothing here knows what
   * a drag is: the engine hit-tests the pointer's *world position* against the
   * entities holding `CanDrag`, which is the same path that picks up and throws
   * a pet, so the ball follows the cursor and a flick launches it without a
   * line of drag code on this side.
   *
   * Screen coordinates, not window-local ones, because the window is moving
   * underneath the cursor while the drag is live — the host repositions it
   * every tick to follow the body. A local point would be measured against a
   * frame that has already shifted.
   */
  function sendPointer(kind: "down" | "move" | "up", event: React.PointerEvent<HTMLElement>) {
    sequenceRef.current += 1;
    void petWindowTransport
      .sendInput({
        sequence: sequenceRef.current,
        petId: item.itemId,
        entity: "prop",
        windowLabel: petWindowTransport.windowLabel(),
        pointerId: event.pointerId,
        kind: `body.pointer.${kind}`,
        localPoint: { x: event.clientX, y: event.clientY },
        screenPoint: { x: event.screenX, y: event.screenY },
        button: event.button,
        // Diagnostic for the open placement drift (see apps/desktop/AGENTS.md):
        // where this window actually is. The host only knows where it *asked*
        // for the window to go, so if the OS put it somewhere else this is the
        // only place that can say so.
        note: `win=${window.screenX},${window.screenY} inner=${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`,
        at: Date.now(),
      })
      .catch((error) => {
        console.error("[prop-window] input emit failed", error);
      });
  }

  /**
   * Whether a press landed on the ball rather than the square corners around
   * it, decided here in the window's own coordinates.
   *
   * This is the hit test, and this is the only place it can be exact: the
   * drawing is centred in the window at a radius this file sets, so the answer
   * is arithmetic. The host is told *which entity* was pressed rather than
   * where, precisely so it never has to re-derive this from a screen
   * coordinate — the same division of labour the pet surface already has, where
   * `classifyPetWindowPoint` decides "body" before anything is sent.
   */
  function isOnTheBall(event: React.PointerEvent<HTMLElement>): boolean {
    const box = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    return Math.hypot(dx, dy) <= BALL_ART_RENDERED_RADIUS_PX;
  }

  const propHandlers = isProp
    ? {
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
          if (!isOnTheBall(event)) return;
          // Without capture the drag dies the instant the cursor leaves this
          // 64px window, which a throw does immediately.
          event.currentTarget.setPointerCapture?.(event.pointerId);
          sendPointer("down", event);
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => sendPointer("move", event),
        onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
          sendPointer("up", event);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        },
      }
    : {};

  return (
    <div
      className={isProp ? "item-window item-window--prop" : "item-window"}
      role="img"
      aria-label={label}
      {...propHandlers}
    >
      {isProp ? (
        // `draggable={false}` is load-bearing, not tidiness: an image element
        // is natively draggable, so grabbing the ball started an image
        // drag-out and the shell offered to download the artwork instead of
        // the pet's toy moving. The CSS carries `-webkit-user-drag: none`
        // alongside it — the two together are what actually close it in a
        // Chromium webview.
        //
        // A data URI rather than inline SVG markup, because the drawing carries
        // element ids (its gradient and clip path) and a document is allowed
        // one of each; an <img> gives it its own document, so a second prop
        // window cannot collide with this one's defs. It also keeps one source
        // of truth: the playground canvas draws this exact string.
        <img
          alt=""
          className="item-window__art"
          draggable={false}
          ref={artRef}
          src={ballArtDataUri()}
        />
      ) : (
        <>
          <span className="item-window__halo" />
          <span className="item-window__glyph">
            {presentWorldItem(item.kind as PetItemKind).glyph}
          </span>
        </>
      )}
    </div>
  );
}
