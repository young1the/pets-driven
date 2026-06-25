import { useState, type CSSProperties } from "react";
import { Button, PetShowcaseCard } from "@pets-driven/design-system";
import type { PetCardStatus } from "@/app-state/pet-card-status";
import { PetPortrait } from "@/app/main-window/pet-portrait";
import { PlusIcon } from "@/app/main-window/main-window-icons";

export type HomePetView = {
  id: string;
  name: string;
  assetId: string;
  role: string;
  status: PetCardStatus;
  gradient: { from: string; to: string };
};

export interface HomeSectionProps {
  atHome: HomePetView[];
  inField: { id: string; name: string; color: string }[];
  onDeploy: (petId: string) => void;
  onRecall: (petId: string) => void;
  onEdit: (petId: string) => void;
  onAddPet: () => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

/** Order the fan so the centre pet sits in the middle, others fan outward. */
function fanOrder<T>(pets: T[]): { pet: T; index: number; center: number }[] {
  if (pets.length === 0) {
    return [];
  }

  const centerSource = Math.floor(pets.length / 2);
  const ordered: T[] = [pets[centerSource]];
  const others = pets.filter((_, i) => i !== centerSource);

  for (let k = 0; k < others.length; k++) {
    if (k % 2 === 0) {
      ordered.push(others[k]);
    } else {
      ordered.unshift(others[k]);
    }
  }

  const center = ordered.indexOf(pets[centerSource]);

  return ordered.map((pet, index) => ({ pet, index, center }));
}

export function HomeSection({
  atHome,
  inField,
  onDeploy,
  onRecall,
  onEdit,
  onAddPet,
  onShowAll,
  onHideAll,
}: HomeSectionProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const n = atHome.length;
  const stepX = n <= 5 ? 150 : n <= 7 ? 124 : n <= 9 ? 104 : 88;
  const rotX = n <= 6 ? 7 : n <= 9 ? 5.5 : 4.5;
  const ordered = fanOrder(atHome);

  return (
    <div className="pd-home">
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "-160px",
          transform: "translateX(-50%)",
          width: "1100px",
          height: "620px",
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(249,94,158,0.10), rgba(139,127,232,0.07) 45%, transparent 72%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "26px",
          zIndex: 9,
          display: "flex",
          alignItems: "center",
          gap: "9px",
        }}
      >
        <span
          style={{
            whiteSpace: "nowrap",
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--text-subtle)",
            marginRight: "2px",
          }}
        >
          {inField.length} on the desktop
        </span>
        <Button onClick={onShowAll} size="sm" variant="neutral">
          Show all
        </Button>
        <Button onClick={onHideAll} size="sm" variant="neutral">
          Hide all
        </Button>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 6,
          flex: 1,
          minHeight: 0,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--blossom-600)",
            marginBottom: "20px",
          }}
        >
          Your pack
        </span>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "44px",
            lineHeight: 1.1,
            color: "var(--text-strong)",
            margin: "0 0 28px",
            letterSpacing: "-0.015em",
          }}
        >
          Good morning,
          <br />
          Trainer!
        </h2>
        <Button iconLeft={<PlusIcon />} onClick={onAddPet} size="lg">
          Add a pet
        </Button>
        <span
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            marginTop: "13px",
          }}
        >
          Bring a new pet into the pack and give it a job.
        </span>

        {inField.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: "14px",
              maxWidth: "680px",
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
              In the field
            </span>
            {inField.map((pet) => (
              <button
                key={pet.id}
                onClick={() => onRecall(pet.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  border: "1px solid var(--border-soft)",
                  background: "var(--surface-card)",
                  borderRadius: "999px",
                  padding: "5px 12px 5px 7px",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                }}
                type="button"
              >
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    flex: "none",
                    background: pet.color,
                  }}
                />
                <span
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "var(--text-body)",
                  }}
                >
                  {pet.name}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="pd-home__fan">
        {ordered.map(({ pet, index, center }) => {
          const d = index - center;
          const ty = Math.abs(d) * 22;
          const hovered = hoverId === pet.id;
          const wrapStyle: CSSProperties = {
            left: `calc(50% + ${d * stepX}px)`,
            transform: hovered
              ? `translateX(-50%) translateY(${ty - 46}px) rotate(${d * 2}deg) scale(1.1)`
              : `translateX(-50%) translateY(${ty}px) rotate(${d * rotX}deg)`,
            zIndex: hovered ? 200 : 60 - Math.round(Math.abs(d) * 6),
          };

          return (
            <div
              className="pd-home__fan-card"
              key={pet.id}
              onClick={() => onDeploy(pet.id)}
              onMouseEnter={() => setHoverId(pet.id)}
              onMouseLeave={() =>
                setHoverId((current) => (current === pet.id ? null : current))
              }
              style={wrapStyle}
            >
              <PetShowcaseCard
                featured={hovered}
                gradient={pet.gradient}
                name={pet.name}
                onEdit={() => onEdit(pet.id)}
                portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
                role={pet.role}
                status={{
                  label: pet.status.label,
                  dotColor: pet.status.dotColor,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
