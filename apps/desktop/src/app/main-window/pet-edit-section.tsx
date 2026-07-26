import {
  BackIcon,
  Button,
  CloseIcon,
  ExternalLinkIcon,
  FolderIcon,
  PetShowcaseCard,
  Select,
  TrashIcon,
} from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import {
  PET_ANIMATION_STATES,
  type PetAnimationState,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { useState } from "react";
import type { CodexPetPackage } from "@/app/desktop-gateway";
import { AnimatedPetPortrait } from "@/app/main-window/pet-portrait";
import { PERSONALITY_OPTIONS, personalityTitleKey } from "@/app/onboarding/personality-options";
import { PetLookStrip } from "@/app/pet-assets/pet-look-strip";

export interface PetEditView {
  id: string;
  name: string;
  assetId: string;
  role: string;
  gradient: { from: string; to: string };
  folder: string;
  cwd: string | null;
  memo: string;
  personalityId: PetPersonalityId | undefined;
}

export interface PetEditSectionProps {
  pet: PetEditView;
  /**
   * The installed Pet Assets this pet can be re-skinned to. Left out (or empty)
   * when the host has no catalog to offer, in which case the look picker is
   * replaced by a short note rather than an empty strip.
   */
  assetOptions?: CodexPetPackage[];
  onAssetId?: (assetId: string) => void;
  onName: (value: string) => void;
  onMemo: (value: string) => void;
  onPersonalityId: (value: PetPersonalityId) => void;
  onPickFolder: () => void;
  /** Reveal the pet's bound working folder in the OS file manager. */
  onOpenFolder: () => void;
  onClearFolder: () => void;
  onDelete: () => void;
  onDone: () => void;
}

const fieldLabelStyle = {
  display: "block",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-subtle)",
  marginBottom: "7px",
};

const textControlStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1.5px solid var(--border-default)",
  background: "var(--surface-card)",
  borderRadius: "14px",
  padding: "12px 14px",
  color: "var(--text-strong)",
  outline: "none",
  boxShadow: "var(--shadow-inset)",
};

