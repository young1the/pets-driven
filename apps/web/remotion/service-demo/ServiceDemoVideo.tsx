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
  type PetMotionKeyframe,
} from "./fixtures";
import { easeInCubic, easeOutCubic, lerp, progress } from "./timeline";
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

  const dragP = easeOutCubic(progress(frame, 120, 105));
  const cardY = lerp(0, -300, dragP);
  const releaseP = progress(frame, 225, 14);
  const petReveal = progress(frame, 238, 48);
  const terminalWindowP = progress(frame, 570, 45);
  const cursor = cursorPosition(frame);
  const summonPet = summonedPetPose(frame);
  const mainWindowOpacity =
    interpolate(appP, [0, 0.55], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(terminalWindowP, [0, 0.5], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const dragCardOpacity = interpolate(releaseP, [0, 0.72, 1], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
              opacity: mainWindowOpacity,
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
                    opacity: frame >= 120 ? 0 : 1,
                    transform: "translateX(-50%)",
                    zIndex: 120,
                  }}
                >
                  <DemoPetCard pet={cato} />
                </div>
                <div className="pd-video-card pd-video-card--right">
                  <DemoPetCard pet={pip} />
                </div>
              </div>
            </div>
          </DemoWindow>

          {frame >= 120 && frame < 238 ? (
            <div
              className="pd-video-drag-card"
              style={{
                opacity: dragCardOpacity,
                transform: `translateX(-50%) translateY(${cardY}px) scale(${lerp(1, 1.05, dragP)})`,
              }}
            >
              <DemoPetCard featured={dragP > 0.22} pet={cato} />
            </div>
          ) : null}
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
            animationState={summonPet.animationState}
            elapsedMs={frame * 33}
            label={activateP > 0.15 ? "Cato · D:/pets-driven" : undefined}
            pet={cato}
            scale={0.78}
            x={summonPet.x}
            y={summonPet.y}
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

        <DemoAppFrame
          className="pd-video-terminal-zone"
          meta="Cato terminal"
          style={
            {
              opacity:
                interpolate(terminalP, [0, 0.28], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }) *
                interpolate(multiP, [0, 0.2], [1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              transform: `translateX(-50%) translateY(${lerp(60, 0, easeOutCubic(terminalP))}px)`,
            } as CSSProperties
          }
          title="Terminal"
        >
          <DemoTerminal className="pd-video-terminal-window" cwd={cato.cwd} />
          <Callout className="pd-video-terminal-callout">
            Terminal channel activated.
          </Callout>
        </DemoAppFrame>

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
            They scatter, then slip below the monitor edge.
          </Caption>
          {DEMO_PETS.map((pet) => {
            const pose = fallingPetPose(pet.id, frame);
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
  if (frame < 225) {
    const p = easeOutCubic(progress(frame, 120, 105));
    return { scale: 1, x: 960, y: lerp(828, 530, p) };
  }
  if (frame < 390) return { scale: 1, x: 960, y: 650 };
  if (frame < 465) {
    const pulse = frame % 16 < 8 ? 0.86 : 1;
    return { scale: pulse, x: 960, y: 650 };
  }
  return { scale: 1, x: 1500, y: 880 };
}

function fallingPetPose(
  petId: string,
  frame: number,
): PetMotionKeyframe {
  const local = Math.max(0, frame - 720);
  const configs = {
    cato: { drift: 0.72, facing: "right" as const, startX: 520, startY: 642 },
    otto: { drift: -0.78, facing: "left" as const, startX: 1330, startY: 648 },
    pip: { drift: 0.44, facing: "right" as const, startX: 910, startY: 500 },
  };
  const config = configs[petId as keyof typeof configs];

  if (local < 92) {
    const roamP = local / 92;
    return {
      animationState: config.facing === "left" ? "running-left" : "running-right",
      facing: config.facing,
      frame,
      x: config.startX + config.drift * local * 3.2,
      y: config.startY + Math.sin(roamP * Math.PI * 2) * 10,
    };
  }

  const fallFrames = local - 92;
  const drop = 0.065 * fallFrames * fallFrames;
  return {
    animationState: "jumping",
    facing: config.facing,
    frame,
    x: config.startX + config.drift * (92 * 3.2 + fallFrames * 1.2),
    y: config.startY + drop,
  };
}

function summonedPetPose(frame: number): PetMotionKeyframe {
  const local = Math.max(0, frame - 238);
  const settle = easeInCubic(progress(frame, 238, 78));
  return {
    animationState: local < 54 ? "jumping" : frame < 540 ? "waving" : "idle",
    facing: "right",
    frame,
    x: 960,
    y: lerp(612, 742, settle),
  };
}
