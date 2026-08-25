import bloopUrl from "../../assets/pets/bloop.webp";
import catoUrl from "../../assets/pets/cato.webp";
import fennUrl from "../../assets/pets/fenn.webp";
import mochiUrl from "../../assets/pets/mochi.webp";
import ottoUrl from "../../assets/pets/otto.webp";
import pipUrl from "../../assets/pets/pip.webp";

/**
 * The six starter pets, rendered from the Codex-ready generated pet set.
 * These are idle-frame portraits derived from the full pet spritesheets.
 *
 * WebP, not PNG: the six portraits together are 40 KB as WebP against 210 KB
 * as lossless PNG, and every surface that renders them (the browser landing
 * page and the Tauri WebView2 shell) decodes WebP.
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
