import { IconButton } from "@pets-driven/design-system";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { useEffect } from "react";
import { PetConnectNoticeView } from "@/pet-window/pet-connect-notice";
import type { PetSurfaceHost } from "@/pet-window/pet-surface-host";
import type { PetWindowFixturePresentation } from "@/pet-window/pet-window-fixtures";
import { PET_WINDOW_BUBBLE_OVERHEAD, PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import { PetWindowSprite } from "@/pet-window/pet-window-sprite";
import { PetWindowStatus } from "@/pet-window/pet-window-status";
import { petWindowTransport } from "@/pet-window/pet-window-transport";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { usePetWindowConnectNotice } from "@/pet-window/use-pet-window-connect-notice";
import { usePetWindowNote } from "@/pet-window/use-pet-window-note";
import { usePetWindowSpritesheet } from "@/pet-window/use-pet-window-spritesheet";
import { usePetWindowSurface } from "@/pet-window/use-pet-window-surface";

/**
 * The parts of a pet that answer a pointer, as transparent boxes over its frame.
 *
 * Only for a pet that shares a window. In its own window everything around the
 * pet is transparent *desktop* — the window hands the mouse back through it, so
 * a click there reaches whatever is behind and nothing has to say where the pet
 * ends. Inside one shared window there is no handing back: an element takes a
 * click or it does not, so the pet in front would swallow every click aimed at
 * the pet behind it through the empty margin around its sprite. These name the
 * same three rects `classifyPetWindowPoint` classifies and the host hit-tests,
 * and the rest of the frame is left to whoever is underneath.
 */
function PetSurfaceHitShims({ hasOverlay }: { hasOverlay: boolean }) {
  const rects = [
    PET_WINDOW_LAYOUT.body,
    hasOverlay ? PET_WINDOW_LAYOUT.overlay : null,
    PET_WINDOW_LAYOUT.resize,
  ];

  return (
    <>
      {rects.map((rect, index) =>
        rect ? (
          <span
            aria-hidden="true"
            className="pet-window-hit-shim"
            // biome-ignore lint/suspicious/noArrayIndexKey: the three rects are a fixed list in a fixed order, so the index is their identity.
            key={index}
            style={{
              left: `${(rect.x / PET_WINDOW_LAYOUT.width) * 100}%`,
              top: `${(rect.y / PET_WINDOW_LAYOUT.height) * 100}%`,
              width: `${(rect.width / PET_WINDOW_LAYOUT.width) * 100}%`,
              height: `${(rect.height / PET_WINDOW_LAYOUT.height) * 100}%`,
              cursor: rect === PET_WINDOW_LAYOUT.resize ? "nwse-resize" : undefined,
            }}
          />
        ) : null,
      )}
    </>
  );
}

type PetWindowViewProps = {
  pet: PetWindowRouteParams;
  /**
   * Browser-fixture only: seeds the presentation/scale that would otherwise
   * arrive from the Tauri PET_WINDOW_FRAME_EVENT stream, which doesn't exist
   * outside the real app. Ignored when running inside Tauri.
   */
  previewPresentation?: PetWindowFixturePresentation;
  previewScale?: number;
  /**
   * Browser-fixture only: seeds the terminal-binding notice pill, which in the
   * real app is driven by Tauri PET_WINDOW_BINDING_EVENT. Ignored inside Tauri.
   */
  previewConnectNotice?: { text: string; transient: boolean };
  /**
   * Browser-fixture only: seeds the pet's note, which in the real app rides the
   * Tauri frame stream. Ignored inside Tauri.
   */
  previewNote?: string;
  /**
   * Who owns the surface. Left out, the pet owns its OS window and sizes it,
   * drags it and hands the mouse back through it; the single-window overlay
   * passes its own host, which absorbs all three.
   */
  host?: PetSurfaceHost;
  /**
   * `shared` fits the pet to the box its parent gives it instead of to the
   * window, for the overlay that draws several of them side by side. It also
   * leaves the document alone — the overlay root owns those classes, and one
   * pet unmounting must not strip them off the others.
   */
  layout?: "own-window" | "shared";
};

/**
 * A single pet overlay window. Presentation only: it composes the surface
 * behavior (usePetWindowSurface), the spritesheet URL and the connect notice,
 * then renders the pet's sprite, status capsule and affordances from that
 * state. All imperative work lives in the hooks it consumes.
 */
export function PetWindowView({
  pet,
  previewPresentation,
  previewScale,
  previewConnectNotice,
  previewNote,
  host,
  layout = "own-window",
}: PetWindowViewProps) {
  const isPreview = !petWindowTransport.isDesktopRuntime();
  const { connectNotice, dismissConnectNotice } = usePetWindowConnectNotice({
    petId: pet.petId,
    isPreview,
    previewConnectNotice,
  });
  const {
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
  } = usePetWindowSurface({ pet, isPreview, previewPresentation, previewScale, previewNote, host });
  // Not `pet.assetId`: the surface starts from it but lets the host's frames
  // re-skin the pet mid-life, which the window's fixed URL cannot express.
  const spritesheetUrl = usePetWindowSpritesheet(assetId);
  // The engine owns the card's single message line, so a pet only recites its
  // note while it has nothing of its own to say.
  const { isSpeaking: isSpeakingNote } = usePetWindowNote({
    note,
    isQuiet: presentation.overlay === null && !presentation.working,
  });

  useEffect(() => {
    if (layout === "shared") {
      return;
    }

    document.documentElement.classList.add("pet-window-document");
    if (isPreview) {
      document.documentElement.classList.add("pet-window-fixture-preview");
    }

    return () => {
      document.documentElement.classList.remove("pet-window-document");
      document.documentElement.classList.remove("pet-window-fixture-preview");
    };
  }, [isPreview, layout]);

  return (
    <main
      aria-label={`Pet Window ${pet.petId}`}
      className={`pet-window-surface${layout === "shared" ? " pet-window-surface--shared" : ""}${isResizeAffordanceHovered ? " pet-window-surface--resize-visible" : ""}`}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      ref={surfaceRef}
    >
      <span
        className="pet-window-visual-frame"
        ref={visualFrameRef}
        style={{
          height: `${(PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD) * spriteScale}px`,
          width: `${PET_CELL_SIZE.width * spriteScale}px`,
        }}
      >
        {spritesheetUrl ? (
          <PetWindowSprite
            alt={`Pet Sprite ${pet.petId}`}
            animationState={presentation.animationState}
            decisionEmote={presentation.decisionEmote}
            imageUrl={spritesheetUrl}
            overlay={presentation.overlay}
            showStatusBubble={false}
            size={PET_CELL_SIZE}
            scale={spriteScale}
            style={{ marginTop: PET_WINDOW_BUBBLE_OVERHEAD * spriteScale }}
          />
        ) : null}
        {petName !== null ? (
          <PetWindowStatus
            activity={presentation.activity}
            partnerName={presentation.partnerName}
            animationState={presentation.animationState}
            working={presentation.working}
            carrying={presentation.carrying}
            cwd={isBodyHovered ? cwdRef.current : null}
            hasNote={note !== null}
            // Hovering the pet is the same "tell me more" gesture that reveals
            // the working folder, so it also opens the note the badge promises.
            note={isSpeakingNote || isBodyHovered ? note : null}
            name={petName}
            overlay={presentation.overlay}
            scale={spriteScale}
            spriteHeight={PET_CELL_SIZE.height * spriteScale}
          />
        ) : null}
        <PetConnectNoticeView
          notice={connectNotice}
          onDismiss={dismissConnectNotice}
          scale={spriteScale}
        />
        {layout === "shared" ? (
          <PetSurfaceHitShims hasOverlay={presentation.overlay !== null} />
        ) : null}
        <IconButton
          className="pet-window-resize-button"
          label="Resize pet"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            event.stopPropagation();
            startResize(event);
          }}
          size="sm"
          variant="soft"
        >
          <span aria-hidden="true" className="pet-window-resize-button__mark" />
        </IconButton>
      </span>
      {interactionStatus ? (
        <span className="pet-window-status" role="status">
          {interactionStatus}
        </span>
      ) : null}
    </main>
  );
}
