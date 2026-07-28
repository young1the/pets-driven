import { useEffect, useMemo, useRef, useState } from "react";
import { type PetOverlayFrame, petOverlayFrameOffset } from "@/pet-window/pet-overlay-messages";
import type { PetSurfaceHost } from "@/pet-window/pet-surface-host";
import { isFreshPetWindowMessage, type PetWindowFrame } from "@/pet-window/pet-window-messages";
import { petWindowTransport, type Unsubscribe } from "@/pet-window/pet-window-transport";
import type { PetWindowRect, PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { PetWindowView } from "@/pet-window/pet-window-view";

const EMPTY_BOUNDS: PetWindowRect = { x: 0, y: 0, width: 0, height: 0 };

/** Write a pet's box straight onto its element — see the note on the component. */
function applyPetPlacement(node: HTMLElement, frame: PetWindowFrame, bounds: PetWindowRect) {
  const offset = petOverlayFrameOffset(frame, bounds);

  node.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;
  node.style.width = `${offset.width}px`;
  node.style.height = `${offset.height}px`;
}

/** One pet's identity in the overlay. Its look rides the frames, like a name. */
type PetOverlayMember = PetWindowRouteParams;

/**
 * Fans one overlay frame out to the pets inside it, and remembers each pet's
 * last frame.
 *
 * A pet subscribes from an effect, so it is always at least one frame late to
 * its own arrival — in window-per-pet mode it simply waits for the host's next
 * heartbeat, but here the roster and the frames come through the same event, so
 * the frame that *introduced* a pet is the one it would miss. Replaying the
 * last frame on subscribe closes that gap and a new pet is drawn correctly on
 * its first paint instead of half a second later.
 */
function createPetFrameRouter() {
  const handlers = new Map<string, Set<(frame: PetWindowFrame) => void>>();
  const lastFrames = new Map<string, PetWindowFrame>();

  return {
    dispatch(frame: PetWindowFrame) {
      lastFrames.set(frame.petId, frame);

      for (const handler of handlers.get(frame.petId) ?? []) {
        handler(frame);
      }
    },

    forget(petId: string) {
      handlers.delete(petId);
      lastFrames.delete(petId);
    },

    subscribe(petId: string, handler: (frame: PetWindowFrame) => void): Unsubscribe {
      const petHandlers = handlers.get(petId) ?? new Set();
      petHandlers.add(handler);
      handlers.set(petId, petHandlers);

      const lastFrame = lastFrames.get(petId);
      if (lastFrame) {
        handler(lastFrame);
      }

      return () => {
        petHandlers.delete(handler);
      };
    },
  };
}

/**
 * Every pet on one desktop-wide window.
 *
 * The counterpart to `PetWindowSurface`: the same `PetWindowView` per pet, but
 * positioned inside a shared document instead of by moving an OS window. Two
 * things are deliberately kept out of React here — a pet's position and its
 * size are written straight onto its element on every frame, because at 60
 * frames a second re-rendering the roster to move it would cost more than
 * drawing it does.
 */
export function PetOverlaySurface() {
  const [pets, setPets] = useState<PetOverlayMember[]>([]);
  const routerRef = useRef(createPetFrameRouter());
  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const placementsRef = useRef(new Map<string, PetWindowFrame>());
  const boundsRef = useRef<PetWindowRect>(EMPTY_BOUNDS);
  const sequenceRef = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add("pet-overlay-document");

    return () => {
      document.documentElement.classList.remove("pet-overlay-document");
    };
  }, []);

  useEffect(() => {
    const router = routerRef.current;
    const nodes = nodesRef.current;
    const placements = placementsRef.current;
    let unlisten: Unsubscribe | undefined;

    function place(petId: string, frame: PetWindowFrame) {
      placements.set(petId, frame);

      const node = nodes.get(petId);

      if (node) {
        applyPetPlacement(node, frame, boundsRef.current);
      }
    }

    function applyOverlayFrame(overlayFrame: PetOverlayFrame) {
      if (!isFreshPetWindowMessage(sequenceRef.current, overlayFrame.sequence)) {
        return;
      }

      sequenceRef.current = overlayFrame.sequence;
      boundsRef.current = overlayFrame.bounds;

      for (const frame of overlayFrame.pets) {
        place(frame.petId, frame);
        router.dispatch(frame);
      }

      // The frame is the whole roster, so it is also the answer to who has left.
      setPets((current) => {
        const next = overlayFrame.pets.map((frame, index) => ({
          petId: frame.petId,
          assetId: frame.assetId ?? "bloop",
          windowIndex: index + 1,
        }));
        const isSameRoster =
          current.length === next.length &&
          current.every((pet, index) => pet.petId === next[index]?.petId);

        if (isSameRoster) {
          return current;
        }

        for (const pet of current) {
          if (!next.some((candidate) => candidate.petId === pet.petId)) {
            router.forget(pet.petId);
            nodes.delete(pet.petId);
            placements.delete(pet.petId);
          }
        }

        return next;
      });
    }

    void petWindowTransport.subscribeOverlayFrame(applyOverlayFrame).then((stop) => {
      unlisten = stop;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // One host shared by every pet: none of them owns the window, so the requests
  // it absorbs — size, drag, passthrough — are absorbed the same way for all.
  const host = useMemo<PetSurfaceHost>(
    () => ({
      async subscribeFrame(petId, handler) {
        return routerRef.current.subscribe(petId, handler);
      },
      applyFrameSize() {
        // The pet's box is written from its frame (see `place`), and the window
        // it sits in belongs to the desktop, not to it.
      },
      startDrag() {
        // Dragging the window would take every other pet along with it. A pet
        // in the overlay is always position-driven, so this is never reached.
      },
      setCursorPassthrough() {
        // Decided by the host from the cursor's position, because a
        // click-through window is never told the pointer moved. See
        // isPetOverlayInteractive.
      },
      notifyCapture(active) {
        petWindowTransport.sendInput({
          sequence: 0,
          petId: "",
          windowLabel: petWindowTransport.windowLabel(),
          pointerId: 0,
          kind: active ? "surface.capture.start" : "surface.capture.end",
          localPoint: { x: 0, y: 0 },
          screenPoint: { x: 0, y: 0 },
          at: Date.now(),
        });
      },
    }),
    [],
  );

  return (
    <main aria-label="Pets overlay" className="pet-overlay-root">
      {pets.map((pet) => (
        <div
          className="pet-overlay-pet"
          key={pet.petId}
          ref={(node) => {
            if (!node) {
              nodesRef.current.delete(pet.petId);
              return;
            }

            nodesRef.current.set(pet.petId, node);
            // The pet mounts a frame after the one that placed it, so replay
            // that placement rather than leaving it at the origin until the
            // next tick moves it.
            const placement = placementsRef.current.get(pet.petId);
            if (placement) {
              applyPetPlacement(node, placement, boundsRef.current);
            }
          }}
        >
          <PetWindowView host={host} layout="shared" pet={pet} />
        </div>
      ))}
    </main>
  );
}
