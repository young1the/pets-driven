import { useEffect } from "react";
import type { PetWindowInputKind } from "@/pet-window/pet-window-messages";
import { petWindowTransport } from "@/pet-window/pet-window-transport";

/**
 * The keys the engine steers a pet with, exactly the codes `keyboardVector` in
 * the interaction systems reads. Horizontal only: a steered pet walks the floor
 * and leaves it by jumping, never by being pushed upward. Everything else is
 * left to the surface (and to the rest of the desktop) untouched.
 */
const PET_CONTROL_CODES = new Set(["KeyA", "KeyD", "ArrowLeft", "ArrowRight"]);

/**
 * The jump. Relayed on its edge like a direction so the surface stops the page
 * scrolling under the pet, but it is a one-shot the engine turns into a jump
 * request — there is no key-up to send and nothing is held between presses.
 */
const JUMP_CODE = "Space";

/** The key that hands a held pet back to itself. Mirrors the engine's. */
const RELEASE_CODE = "Escape";

export function isPetControlCode(code: string) {
  return PET_CONTROL_CODES.has(code);
}

/**
 * Relay this window's control keys to the host so the pet it selected can be
 * driven by hand.
 *
 * Mounted once per OS window, never once per pet: which pet moves is the
 * engine's `KeyboardControlTarget` — set by the last press on a controllable
 * entity — so a key press names no pet, only the world it belongs to. A
 * per-pet overlay says which world by sending its own pet id; the single-window
 * overlay holds adopted pets alone and sends none.
 *
 * A pet is the user's from the press that picked it up until it is let go, so
 * the release is relayed too: Escape while the window still has focus, and the
 * loss of focus itself — clicking into an editor, another pet, the desktop —
 * for every other way of walking away. That second one is not a nicety. A
 * surface that has lost focus never hears the key-ups for what was held, and a
 * pet left holding a direction it can no longer be told to stop would run at a
 * wall until something else released it.
 */
export function usePetWindowKeyboardControl(petId: string) {
  useEffect(() => {
    const held = new Set<string>();
    let sequence = 0;

    function send(kind: PetWindowInputKind, key?: string, code?: string) {
      sequence += 1;
      void petWindowTransport.sendInput({
        sequence,
        petId,
        windowLabel: petWindowTransport.windowLabel(),
        pointerId: 0,
        kind,
        key,
        code,
        localPoint: { x: 0, y: 0 },
        screenPoint: { x: 0, y: 0 },
        at: Date.now(),
      });
    }

    // One signal for every key-up this window will never hear, and for the pet
    // it was holding. The engine reads it as both, and it is sent whether or
    // not a key was down: clicking away from a pet standing still is the
    // ordinary way of letting it go.
    function releaseControl() {
      held.clear();
      send("body.key.blur");
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Relayed as the key it is, not as a blur: the engine reads Escape as
      // "let go of whoever is held", which is not quite the same question as
      // "did this window stop hearing keys".
      if (event.code === RELEASE_CODE) {
        held.clear();
        send("body.key.down", event.key, event.code);
        return;
      }

      // The jump is an edge and nothing more — no key-up follows it and it never
      // joins `held` — so leaning on Space is one jump rather than a hover, and
      // the engine's own landing cooldown decides when the next one is allowed.
      // preventDefault regardless: Space scrolls the surface out from under the
      // pet exactly like the arrows do.
      if (event.code === JUMP_CODE) {
        event.preventDefault();
        if (!event.repeat) {
          send("body.key.down", event.key, event.code);
        }
        return;
      }

      if (!isPetControlCode(event.code)) {
        return;
      }

      // Arrows scroll the surface out from under the pet otherwise.
      event.preventDefault();

      // The engine holds the pressed codes in a set and steers off that, so it
      // wants the edge and nothing after it: auto-repeat is already covered by
      // the key still being held.
      if (event.repeat || held.has(event.code)) {
        return;
      }

      held.add(event.code);
      send("body.key.down", event.key, event.code);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (!isPetControlCode(event.code)) {
        return;
      }

      event.preventDefault();

      if (!held.delete(event.code)) {
        return;
      }

      send("body.key.up", event.key, event.code);
    }

    let unlistenBlur: (() => void) | undefined;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseControl);
    void petWindowTransport.subscribeWindowBlur(releaseControl).then((unlisten) => {
      unlistenBlur = unlisten;
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseControl);
      unlistenBlur?.();
      releaseControl();
    };
  }, [petId]);
}
