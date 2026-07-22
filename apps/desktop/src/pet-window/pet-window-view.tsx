import { IconButton } from "@pets-driven/design-system";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { useEffect } from "react";
import { PetConnectNoticeView } from "@/pet-window/pet-connect-notice";
import type { PetWindowFixturePresentation } from "@/pet-window/pet-window-fixtures";
import { PET_WINDOW_BUBBLE_OVERHEAD } from "@/pet-window/pet-window-layout";
import { PetWindowSprite } from "@/pet-window/pet-window-sprite";
import { PetWindowStatus } from "@/pet-window/pet-window-status";
import { petWindowTransport } from "@/pet-window/pet-window-transport";
import type { PetWindowRouteParams } from "@/pet-window/pet-window-types";
import { usePetWindowConnectNotice } from "@/pet-window/use-pet-window-connect-notice";
import { usePetWindowSpritesheet } from "@/pet-window/use-pet-window-spritesheet";
import { usePetWindowSurface } from "@/pet-window/use-pet-window-surface";

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
}: PetWindowViewProps) {
  const isPreview = !petWindowTransport.isDesktopRuntime();
  const spritesheetUrl = usePetWindowSpritesheet(pet.assetId);
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
  } = usePetWindowSurface({ pet, isPreview, previewPresentation, previewScale });

  useEffect(() => {
    document.documentElement.classList.add("pet-window-document");
    if (isPreview) {
      document.documentElement.classList.add("pet-window-fixture-preview");
    }

    return () => {
      document.documentElement.classList.remove("pet-window-document");
      document.documentElement.classList.remove("pet-window-fixture-preview");
    };
  }, [isPreview]);

  return (
    <main
      aria-label={`Pet Window ${pet.petId}`}
      className={`pet-window-surface${isResizeAffordanceHovered ? " pet-window-surface--resize-visible" : ""}`}
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
            cwd={isBodyHovered ? cwdRef.current : null}
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
