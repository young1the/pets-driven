import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  Callout,
  Caption,
  ClickBurst,
  DemoAppFrame,
  DemoCursor,
  DemoPetCard,
  DemoTerminal,
  DemoWindow,
  DesktopBackdrop,
  DesktopPet,
} from "./components";
import {
  DEMO_PETS,
  type DemoPet,
  type PetMotionKeyframe,
} from "./fixtures";
import { easeOutCubic, lerp, progress } from "./timeline";
import "./service-demo.css";

const cato = DEMO_PETS[0];
const otto = DEMO_PETS[1];
const pip = DEMO_PETS[2];
const TERMINAL_TYPING_DONE_FRAME = 528;
const WORKING_BUBBLE_START_FRAME = TERMINAL_TYPING_DONE_FRAME + 4;
const WORKING_BUBBLE_DURATION = 64;
const SUMMON_PET_EXIT_START_FRAME = WORKING_BUBBLE_START_FRAME + WORKING_BUBBLE_DURATION + 6;
const SUMMON_PET_EXIT_DURATION = 24;
const SUMMONED_PET_SCALE = 1.26;
const MULTI_PET_SCALE = 1.08;
const CURSOR_BASE_SCALE = 1.8;
const bloop: DemoPet = {
  id: "bloop",
  name: "Bloop",
  assetId: "bloop",
  note: "playful operator",
  role: "ops",
  cwd: "D:/pets-driven/services",
  gradient: { from: "#75D9A9", to: "#46B97E" },
  color: "#75d9a9",
};
const fenn: DemoPet = {
  id: "fenn",
  name: "Fenn",
  assetId: "fenn",
  note: "swift scout",
  role: "tests",
  cwd: "D:/pets-driven/apps/desktop",
  gradient: { from: "#F2A45E", to: "#DE6E2B" },
  color: "#f2a45e",
};
const mochi: DemoPet = {
  id: "mochi",
  name: "Mochi",
  assetId: "mochi",
  note: "careful archivist",
  role: "docs",
  cwd: "D:/pets-driven/docs",
  gradient: { from: "#FF9DB6", to: "#F16A90" },
  color: "#ff9db6",
};
const MULTI_SCENE_PETS: DemoPet[] = [bloop, fenn, mochi];

