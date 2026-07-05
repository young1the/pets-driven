import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
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
  PoofBurst,
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
const TERMINAL_FADE_START_FRAME = WORKING_BUBBLE_START_FRAME + WORKING_BUBBLE_DURATION + 6;
const TERMINAL_FADE_DURATION = 24;
const PET_EXIT_MOVE_START_FRAME = TERMINAL_FADE_START_FRAME + TERMINAL_FADE_DURATION;
const PET_EXIT_MOVE_DURATION = 20;
const PET_EXIT_X = 1200;
const PET_EXIT_Y = 980;
const PET_POOF_START_FRAME = PET_EXIT_MOVE_START_FRAME + PET_EXIT_MOVE_DURATION;
const PET_POOF_DURATION = 16;
const PET_POOF_HIDE_OFFSET = 6;
const MULTI_SCENE_START_FRAME = PET_POOF_START_FRAME + PET_POOF_DURATION;
const SUMMONED_PET_SCALE = 1.26;
const MULTI_PET_SCALE = 1.08;
const CURSOR_BASE_SCALE = 1.8;
const SUMMON_EMOTE_START_FRAME = 232;
const SUMMON_EMOTE_DURATION = 18;
const CURSOR_ENTRY_START_FRAME = 54;
const CURSOR_ENTRY_X = 1680;
const CURSOR_ROW_Y = 828;
const CURSOR_PIP_X = 1092;
const CURSOR_PIP_Y = 850;
const CURSOR_OTTO_X = 828;
const CURSOR_OTTO_Y = 850;
const CURSOR_CATO_X = 960;
const CURSOR_TO_PIP_END_FRAME = 64;
const CURSOR_PIP_HOVER_END_FRAME = 70;
const CURSOR_TO_OTTO_END_FRAME = 82;
const CURSOR_OTTO_HOVER_END_FRAME = 88;
const CURSOR_TO_CATO_END_FRAME = 98;
const CURSOR_PIP_OTTO_HANDOFF_FRAME = 76;
const CURSOR_RELEASE_Y = 530;
const CURSOR_FOLLOW_START_FRAME = SUMMON_EMOTE_START_FRAME + SUMMON_EMOTE_DURATION;
const CURSOR_FOLLOW_DURATION = 34;
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
  const multiP = progress(frame, MULTI_SCENE_START_FRAME, 300);
  const closingP = progress(frame, 900, 60);
  const closingBackdropP = progress(frame, 900, 10);
  const pipHoverWindowP = progress(
    frame,
    CURSOR_TO_PIP_END_FRAME - 2,
    CURSOR_PIP_OTTO_HANDOFF_FRAME - (CURSOR_TO_PIP_END_FRAME - 2),
  );
  const pipPop = Math.sin(pipHoverWindowP * Math.PI);
  const pipCardHovered = pipPop > 0.15;
  const ottoHoverWindowP = progress(
    frame,
    CURSOR_PIP_OTTO_HANDOFF_FRAME,
    CURSOR_OTTO_HOVER_END_FRAME + 2 - CURSOR_PIP_OTTO_HANDOFF_FRAME,
  );
  const ottoPop = Math.sin(ottoHoverWindowP * Math.PI);
  const ottoCardHovered = ottoPop > 0.15;
  const catoHoverWindowP = progress(
    frame,
    CURSOR_TO_CATO_END_FRAME - 2,
    112 - (CURSOR_TO_CATO_END_FRAME - 2),
  );
  const catoPop = Math.sin(catoHoverWindowP * Math.PI);
  const catoCardHovered = catoPop > 0.15;

  const dragP = easeOutCubic(progress(frame, 112, 68));
  const cardY = lerp(0, -314, dragP);
  const releaseP = progress(frame, 180, 10);
  const petReveal = progress(frame, 190, 24);
  const summonDropP = easeOutCubic(progress(frame, 190, 42));
  const desktopFadeP = progress(frame, 190, 42);
  const terminalWindowP = progress(frame, 390, 28);
  const summonEmoteP = progress(frame, SUMMON_EMOTE_START_FRAME, SUMMON_EMOTE_DURATION);
  const workingBubbleP = progress(frame, WORKING_BUBBLE_START_FRAME, WORKING_BUBBLE_DURATION);
  const workSceneExitOpacity = interpolate(
    progress(frame, TERMINAL_FADE_START_FRAME, TERMINAL_FADE_DURATION),
    [0, 1],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const poofP = progress(frame, PET_POOF_START_FRAME, PET_POOF_DURATION);
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
  const summonPet = summonedPetPose(frame, summonDropP);
  const petCenter = {
    x: summonPet.x,
    y: summonPet.y - (PET_CELL_SIZE.height * SUMMONED_PET_SCALE) / 2,
  };
  const cursor = cursorPosition(frame, petCenter);
  const clickBurst1 = progress(frame, 332, 13);
  const clickBurst2 = progress(frame, 348, 13);
  const showSummonedPet = petReveal > 0 && frame < PET_POOF_START_FRAME + PET_POOF_HIDE_OFFSET;
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
                <div
                  className="pd-video-card pd-video-card--left"
                  style={{
                    transform: `translateX(-50%) translateY(${lerp(22, -10, ottoPop)}px) rotate(${lerp(-7, 0, ottoPop)}deg) scale(${lerp(1, 1.14, ottoPop)})`,
                    zIndex: ottoCardHovered ? 130 : undefined,
                  }}
                >
                  <DemoPetCard featured={ottoCardHovered} pet={otto} />
                </div>
                <div
                  className="pd-video-card pd-video-card--center"
                  style={{
                    opacity: frame >= 112 ? 0 : 1,
                    transform: `translateX(-50%) translateY(${lerp(0, -10, catoPop)}px) scale(${lerp(1, 1.14, catoPop)})`,
                    zIndex: 120,
                  }}
                >
                  <DemoPetCard featured={catoCardHovered} pet={cato} />
                </div>
                <div
                  className="pd-video-card pd-video-card--right"
                  style={{
                    transform: `translateX(-50%) translateY(${lerp(22, -10, pipPop)}px) rotate(${lerp(7, 0, pipPop)}deg) scale(${lerp(1, 1.14, pipPop)})`,
                    zIndex: pipCardHovered ? 130 : undefined,
                  }}
                >
                  <DemoPetCard featured={pipCardHovered} pet={pip} />
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
              decisionEmote={
                summonEmoteP > 0 && summonEmoteP < 1
                  ? { emote: "heart", label: "Excited", mood: "love", tone: "affection" }
                  : null
              }
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
                decisionEmote={pose.decisionEmote}
                elapsedMs={frame * 33}
                key={pet.id}
                pet={pet}
                status={pose.status}
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
          <ClickBurst progress={clickBurst1} x={petCenter.x} y={petCenter.y} />
        ) : null}
        {clickBurst2 > 0 && clickBurst2 < 1 ? (
          <ClickBurst progress={clickBurst2} x={petCenter.x} y={petCenter.y} />
        ) : null}
        {poofP > 0 && poofP < 1 ? (
          <PoofBurst progress={poofP} x={petCenter.x} y={petCenter.y} />
        ) : null}

        {cursor && workSceneExitOpacity > 0 ? (
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

function cursorPosition(
  frame: number,
  petCenter: { x: number; y: number },
): { scale: number; x: number; y: number } | null {
  if (frame < CURSOR_ENTRY_START_FRAME) {
    return null;
  }
  if (frame < CURSOR_TO_PIP_END_FRAME) {
    // Swoop in from off-screen and check the rightmost pet first.
    const p = easeOutCubic(
      progress(frame, CURSOR_ENTRY_START_FRAME, CURSOR_TO_PIP_END_FRAME - CURSOR_ENTRY_START_FRAME),
    );
    return {
      scale: CURSOR_BASE_SCALE,
      x: lerp(CURSOR_ENTRY_X, CURSOR_PIP_X, p),
      y: lerp(CURSOR_ROW_Y, CURSOR_PIP_Y, p) - Math.sin(p * Math.PI) * 46,
    };
  }
  if (frame < CURSOR_PIP_HOVER_END_FRAME) {
    const wiggle = Math.sin((frame - CURSOR_TO_PIP_END_FRAME) / 2.4) * 3;
    return { scale: CURSOR_BASE_SCALE, x: CURSOR_PIP_X + wiggle, y: CURSOR_PIP_Y };
  }
  if (frame < CURSOR_TO_OTTO_END_FRAME) {
    // Sweep across to the leftmost pet to compare it too.
    const p = easeOutCubic(
      progress(frame, CURSOR_PIP_HOVER_END_FRAME, CURSOR_TO_OTTO_END_FRAME - CURSOR_PIP_HOVER_END_FRAME),
    );
    return {
      scale: CURSOR_BASE_SCALE,
      x: lerp(CURSOR_PIP_X, CURSOR_OTTO_X, p),
      y: lerp(CURSOR_PIP_Y, CURSOR_OTTO_Y, p) - Math.sin(p * Math.PI) * 34,
    };
  }
  if (frame < CURSOR_OTTO_HOVER_END_FRAME) {
    const wiggle = Math.sin((frame - CURSOR_TO_OTTO_END_FRAME) / 2.4) * 3;
    return { scale: CURSOR_BASE_SCALE, x: CURSOR_OTTO_X + wiggle, y: CURSOR_OTTO_Y };
  }
  if (frame < CURSOR_TO_CATO_END_FRAME) {
    // Moves to Cato, the eventual pick — but doesn't grab it yet.
    const p = easeOutCubic(
      progress(frame, CURSOR_OTTO_HOVER_END_FRAME, CURSOR_TO_CATO_END_FRAME - CURSOR_OTTO_HOVER_END_FRAME),
    );
    return {
      scale: CURSOR_BASE_SCALE,
      x: lerp(CURSOR_OTTO_X, CURSOR_CATO_X, p),
      y: lerp(CURSOR_OTTO_Y, CURSOR_ROW_Y, p) - Math.sin(p * Math.PI) * 18,
    };
  }
  if (frame < 112) {
    // Hovers on Cato for a beat — a moment of "is this the one?" — before the drag starts.
    const wiggle = Math.sin((frame - CURSOR_TO_CATO_END_FRAME) / 2.6) * 3;
    return { scale: CURSOR_BASE_SCALE, x: CURSOR_CATO_X + wiggle, y: CURSOR_ROW_Y };
  }
  if (frame < 180) {
    const p = easeOutCubic(progress(frame, 112, 68));
    return { scale: CURSOR_BASE_SCALE, x: 960, y: lerp(828, CURSOR_RELEASE_Y, p) };
  }
  if (frame < CURSOR_FOLLOW_START_FRAME) {
    // Pet has just been created — the cursor stays put instead of following it.
    return { scale: CURSOR_BASE_SCALE, x: 960, y: CURSOR_RELEASE_Y };
  }
  if (frame < CURSOR_FOLLOW_START_FRAME + CURSOR_FOLLOW_DURATION) {
    const p = easeOutCubic(progress(frame, CURSOR_FOLLOW_START_FRAME, CURSOR_FOLLOW_DURATION));
    return {
      scale: CURSOR_BASE_SCALE,
      x: lerp(960, petCenter.x, p),
      y: lerp(CURSOR_RELEASE_Y, petCenter.y, p),
    };
  }
  if (frame < 330) {
    return { scale: CURSOR_BASE_SCALE, x: petCenter.x, y: petCenter.y };
  }
  if (frame < 375) {
    const pulse = frame % 16 < 8 ? CURSOR_BASE_SCALE * 0.86 : CURSOR_BASE_SCALE;
    return { scale: pulse, x: petCenter.x, y: petCenter.y };
  }
  if (frame < 390) {
    const p = easeOutCubic(progress(frame, 375, 15));
    return {
      scale: CURSOR_BASE_SCALE,
      x: lerp(petCenter.x, 1110, p),
      y: lerp(petCenter.y, 622, p),
    };
  }
  return { scale: CURSOR_BASE_SCALE, x: 1110, y: 622 };
}

const DESKTOP_ROAM_Y = 785;
const DESKTOP_WORK_Y = 830;

function roamingPetPose(
  petId: string,
  frame: number,
): PetMotionKeyframe {
  const local = Math.max(0, frame - MULTI_SCENE_START_FRAME);
  const configs = {
    bloop: {
      arc: 160,
      baseX: 460,
      baseY: DESKTOP_ROAM_Y,
      phase: 0.2,
      vertical: 18,
      workX: 480,
      workY: DESKTOP_WORK_Y,
    },
    fenn: {
      arc: 150,
      baseX: 1420,
      baseY: DESKTOP_ROAM_Y,
      phase: 2.5,
      vertical: 16,
      workX: 1440,
      workY: DESKTOP_WORK_Y,
    },
    mochi: {
      arc: 140,
      baseX: 960,
      baseY: DESKTOP_ROAM_Y,
      phase: 4.1,
      vertical: 24,
      workX: 960,
      workY: DESKTOP_WORK_Y,
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
      frame,
      x: settledBaseX,
      y: settledBaseY,
    };
  }

  if (petId === "bloop") {
    const sparkleCycle = local % 90;
    const bloopWorking = workingP > 0;
    const bloopCompleted = bloopWorking && sparkleCycle < 16;
    return {
      animationState: bloopWorking ? "running" : "waiting",
      decisionEmote: !bloopWorking
        ? { emote: "question", label: "Queued", mood: "thinking", tone: "curious" }
        : bloopCompleted
          ? { emote: "sparkle", label: "Shipped", mood: "happy", tone: "spark" }
          : null,
      frame,
      status: {
        label: !bloopWorking ? "Queued" : bloopCompleted ? "Done" : "Working",
        message: !bloopWorking
          ? "queued for the next deploy"
          : bloopCompleted
            ? "shipped the deploy"
            : "running the deploy pipeline",
        mood: !bloopWorking ? "thinking" : bloopCompleted ? "happy" : "working",
      },
      x: config.workX + Math.sin(local / 14) * 10,
      y: config.workY + Math.sin(local / 11) * 4,
    };
  }

  if (petId === "fenn") {
    const reviewP = progress(local, 126, 16);
    const reviewFlagWindow = local >= 126 && local < 170;
    return {
      animationState: reviewP > 0 ? "review" : "waiting",
      decisionEmote:
        reviewP <= 0
          ? { emote: "question", label: "Waiting", mood: "thinking", tone: "curious" }
          : reviewFlagWindow
            ? { emote: "exclaim", label: "Flagged", mood: "confused", tone: "alert" }
            : { emote: "sparkle", label: "Approved", mood: "happy", tone: "spark" },
      frame,
      status: {
        label: reviewP <= 0 ? "Waiting" : reviewFlagWindow ? "Flagged" : "Approved",
        message:
          reviewP <= 0
            ? "waiting on the test run"
            : reviewFlagWindow
              ? "flagged a failing test"
              : "tests are green",
        mood: reviewP <= 0 ? "thinking" : reviewFlagWindow ? "confused" : "happy",
      },
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
    decisionEmote:
      jumpCycle < 18
        ? { emote: "heart", label: "Filed", mood: "love", tone: "affection" }
        : jumpCycle > 60
          ? { emote: "zzz", label: "Napping", mood: "sleepy", tone: "calm" }
          : null,
    frame,
    status: {
      label: jumpCycle < 18 ? "Done" : jumpCycle > 60 ? "Napping" : "Working",
      message:
        jumpCycle < 18
          ? "filed a doc update"
          : jumpCycle > 60
            ? "taking a quick break"
            : "organizing the docs",
      mood: jumpCycle < 18 ? "love" : jumpCycle > 60 ? "sleepy" : "working",
    },
    x: config.workX + Math.sin(local / 16 + config.phase) * 8,
    y: config.workY + jumpLift + Math.cos(local / 18 + config.phase) * 2,
  };
}

function summonedPetPose(
  frame: number,
  dropP: number,
): PetMotionKeyframe {
  if (frame >= PET_EXIT_MOVE_START_FRAME) {
    const moveP = easeOutCubic(
      progress(frame, PET_EXIT_MOVE_START_FRAME, PET_EXIT_MOVE_DURATION),
    );
    return {
      animationState: "running-right",
      frame,
      x: lerp(960, PET_EXIT_X, moveP),
      y: lerp(1008, PET_EXIT_Y, moveP),
    };
  }

  return {
    animationState:
      dropP < 0.82
        ? "waving"
        : frame >= TERMINAL_TYPING_DONE_FRAME
          ? "running"
          : "idle",
    frame,
    x: 960,
    y: lerp(602, 1008, dropP),
  };
}
