import { PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import type { PetWindowHitLayout } from "@/pet-window/pet-window-types";

export const PET_WINDOW_LAYOUT: PetWindowHitLayout = {
  width: PET_CELL_SIZE.width,
  height: PET_CELL_SIZE.height,
  body: { x: 18, y: 34, width: 156, height: 156 },
  overlay: { x: 54, y: 12, width: 84, height: 28 },
};
