import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  Callout,
  Caption,
  DemoAppFrame,
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
  const contextP = progress(frame, 0, 90);
  const appP = progress(frame, 60, 90);
  const summonP = progress(frame, 90, 240);
  const activateP = progress(frame, 330, 240);
  const terminalP = progress(frame, 570, 150);
  const multiP = progress(frame, 720, 300);
  const closingP = progress(frame, 1020, 60);

  const dragP = easeOutCubic(progress(frame, 120, 120));
  const cardY = lerp(0, -300, dragP);
  const petReveal = progress(frame, 270, 45);
  const cursor = cursorPosition(frame);

  return (
    <AbsoluteFill className="pd-video">
      <div className="pd-video__background" />
      <main className="pd-video__stage">
        <header
          className="pd-video-brand"
          style={{
            opacity: interpolate(contextP, [0, 0.35], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <img alt="" src={staticFile("petsdriven-mark.svg")} />
          <h1>Pets-Driven</h1>
          <p>Your agents, visible on your desktop.</p>
        </header>

        <DemoAppFrame
          className="pd-video-main-frame"
          style={
            {
              opacity: interpolate(appP, [0, 0.55], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateX(-50%) translateY(${lerp(34, 0, easeOutCubic(appP))}px)`,
            } as CSSProperties
          }
        >
          <DemoWindow className="pd-video-main-window">
            <div className="pd-video-home">
              <div className="pd-video-home__copy">
                <span>Your pack</span>
                <h2>
                  Good morning,
                  <br />
                  Trainer!
                </h2>
                <button type="button">Add a pet</button>
                <p>Bring a new pet into the pack and give it a job.</p>
              </div>
              <div className="pd-video-card-fan">
                <div className="pd-video-card pd-video-card--left">
                  <DemoPetCard pet={otto} />
                </div>
                <div
                  className="pd-video-card pd-video-card--center"
                  style={{
                    transform: `translateX(-50%) translateY(${cardY}px) scale(${lerp(1, 1.06, dragP)})`,
                    zIndex: 300,
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
        </DemoAppFrame>

        <Callout
          style={{
            left: 1030,
            opacity: summonP > 0.08 && summonP < 0.82 ? 1 : 0,
            top: 294,
          }}
        >
          Drag a pet card to summon it.
        </Callout>

        {petReveal > 0 ? (
          <DesktopPet
            animationState={frame < 540 ? "waving" : "idle"}
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
            top: 618,
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
          <Caption style={{ left: 84, top: 118 }}>
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
  if (frame < 120) return { scale: 1, x: 960, y: 828 };
  if (frame < 240) {
    const p = easeOutCubic(progress(frame, 120, 120));
    return { scale: 1, x: 960, y: lerp(828, 530, p) };
  }
  if (frame < 390) return { scale: 1, x: 1260, y: 650 };
  if (frame < 465) {
    const pulse = frame % 16 < 8 ? 0.86 : 1;
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