export function ServiceDemoVideo() {
  const frame = useCurrentFrame();
  const appP = progress(frame, 0, 54);
  const terminalP = progress(frame, 390, 72);
  const multiP = progress(frame, 640, 300);
  const closingP = progress(frame, 900, 60);
  const closingBackdropP = progress(frame, 900, 10);

  const dragP = easeOutCubic(progress(frame, 112, 68));
  const cardY = lerp(0, -314, dragP);
  const releaseP = progress(frame, 180, 10);
  const petReveal = progress(frame, 190, 24);
  const summonDropP = easeOutCubic(progress(frame, 190, 42));
  const desktopFadeP = progress(frame, 190, 42);
  const terminalWindowP = progress(frame, 390, 28);
  const summonEmoteP = progress(frame, 232, 18);
  const workingBubbleP = progress(frame, WORKING_BUBBLE_START_FRAME, WORKING_BUBBLE_DURATION);
  const workSceneExitOpacity = interpolate(
    progress(frame, SUMMON_PET_EXIT_START_FRAME, SUMMON_PET_EXIT_DURATION),
    [0, 1],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const summonCaptionOpacity =
    interpolate(progress(frame, 0, 10), [0, 1], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(progress(frame, 274, 18), [0, 1], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const terminalCaptionOpacity =
    interpolate(progress(frame, 344, 18), [0, 1], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(progress(frame, 642, 20), [0, 1], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const multiCaptionOpacity =
    interpolate(multiP, [0, 0.08], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(closingP, [0, 0.2], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const cursor = cursorPosition(frame);
  const clickBurst1 = progress(frame, 332, 13);
  const clickBurst2 = progress(frame, 348, 13);
  const summonPet = summonedPetPose(frame, summonDropP);
  const showSummonedPet = petReveal > 0 && frame < SUMMON_PET_EXIT_START_FRAME + SUMMON_PET_EXIT_DURATION;
  const mainWindowOpacity =
    interpolate(appP, [0, 0.22], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(desktopFadeP, [0, 1], [1, 0], {
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
                    opacity: frame >= 112 ? 0 : 1,
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

          {frame >= 112 && frame < 190 ? (
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

        <Caption
          style={{
            left: "50%",
            opacity: summonCaptionOpacity,
            textAlign: "center",
            top: 118,
            transform: "translateX(-50%)",
          }}
        >
          Summon a pet from your deck.
        </Caption>

        {showSummonedPet ? (
          <>
            <DesktopPet
              animationState={summonPet.animationState}
              emoteKind={summonEmoteP > 0 && summonEmoteP < 1 ? "heart" : undefined}
              elapsedMs={frame * 33}
              pet={cato}
              scale={SUMMONED_PET_SCALE}
              x={summonPet.x}
              y={summonPet.y}
            />
            <Callout
              className="pd-video-working-callout"
              style={{
                left: summonPet.x,
                opacity:
                  interpolate(workingBubbleP, [0, 0.12, 0.9, 1], [0, 1, 1, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }) *
                  interpolate(multiP, [0, 0.08], [1, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                top: summonPet.y - 246,
                transform: `translateX(-50%) translateY(${lerp(10, 0, easeOutCubic(workingBubbleP))}px)`,
              }}
            >
              Now I&apos;m working.
            </Callout>
          </>
        ) : null}

        <section
          className="pd-video-terminal-zone"
          style={
            {
              opacity:
                interpolate(terminalP, [0, 0.18], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }) *
                workSceneExitOpacity *
                interpolate(multiP, [0, 0.08], [1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              transform: `translateX(-50%) translateY(${lerp(12, 0, easeOutCubic(terminalP))}px)`,
            } as CSSProperties
          }
        >
          <DemoTerminal className="pd-video-terminal-window" cwd={cato.cwd} />
        </section>

        <Caption
          style={{
            left: "50%",
            opacity: terminalCaptionOpacity * workSceneExitOpacity,
            textAlign: "center",
            top: 118,
            transform: "translateX(-50%)",
          }}
        >
          Open its terminal with a double-click.
        </Caption>

        <section
          className="pd-video-multi"
          style={{
            opacity:
              interpolate(multiP, [0, 0.06], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }) *
              interpolate(closingP, [0, 0.2], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
          }}
        >
          <DesktopBackdrop />
          <Caption
            style={{
              left: "50%",
              opacity: multiCaptionOpacity,
              textAlign: "center",
              top: 118,
              transform: "translateX(-50%)",
            }}
          >
            Each pet settles into a different desktop routine.
          </Caption>
          {MULTI_SCENE_PETS.map((pet) => {
            const pose = roamingPetPose(pet.id, frame);
            return (
              <DesktopPet
                animationState={pose.animationState}
                elapsedMs={frame * 33}
                facing={pose.facing}
                key={pet.id}
                pet={pet}
                scale={MULTI_PET_SCALE}
                x={pose.x}
                y={pose.y}
              />
            );
          })}
        </section>

        <section
          className="pd-video-closing"
          style={{ opacity: interpolate(closingBackdropP, [0, 1], [0, 1]) }}
        >
          <div className="pd-video-closing__wash" />
          <div className="pd-video-closing__dots" />
          <div
            className="pd-video-closing__reveal"
            style={{
              opacity: interpolate(closingP, [0, 0.28], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${lerp(26, 0, easeOutCubic(closingP))}px)`,
            }}
          >
            <img alt="" src={staticFile("petsdriven-mark.svg")} />
            <h2>
              Pets<span className="pd-video-closing__hyphen">-</span>Driven
            </h2>
            <p className="pd-video-closing__eyebrow">
              a cute way to develop with AI agents
            </p>
          </div>
        </section>

        {clickBurst1 > 0 && clickBurst1 < 1 ? (
          <ClickBurst progress={clickBurst1} x={966} y={968} />
        ) : null}
        {clickBurst2 > 0 && clickBurst2 < 1 ? (
          <ClickBurst progress={clickBurst2} x={966} y={968} />
        ) : null}

        {workSceneExitOpacity > 0 ? (
          <DemoCursor
            scale={cursor.scale}
            x={cursor.x}
            y={cursor.y}
          />
        ) : null}
      </main>
    </AbsoluteFill>
  );
}

function cursorPosition(frame: number) {
  if (frame < 112) return { scale: CURSOR_BASE_SCALE, x: 960, y: 828 };
  if (frame < 180) {
    const p = easeOutCubic(progress(frame, 112, 68));
    return { scale: CURSOR_BASE_SCALE, x: 960, y: lerp(828, 530, p) };
  }
  if (frame < 330) return { scale: CURSOR_BASE_SCALE, x: 960, y: 966 };
  if (frame < 375) {
    const pulse = frame % 16 < 8 ? CURSOR_BASE_SCALE * 0.86 : CURSOR_BASE_SCALE;
    return { scale: pulse, x: 960, y: 966 };
  }
  if (frame < 390) {
    const p = easeOutCubic(progress(frame, 375, 15));
    return { scale: CURSOR_BASE_SCALE, x: lerp(960, 1110, p), y: lerp(966, 622, p) };
  }
  return { scale: CURSOR_BASE_SCALE, x: 1110, y: 622 };
}

function roamingPetPose(
  petId: string,
  frame: number,
): PetMotionKeyframe {
  const local = Math.max(0, frame - 640);
  const configs = {
    bloop: {
      arc: 220,
      baseX: 720,
      baseY: 782,
      phase: 0.2,
      vertical: 18,
      workFacing: "right" as const,
      workX: 792,
      workY: 838,
    },
    fenn: {
      arc: 210,
      baseX: 1200,
      baseY: 792,
      phase: 2.5,
      vertical: 16,
      workFacing: "left" as const,
      workX: 1146,
      workY: 852,
    },
    mochi: {
      arc: 170,
      baseX: 980,
      baseY: 706,
      phase: 4.1,
      vertical: 24,
      workFacing: "right" as const,
      workX: 968,
      workY: 776,
    },
  };
  const config = configs[petId as keyof typeof configs];
  const wave = local / 26 + config.phase;
  const roamX = config.baseX + Math.sin(wave) * config.arc;
  const roamY =
    config.baseY + Math.cos(local / 16 + config.phase) * config.vertical;
  const roamFacing = Math.cos(wave) >= 0 ? "right" : "left";
  const settleP = easeOutCubic(progress(local, 48, 30));
  const workingP = progress(local, 84, 12);
  const settledBaseX = lerp(roamX, config.workX, settleP);
  const settledBaseY = lerp(roamY, config.workY, settleP);

  if (settleP < 1) {
    return {
      animationState:
        roamFacing === "left" ? "running-left" : "running-right",
      facing: roamFacing,
      frame,
      x: settledBaseX,
      y: settledBaseY,
    };
  }

  if (petId === "bloop") {
    return {
      animationState: workingP > 0 ? "running" : "waiting",
      facing: "right",
      frame,
      x: config.workX + Math.sin(local / 14) * 10,
      y: config.workY + Math.sin(local / 11) * 4,
    };
  }

  if (petId === "fenn") {
    const reviewP = progress(local, 126, 16);
    return {
      animationState: reviewP > 0 ? "review" : "waiting",
      facing: "left",
      frame,
      x: config.workX + Math.sin(local / 20 + config.phase) * 6,
      y: config.workY + Math.cos(local / 22 + config.phase) * 3,
    };
  }

  const jumpCycle = Math.max(0, local - 132) % 96;
  const jumpP = easeOutCubic(progress(jumpCycle, 0, 18));
  const landingP = progress(jumpCycle, 18, 18);
  const jumpLift =
    jumpCycle < 18
      ? lerp(0, -34, jumpP)
      : jumpCycle < 36
        ? lerp(-34, 0, landingP)
        : 0;
  return {
    animationState:
      jumpCycle < 36 && workingP > 0 ? "jumping" : "waiting",
    facing: "right",
    frame,
    x: config.workX + Math.sin(local / 16 + config.phase) * 8,
    y: config.workY + jumpLift + Math.cos(local / 18 + config.phase) * 2,
  };
}

function summonedPetPose(
  frame: number,
  dropP: number,
): PetMotionKeyframe {
  if (frame >= SUMMON_PET_EXIT_START_FRAME) {
    const exitP = easeOutCubic(
      progress(frame, SUMMON_PET_EXIT_START_FRAME, SUMMON_PET_EXIT_DURATION),
    );
    return {
      animationState: "running-right",
      facing: "right",
      frame,
      x: lerp(960, 1460, exitP),
      y: lerp(1008, 964, exitP),
    };
  }

  return {
    animationState:
      dropP < 0.82
        ? "jumping"
        : frame >= TERMINAL_TYPING_DONE_FRAME
          ? "running"
          : "idle",
    facing: "right",
    frame,
    x: 960,
    y: lerp(602, 1008, dropP),
  };
}
