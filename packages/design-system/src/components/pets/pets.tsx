import bloopUrl from "../../assets/pets/bloop.png";
import catoUrl from "../../assets/pets/cato.png";
import fennUrl from "../../assets/pets/fenn.png";
import mochiUrl from "../../assets/pets/mochi.png";
import ottoUrl from "../../assets/pets/otto.png";
import pipUrl from "../../assets/pets/pip.png";

/**
 * The six starter pets, rendered from the Codex-ready generated pet set.
 * These are idle-frame portraits derived from the full pet spritesheets.
 */

export type PetName = "cato" | "otto" | "mochi" | "fenn" | "bloop" | "pip";
export type PetImageSource = string | { src: string };

export const PETS: Record<PetName, PetImageSource> = {
  cato: catoUrl,
  otto: ottoUrl,
  mochi: mochiUrl,
  fenn: fennUrl,
  bloop: bloopUrl,
  pip: pipUrl,
};
