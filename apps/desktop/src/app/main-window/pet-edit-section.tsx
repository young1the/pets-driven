import { Button, PetShowcaseCard, Switch } from "@pets-driven/design-system";
import type { PetCardStatus } from "@/app-state/pet-card-status";
import { PetPortrait } from "@/app/main-window/pet-portrait";
import {
  BackIcon,
  FolderIcon,
  TrashIcon,
} from "@/app/main-window/main-window-icons";

export interface PetEditView {
  id: string;
  name: string;
  assetId: string;
  role: string;
  status: PetCardStatus;
  gradient: { from: string; to: string };
  folder: string;
  memo: string;
  deployed: boolean;
}

export interface PetEditSectionProps {
  pet: PetEditView;
  onName: (value: string) => void;
  onMemo: (value: string) => void;
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
  onPickFolder,
  onToggleDeployed,
  onDelete,
  onDone,
}: PetEditSectionProps) {
  const previewNote =
    pet.memo.trim().length > 0 ? pet.memo : "No note yet";

  return (
    <div style={{ padding: "26px 24px 48px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <Button
          iconLeft={<BackIcon />}
          onClick={onDone}
          size="sm"
          variant="neutral"
        >
          Back to the pack
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
                featured
                gradient={pet.gradient}
                name={pet.name}
                note={previewNote}
                portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
                role={pet.role}
                status={{
                  label: pet.status.label,
                  dotColor: pet.status.dotColor,
                }}
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
              Pet details
            </span>

            <label style={{ display: "block", marginTop: "14px" }}>
              <span style={fieldLabelStyle}>Name</span>
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
              <span style={fieldLabelStyle}>Working folder</span>
              <button
                onClick={onPickFolder}
                aria-label="Working folder"
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
                  {pet.folder || "Choose a folder…"}
                </span>
              </button>
            </div>

            <label style={{ display: "block", marginTop: "18px" }}>
              <span style={fieldLabelStyle}>Note</span>
              <textarea
                onChange={(event) => onMemo(event.target.value)}
                placeholder="Add a note about this pet…"
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
                display: "flex",
                alignItems: "center",
                gap: "12px",
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
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "14px",
                    color: "var(--text-strong)",
                  }}
                >
                  Show on desktop
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                  Keep this pet out on the desktop as a companion.
                </div>
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
                Delete pet
              </button>
              <Button onClick={onDone} variant="neutral">
                Done
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
