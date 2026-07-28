import type { PetItemKind } from "@pets-driven/pet-engine/features/items/components";
import {
  presentWorldItem,
  WORLD_ITEM_PRESENTATION,
} from "@pets-driven/pet-engine/features/items/item-presentation";
import { useEffect } from "react";

/**
 * The trinket overlay: one tiny always-on-top window per world item.
 *
 * It renders straight from its own URL and never subscribes to the frame
 * stream. A trinket has nothing to animate from the simulation — it does not
 * move once it lands, and it stops existing the moment a pet takes it — so the
 * host reconciles the whole set natively (sync_item_windows) instead of paying
 * a cross-webview emit per item per tick, the way pets do.
 */

export type ItemWindowRouteParams = {
  itemId: string;
  kind: PetItemKind;
};

function isPetItemKind(value: string | null): value is PetItemKind {
  return value !== null && value in WORLD_ITEM_PRESENTATION;
}

/** Resolve the trinket a URL asks for, or null when it addresses another surface. */
export function itemWindowRouteParams(search: string): ItemWindowRouteParams | null {
  const params = new URLSearchParams(search);
  if (params.get("surface") !== "item-window") {
    return null;
  }

  const kind = params.get("kind");
  if (!isPetItemKind(kind)) {
    return null;
  }

  return { itemId: params.get("itemId") ?? "", kind };
}

export function ItemWindowSurface({ item }: { item: ItemWindowRouteParams }) {
  const presentation = presentWorldItem(item.kind);

  useEffect(() => {
    // The design-system base paints the body; an overlay window must stay
    // fully transparent. Same trick the pet window uses.
    document.documentElement.classList.add("item-window-document");
    return () => {
      document.documentElement.classList.remove("item-window-document");
    };
  }, []);

  return (
    <div className="item-window" role="img" aria-label={presentation.label}>
      <span className="item-window__halo" />
      <span className="item-window__glyph">{presentation.glyph}</span>
    </div>
  );
}