export function PetEditSection({
  pet,
  assetOptions = [],
  onAssetId,
  onName,
  onMemo,
  onPersonalityId,
  onPickFolder,
  onOpenFolder,
  onClearFolder,
  onDelete,
  onDone,
}: PetEditSectionProps) {
  const { t } = useTranslation("desktop");
  const [animationState, setAnimationState] = useState<PetAnimationState>("idle");
  const previewNote = pet.memo.trim().length > 0 ? pet.memo : t("common.noNote");

  return (
    <div style={{ padding: "26px 24px 48px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <Button iconLeft={<BackIcon />} onClick={onDone} size="sm" variant="neutral">
          {t("edit.back")}
        </Button>

        <div
          style={{
            display: "grid",
            // minmax(0, …) so the details column can shrink below the look
            // picker's min-content width — the picker scrolls itself.
            gridTemplateColumns: "280px minmax(0, 1fr)",
            gap: "30px",
            marginTop: "20px",
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: "8px",
            }}
          >
            <div style={{ width: "224px" }}>
              <PetShowcaseCard
                gradient={pet.gradient}
                name={pet.name}
                note={previewNote}
                portrait={
                  <AnimatedPetPortrait
                    animationState={animationState}
                    assetId={pet.assetId}
                    name={pet.name}
                  />
                }
                role={pet.role}
                cwd={pet.cwd ?? undefined}
              />

              <div style={{ marginTop: "16px" }}>
                <span style={fieldLabelStyle}>{t("edit.animation")}</span>
                <Select
                  aria-label={t("edit.animation")}
                  onChange={(event) => setAnimationState(event.target.value as PetAnimationState)}
                  options={PET_ANIMATION_STATES.map((state) => ({
                    value: state,
                    label: t(`edit.animationStates.${state}`),
                  }))}
                  size="sm"
                  value={animationState}
                />
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "12.5px",
                    color: "var(--text-muted)",
                  }}
                >
                  {t("edit.animationHint")}
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-soft)",
              borderRadius: "24px",
              boxShadow: "var(--shadow-lg)",
              padding: "26px 26px 24px",
              minWidth: 0,
            }}
          >
            <label style={{ display: "block" }}>
              <span style={fieldLabelStyle}>{t("edit.name")}</span>
              <input
                onChange={(event) => onName(event.target.value)}
                style={{
                  ...textControlStyle,
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "20px",
                }}
                value={pet.name}
              />
            </label>

            <div style={{ marginTop: "18px" }}>
              <span style={fieldLabelStyle}>{t("edit.workingFolder")}</span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1.5px solid var(--border-default)",
                  background: "var(--surface-card)",
                  borderRadius: "14px",
                  padding: "11px 12px",
                }}
              >
                <button
                  onClick={onPickFolder}
                  aria-label={t("edit.workingFolder")}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  type="button"
                >
                  <span
                    style={{
                      color: "var(--text-subtle)",
                      display: "inline-flex",
                      flex: "none",
                    }}
                  >
                    <FolderIcon size={16} />
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      color: "var(--text-strong)",
                      flex: 1,
                    }}
                  >
                    {pet.folder || t("edit.chooseFolder")}
                  </span>
                </button>
                {pet.folder && (
                  <>
                    <button
                      onClick={onOpenFolder}
                      aria-label={t("edit.openFolder")}
                      title={t("edit.openFolder")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                        border: "none",
                        background: "transparent",
                        color: "var(--text-subtle)",
                        padding: "2px",
                        cursor: "pointer",
                      }}
                      type="button"
                    >
                      <ExternalLinkIcon size={16} />
                    </button>
                    <button
                      onClick={onClearFolder}
                      aria-label={t("edit.clearFolder")}
                      title={t("edit.clearFolder")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                        border: "none",
                        background: "transparent",
                        color: "var(--text-subtle)",
                        padding: "2px",
                        cursor: "pointer",
                      }}
                      type="button"
                    >
                      <CloseIcon size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <label style={{ display: "block", marginTop: "18px" }}>
              <span style={fieldLabelStyle}>{t("edit.note")}</span>
              <textarea
                onChange={(event) => onMemo(event.target.value)}
                placeholder={t("edit.notePlaceholder")}
                rows={3}
                style={{
                  ...textControlStyle,
                  fontFamily: "var(--font-body)",
                  fontSize: "14px",
                  lineHeight: 1.5,
                  resize: "none",
                }}
                value={pet.memo}
              />
            </label>

            <div style={{ marginTop: "18px" }}>
              <span style={fieldLabelStyle}>{t("edit.look")}</span>
              {assetOptions.length > 0 ? (
                <>
                  <PetLookStrip
                    onSelect={(assetId) => onAssetId?.(assetId)}
                    packages={assetOptions}
                    selectedAssetId={pet.assetId}
                  />
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: "12.5px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {t("edit.lookHint")}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  {t("edit.lookEmpty")}
                </p>
              )}
            </div>

            <div style={{ marginTop: "18px" }}>
              <span style={fieldLabelStyle}>{t("edit.personality")}</span>
              <div role="radiogroup" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {PERSONALITY_OPTIONS.map((option) => {
                  const active = pet.personalityId === option.id;
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: styled segmented control using the ARIA radiogroup pattern; native <input type="radio"> cannot carry this custom pill styling.
                    <button
                      aria-checked={active}
                      key={option.id}
                      onClick={() => onPersonalityId(option.id)}
                      role="radio"
                      type="button"
                      style={{
                        border: active
                          ? "1.5px solid var(--color-primary)"
                          : "1.5px solid var(--border-default)",
                        background: active ? "var(--color-primary)" : "var(--surface-card)",
                        color: active ? "#fff" : "var(--text-strong)",
                        fontWeight: 700,
                        fontSize: "13px",
                        padding: "8px 14px",
                        borderRadius: "999px",
                        cursor: "pointer",
                      }}
                    >
                      {t(personalityTitleKey(option.id))}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginTop: "22px",
              }}
            >
              <button
                onClick={onDelete}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1.5px solid var(--coral-200)",
                  background: "var(--surface-card)",
                  color: "var(--coral-600)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                  fontSize: "13.5px",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
                type="button"
              >
                <TrashIcon size={16} />
                {t("edit.deletePet")}
              </button>
              <Button onClick={onDone} variant="neutral">
                {t("edit.done")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
