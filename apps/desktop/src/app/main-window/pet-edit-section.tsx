import {
  BackIcon,
  Button,
  FolderIcon,
  PetShowcaseCard,
  Switch,
  TrashIcon,
} from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { PetPortrait } from "@/app/main-window/pet-portrait";
import {
  PERSONALITY_OPTIONS,
  personalityTitleKey,
} from "@/app/onboarding/personality-options";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

export interface PetEditView {
  id: string;
  name: string;
  assetId: string;
  role: string;
  gradient: { from: string; to: string };
  folder: string;
  cwd: string | null;
  memo: string;
  deployed: boolean;
  personalityId: PetPersonalityId | undefined;
}

export interface PetEditSectionProps {
  pet: PetEditView;
  onName: (value: string) => void;
  onMemo: (value: string) => void;
  onPersonalityId: (value: PetPersonalityId) => void;
  onPickFolder: () => void;
  onToggleDeployed: () => void;
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
  onName,
  onMemo,
  onPersonalityId,
  onPickFolder,
  onToggleDeployed,
  onDelete,
  onDone,
}: PetEditSectionProps) {
  const { t } = useTranslation("desktop");
  const previewNote =
    pet.memo.trim().length > 0 ? pet.memo : t("common.noNote");

  return (
    <div style={{ padding: "26px 24px 48px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <Button
          iconLeft={<BackIcon />}
          onClick={onDone}
          size="sm"
          variant="neutral"
        >
          {t("edit.back")}
        </Button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
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
                portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
                role={pet.role}
                cwd={pet.cwd ?? undefined}
              />
            </div>
          </div>

          <div
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-soft)",
              borderRadius: "24px",
              boxShadow: "var(--shadow-lg)",
              padding: "26px 26px 24px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-subtle)",
              }}
            >
              {t("edit.details")}
            </span>

            <label style={{ display: "block", marginTop: "14px" }}>
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
              <button
                onClick={onPickFolder}
                aria-label={t("edit.workingFolder")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  border: "1.5px solid var(--border-default)",
                  background: "var(--surface-card)",
                  borderRadius: "14px",
                  padding: "11px 12px",
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
            </div>

            <div style={{ marginTop: "18px" }}>
              <span style={fieldLabelStyle}>{t("edit.personality")}</span>
              <div
                role="radiogroup"
                style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
              >
                {PERSONALITY_OPTIONS.map((option) => {
                  const active = pet.personalityId === option.id;
                  return (
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
                        background: active
                          ? "var(--color-primary)"
                          : "var(--surface-card)",
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

            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                background: "var(--surface-sunken)",
                borderRadius: "14px",
              }}
            >
              <Switch
                checked={pet.deployed}
                onChange={onToggleDeployed}
                size="sm"
                className="pd-edit-deploy-toggle"
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "14px",
                      color: "var(--text-strong)",
                    }}
                  >
                    {t("edit.showOnDesktop")}
                  </div>
                  <div
                    style={{ fontSize: "12.5px", color: "var(--text-muted)" }}
                  >
                    {t("edit.showOnDesktopHint")}
                  </div>
                </div>
              </Switch>
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
