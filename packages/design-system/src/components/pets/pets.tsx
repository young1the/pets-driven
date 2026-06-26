import catoUrl from "../../assets/pets/cato.png";
import ottoUrl from "../../assets/pets/otto.png";
import mochiUrl from "../../assets/pets/mochi.png";
import fennUrl from "../../assets/pets/fenn.png";
import bloopUrl from "../../assets/pets/bloop.png";
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

/** Soft background tint behind each pet, by pet. */
export const PET_TINTS: Record<PetName, string> = {
  cato: "var(--lavender-100)",
  otto: "var(--butter-100)",
  mochi: "var(--blossom-100)",
  fenn: "var(--coral-100)",
  bloop: "var(--mint-100)",
  pip: "var(--sky-100)",
};

/** Status-ring color for each pet. */
export const PET_RINGS: Record<PetName, string> = {
  cato: "var(--lavender-300)",
  otto: "var(--butter-300)",
  mochi: "var(--blossom-300)",
  fenn: "var(--coral-300)",
  bloop: "var(--mint-300)",
  pip: "var(--sky-300)",
};
