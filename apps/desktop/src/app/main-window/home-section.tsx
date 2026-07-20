import { Button, PetShowcaseCard, PlusIcon } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { type CSSProperties, memo, useEffect, useRef, useState } from "react";
import { PetPortrait } from "@/app/main-window/pet-portrait";

export type HomePetView = {
  id: string;
  name: string;
  assetId: string;
  note: string;
  role: string;
  gradient: { from: string; to: string };
  cwd: string | null;
};

export interface HomeSectionProps {
  atHome: HomePetView[];
  inField: { id: string; name: string; color: string; working: boolean }[];
  onDeploy: (petId: string) => void;
  onRecall: (petId: string) => void;
  onEdit: (petId: string) => void;
  onAddPet: () => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

const DRAG_THRESHOLD = 6;
const DEPLOY_Y_THRESHOLD = 100;

/** Number of greeting variants per time-of-day period in the translations. */
const GREETING_VARIANTS = 3;

type GreetingPeriod = "morning" | "afternoon" | "evening" | "night";

/** Map an hour (0-23) to a time-of-day greeting bucket. */
function greetingPeriod(hour: number): GreetingPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
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

export const HomeSection = memo(function HomeSection({
  atHome,
  inField,
  onDeploy,
  onRecall,
  onEdit,
  onAddPet,
}: HomeSectionProps) {
  const { t } = useTranslation("desktop");
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Freeze the period and variant once on mount so the greeting stays stable
  // across re-renders (drags, hovers), but resolve the text via `t` each render
  // so it still follows a live language switch.
  const [greetingPick] = useState(() => ({
    period: greetingPeriod(new Date().getHours()),
    index: Math.floor(Math.random() * GREETING_VARIANTS),
  }));
  const greetingVariants = t(`home.greetings.${greetingPick.period}`, {
    returnObjects: true,
  }) as unknown as string[];
  const greeting = Array.isArray(greetingVariants)
    ? (greetingVariants[greetingPick.index] ?? greetingVariants[0] ?? t("home.greeting"))
    : t("home.greeting");
  const dragRef = useRef<{ id: string; startX: number; startY: number } | null>(null);
  // Only *which* card is being dragged is state. The per-pointermove offset is
  // transient and goes straight to the dragged card's transform (see
  // handleMove), so a drag re-renders the fan twice — on grab and on release —
  // instead of on every pointer move.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const cardElsRef = useRef(new Map<string, HTMLDivElement>());

  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onDeployRef = useRef(onDeploy);
  onDeployRef.current = onDeploy;

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      const active = dragRef.current;
      if (!active) {
        return;
      }
      const card = cardElsRef.current.get(active.id);
      if (!card) {
        return;
      }
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      // `ty` is the card's resting offset in the fan, published by the render
      // so the imperative transform can stay in sync with the layout.
      const ty = Number(card.dataset.ty ?? "0");
      card.style.transform = `translate(calc(-50% + ${dx}px), ${ty + dy}px) scale(1.06)`;
    }

    function handleUp(event: PointerEvent) {
      const active = dragRef.current;
      if (!active) {
        return;
      }
      dragRef.current = null;
      setDraggingId(null);

      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD;

      if (!moved) {
        onEditRef.current(active.id);
      } else if (dy < -DEPLOY_Y_THRESHOLD) {
        onDeployRef.current(active.id);
      }
      // else: not dragged far enough up — clearing dragVisual springs the card back.
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  function handleCardPointerDown(event: React.PointerEvent<HTMLDivElement>, petId: string) {
    if (event.button !== 0) {
      return;
    }
    dragRef.current = {
      id: petId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setDraggingId(petId);
  }

  const n = atHome.length;
  const stepX = n <= 5 ? 150 : n <= 7 ? 124 : n <= 9 ? 104 : 88;
  const rotX = n <= 6 ? 7 : n <= 9 ? 5.5 : 4.5;
  const ordered = fanOrder(atHome);

  const homeClass = [
    "pd-home",
    draggingId ? "pd-home--dragging" : "",
    hoverId ? "pd-home--hovered" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={homeClass}>
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
          {t("home.eyebrow")}
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
          {greeting}
          <br />
          {t("home.greetingName")}
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
          {t("home.addPet")}
        </Button>
        <span
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            marginTop: "13px",
          }}
        >
          {t("home.addPetHint")}
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
              {t("home.inField")}
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
                  padding: "5px 12px 5px 8px",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                }}
                type="button"
              >
                <span
                  className={pet.working ? "pd-field-dot--working" : undefined}
                  style={{
                    width: "8px",
                    height: "8px",
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
          const dragging = draggingId === pet.id;
          const wrapStyle: CSSProperties = {
            left: `calc(50% + ${d * stepX}px)`,
            // While dragging this is only the resting pose; handleMove writes the
            // live offset straight to the element.
            transform: dragging
              ? `translate(-50%, ${ty}px) scale(1.06)`
              : hovered
                ? `translateX(-50%) translateY(${ty - 60}px) rotate(0deg) scale(1.06)`
                : `translateX(-50%) translateY(${ty}px) rotate(${d * rotX}deg)`,
            zIndex: dragging ? 300 : hovered ? 200 : 60 - Math.round(Math.abs(d) * 6),
          };

          return (
            // biome-ignore lint/a11y/useSemanticElements: this is a pointer-draggable card that also acts as a button; a native <button> would conflict with the drag interaction. Keyboard access is provided via tabIndex + onKeyDown.
            <div
              className={["pd-home__fan-card", dragging ? "pd-home__fan-card--dragging" : ""]
                .filter(Boolean)
                .join(" ")}
              key={pet.id}
              ref={(el) => {
                const cards = cardElsRef.current;
                if (el) {
                  cards.set(pet.id, el);
                } else {
                  cards.delete(pet.id);
                }
              }}
              data-ty={ty}
              role="button"
              tabIndex={0}
              aria-label={t("home.openDetails", { name: pet.name })}
              onPointerDown={(event) => handleCardPointerDown(event, pet.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEdit(pet.id);
                }
              }}
              onMouseEnter={() => setHoverId(pet.id)}
              onMouseLeave={() => setHoverId((current) => (current === pet.id ? null : current))}
              style={wrapStyle}
            >
              <PetShowcaseCard
                featured={hovered}
                gradient={pet.gradient}
                name={pet.name}
                note={pet.note}
                portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
                role={pet.role}
                cwd={pet.cwd ?? undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
