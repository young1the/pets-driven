import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  Callout,
  Caption,
  DemoCursor,
  DemoPetCard,
  DemoTerminal,
  DemoWindow,
  DesktopPet,
} from "./components";
import {
  DEMO_PETS,
  MULTI_PET_PATHS,
  type PetMotionKeyframe,
} from "./fixtures";
import { easeOutCubic, lerp, progress } from "./timeline";
import "./service-demo.css";

const cato = DEMO_PETS[0];
const otto = DEMO_PETS[1];
const pip = DEMO_PETS[2];

export function ServiceDemoVideo() {
  const frame = useCurrentFrame();
  const contextP = progress(frame, 0, 150);
  const summonP = progress(frame, 150, 390);
  const activateP = progress(frame, 540, 420);
  const terminalP = progress(frame, 960, 300);
  const multiP = progress(frame, 1260, 480);
  const closingP = progress(frame, 1740, 60);

  const dragP = easeOutCubic(progress(frame, 210, 210));
  const cardX = lerp(0, 420, dragP);
  const cardY = lerp(0, -360, dragP);
  const petReveal = progress(frame, 450, 120);
  const cursor = cursorPosition(frame);

  return (
    <AbsoluteFill className="pd-video">
      <div className="pd-video__background" />
      <main className="pd-video__stage">
        <Caption
          style={{
            left: 84,
            opacity: interpolate(contextP, [0, 0.25], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            top: 78,
          }}
        >
          Your agents, visible on your desktop.
        </Caption>

        <DemoWindow className="pd-video-main-window" title="Pets-Driven">
          <div className="pd-video-home">
            <div className="pd-video-home__copy">
              <span>Your pack</span>
              <h2>
                Good morning,
                <br />
                Trainer!
              </h2>
              <button type="button">Add a pet</button>
            </div>
            <div className="pd-video-card-fan">
              <div className="pd-video-card pd-video-card--left">
                <DemoPetCard pet={otto} />
              </div>
              <div
                className="pd-video-card pd-video-card--center"
                style={{
                  transform: `translate(calc(-50% + ${cardX}px), ${cardY}px) rotate(${lerp(0, -5, dragP)}deg) scale(${lerp(1, 1.06, dragP)})`,
                  zIndex: 20,
                }}
              >
                <DemoPetCard featured={dragP > 0.2} pet={cato} />
              </div>
              <div className="pd-video-card pd-video-card--right">
                <DemoPetCard pet={pip} />
              </div>
            </div>
          </div>
        </DemoWindow>

        <Callout
          style={{
            left: 1030,
            opacity: summonP > 0.08 && summonP < 0.82 ? 1 : 0,
            top: 260,
          }}
        >
          Drag a pet card to summon it.
        </Callout>

        {petReveal > 0 ? (
          <DesktopPet
            animationState={frame < 900 ? "waving" : "idle"}
            elapsedMs={frame * 33}
            label={activateP > 0.15 ? "Cato · D:/pets-driven" : undefined}
            pet={cato}
            scale={0.78}
            x={1260}
            y={720}
          />
        ) : null}

        <Callout
          style={{
            left: 1120,
            opacity: activateP > 0.12 && activateP < 0.45 ? 1 : 0,
            top: 596,
          }}
        >
          Double-click the pet.
        </Callout>

        <section
          className="pd-video-terminal-zone"
          style={{
            opacity: interpolate(terminalP, [0, 0.28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${lerp(60, 0, easeOutCubic(terminalP))}px)`,
          }}
        >
          <DemoTerminal cwd={cato.cwd} />
          <Callout style={{ left: 0, position: "relative", top: 18 }}>
            Terminal channel activated.
          </Callout>
        </section>

        <section
          className="pd-video-multi"
          style={{
            opacity: interpolate(multiP, [0, 0.14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Caption style={{ left: 84, top: 120 }}>
            Each pet carries one working directory.
          </Caption>
          {DEMO_PETS.map((pet) => {
            const pose = poseForPath(MULTI_PET_PATHS[pet.id], frame);
            return (
              <DesktopPet
                animationState={pose.animationState}
                elapsedMs={frame * 33}
                facing={pose.facing}
                key={pet.id}
                label={pet.name}
                pet={pet}
                scale={0.68}
                x={pose.x}
                y={pose.y}
              />
            );
          })}
        </section>

        <section className="pd-video-closing" style={{ opacity: closingP }}>
          <h2>Send the pack.</h2>
          <div>
            <DesktopPet
              animationState="waving"
              elapsedMs={frame * 33}
              pet={cato}
              scale={0.52}
              x={0}
              y={0}
            />
            <DesktopPet
              animationState="jumping"
              elapsedMs={frame * 33}
              pet={otto}
              scale={0.52}
              x={160}
              y={18}
            />
            <DesktopPet
              animationState="review"
              elapsedMs={frame * 33}
              pet={pip}
              scale={0.52}
              x={320}
              y={0}
            />
          </div>
        </section>

        <DemoCursor scale={cursor.scale} x={cursor.x} y={cursor.y} />
      </main>
    </AbsoluteFill>
  );
}

function cursorPosition(frame: number) {
  if (frame < 210) return { scale: 1, x: 820, y: 820 };
  if (frame < 420) {
    const p = easeOutCubic(progress(frame, 210, 210));
    return { scale: 1, x: lerp(820, 1260, p), y: lerp(820, 478, p) };
  }
  if (frame < 660) return { scale: 1, x: 1260, y: 650 };
  if (frame < 760) {
    const pulse = frame % 20 < 10 ? 0.88 : 1;
    return { scale: pulse, x: 1260, y: 650 };
  }
  return { scale: 1, x: 1500, y: 880 };
}

function poseForPath(
  path: PetMotionKeyframe[],
  frame: number,
): PetMotionKeyframe {
  if (frame <= path[0].frame) return path[0];
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    if (frame >= current.frame && frame <= next.frame) {
      const p = easeOutCubic(
        progress(frame, current.frame, next.frame - current.frame),
      );
      return {
        animationState: p > 0.9 ? next.animationState : current.animationState,
        facing: next.facing ?? current.facing,
        frame,
        x: lerp(current.x, next.x, p),
        y: lerp(current.y, next.y, p),
      };
    }
  }
  return path[path.length - 1];
}
