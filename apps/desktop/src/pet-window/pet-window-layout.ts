import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { PetWindowHitLayout } from "@/pet-window/pet-window-types";

/** Transparent space above the sprite reserved for the speech bubble. */
export const PET_WINDOW_BUBBLE_OVERHEAD = 60;

export const PET_WINDOW_RESIZE_HANDLE_SIZE = 32;

export const PET_WINDOW_LAYOUT: PetWindowHitLayout = {
  width: PET_CELL_SIZE.width,
  height: PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD,
  body: { x: 18, y: 34 + PET_WINDOW_BUBBLE_OVERHEAD, width: 156, height: 156 },
  overlay: { x: 16, y: 8, width: 160, height: 52 },
  resize: {
    x: PET_CELL_SIZE.width - PET_WINDOW_RESIZE_HANDLE_SIZE,
    y: PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD - PET_WINDOW_RESIZE_HANDLE_SIZE,
    width: PET_WINDOW_RESIZE_HANDLE_SIZE,
    height: PET_WINDOW_RESIZE_HANDLE_SIZE,
  },
};
