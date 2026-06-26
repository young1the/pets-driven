import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, PetShowcaseCard } from "@pets-driven/design-system";
import type { PetCardStatus } from "@/app-state/pet-card-status";
import { PetPortrait } from "@/app/main-window/pet-portrait";
import { PlusIcon } from "@/app/main-window/main-window-icons";

export type HomePetView = {
  id: string;
  name: string;
  assetId: string;
  note: string;
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

const DRAG_THRESHOLD = 6;

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
}: HomeSectionProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number } | null>(
    null,
  );
  const [dragVisual, setDragVisual] = useState<{
    id: string;
    dx: number;
    dy: number;
    over: boolean;
  } | null>(null);

  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onDeployRef = useRef(onDeploy);
  onDeployRef.current = onDeploy;

  useEffect(() => {
    function isOverDropZone(clientX: number, clientY: number): boolean {
      const rect = dropZoneRef.current?.getBoundingClientRect();
      if (!rect) {
        return false;
      }
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    }

    function handleMove(event: PointerEvent) {
      const active = dragRef.current;
      if (!active) {
        return;
      }
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD;
      setDragVisual({
        id: active.id,
        dx,
        dy,
        over: moved && isOverDropZone(event.clientX, event.clientY),
      });
    }

    function handleUp(event: PointerEvent) {
      const active = dragRef.current;
      if (!active) {
        return;
      }
      dragRef.current = null;
      setDragVisual(null);

      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD;

      if (!moved) {
        onEditRef.current(active.id);
      } else if (isOverDropZone(event.clientX, event.clientY)) {
        onDeployRef.current(active.id);
      }
      // else: dropped outside — clearing dragVisual springs the card back.
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  function handleCardPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    petId: string,
  ) {
    if (event.button !== 0) {
      return;
    }
    dragRef.current = {
      id: petId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setDragVisual({ id: petId, dx: 0, dy: 0, over: false });
  }

  const n = atHome.length;
  const stepX = n <= 5 ? 150 : n <= 7 ? 124 : n <= 9 ? 104 : 88;
  const rotX = n <= 6 ? 7 : n <= 9 ? 5.5 : 4.5;
  const ordered = fanOrder(atHome);

  return (
    <div className="pd-home">
      <div
        ref={dropZoneRef}
        className={[
          "pd-home__dropzone",
          dragVisual?.over ? "pd-home__dropzone--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid="home-dropzone"
        aria-hidden="true"
      />

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
        <Button
          className="pd-home__add-pet"
          iconLeft={<PlusIcon />}
          onClick={onAddPet}
          size="lg"
          style={{
            flexShrink: 0,
            width: "fit-content",
            minWidth: "max-content",
          }}
        >
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
          const dragging = dragVisual?.id === pet.id;
          const wrapStyle: CSSProperties = {
            left: `calc(50% + ${d * stepX}px)`,
            transform: dragging
              ? `translate(calc(-50% + ${dragVisual.dx}px), ${ty + dragVisual.dy}px) scale(1.06)`
              : hovered
                ? `translateX(-50%) translateY(${ty - 46}px) rotate(${d * 2}deg) scale(1.1)`
                : `translateX(-50%) translateY(${ty}px) rotate(${d * rotX}deg)`,
            zIndex: dragging
              ? 300
              : hovered
                ? 200
                : 60 - Math.round(Math.abs(d) * 6),
          };

          return (
            <div
              className={[
                "pd-home__fan-card",
                dragging ? "pd-home__fan-card--dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={pet.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${pet.name}'s details`}
              onPointerDown={(event) => handleCardPointerDown(event, pet.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEdit(pet.id);
                }
              }}
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
                note={pet.note}
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
