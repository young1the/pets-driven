import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { presentBehaviorDecisionToken } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import {
  Caption,
  ClickBurst,
  DemoAppFrame,
  DemoCursor,
  DemoPetCard,
  DemoTerminal,
  DemoWindow,
  DesktopBackdrop,
  DesktopPet,
  HeartBurst,
  PoofBurst,
  TERMINAL_TYPING,
} from "./components";
import { DEMO_PETS, type PetMotionKeyframe, WORKSPACE_PETS } from "./fixtures";
import {
  beat,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  progress,
  pulse,
  scene,
  sceneLocal,
} from "./timeline";
import "./service-demo.css";

const [cato, otto, pip] = DEMO_PETS;

const HERO_SCALE = 1.5;
const MULTI_PET_SCALE = 1.35;
const CURSOR_SCALE = 1.8;

const HERO_X = 960;
/** Pets stand on the dock, the way they walk above a real taskbar. */
const HERO_GROUND_Y = 995;
const HERO_CENTER_Y = HERO_GROUND_Y - (PET_CELL_SIZE.height * HERO_SCALE) / 2;
const HERO_EXIT_X = 1300;
const DESKTOP_GROUND_Y = 985;

const CURSOR_PARK = { x: 1330, y: 700 };
/** Where the cursor lands on the pet — off the face, so it never hides the eyes. */
const HERO_TOUCH = { x: HERO_X + 58, y: HERO_CENTER_Y + 62 };

/**
 * Opacity for something that fades in, holds, then fades out — all four numbers
 * in the same units the surrounding beats use.
 */
function windowOpacity(
  frame: number,
  inStart: number,
  inLength: number,
  outStart: number,
  outLength: number,
) {
  return progress(frame, inStart, inLength) * (1 - progress(frame, outStart, outLength));
}

export function ServiceDemoVideo() {
  const frame = useCurrentFrame();
  const cameraScale = cameraAt(frame);
  const hero = heroPose(frame);
  const cursor = cursorAt(frame);

  const summonL = sceneLocal(frame, "summon");
  const terminalL = sceneLocal(frame, "terminal");
  const completedL = sceneLocal(frame, "completed");

  const appOpacity = windowOpacity(summonL, 0, 12, 54, 18);
  // One quick flick, no easing curve to admire — the card is out in 20 frames.
  const dragP = progress(summonL, 34, 20);
  const catoHoverPop = pulse(progress(summonL, 18, 16));
  const dragging = summonL >= 34 && summonL < 64;

  const terminalOpacity = windowOpacity(terminalL, 24, 22, scene("terminal").duration, 18);
  const clickBurstA = progress(terminalL, 6, 13);
  const clickBurstB = progress(terminalL, 20, 13);

  const heartBurstP = progress(completedL, 108, 30);
  const poofP = progress(completedL, 162, 14);

  return (
    <AbsoluteFill className="pd-video">
      <div className="pd-video__background" />

      {/* Everything diegetic lives under the camera, so push-ins can punch into
          the moments that matter. Captions deliberately stay outside it. */}
      <div
        className="pd-video-camera"
        style={{
          transform: `scale(${cameraScale})`,
          transformOrigin: `${CAMERA_ORIGIN.x}px ${CAMERA_ORIGIN.y}px`,
        }}
      >
        <main className="pd-video__stage">
          {/* No desktop chrome through the middle act — the summoned pet stands
              on the bare backdrop so nothing competes with it. */}
          <DemoAppFrame
            className="pd-video-main-frame"
            style={
              {
                opacity: appOpacity,
                transform: `translateX(-50%) translateY(${lerp(34, 0, easeOutCubic(progress(summonL, 0, 16)))}px)`,
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
                      opacity: dragging || summonL >= 64 ? 0 : 1,
                      transform: `translateX(-50%) translateY(${lerp(0, -10, catoHoverPop)}px) scale(${lerp(1, 1.14, catoHoverPop)})`,
                      zIndex: 120,
                    }}
                  >
                    <DemoPetCard featured={catoHoverPop > 0.15} pet={cato} />
                  </div>
                  <div className="pd-video-card pd-video-card--right">
                    <DemoPetCard pet={pip} />
                  </div>
                </div>
              </div>

              {/* Lives inside the window body, not the app frame, so the deck
                  end of the card is clipped by the window like its neighbours
                  instead of hanging outside it. */}
              {dragging ? (
                <div
                  className="pd-video-drag-card"
                  style={{
                    opacity: 1 - progress(summonL, 54, 10),
                    transform: `translateX(-50%) translateY(${lerp(0, -352, dragP)}px) scale(${lerp(1, 1.05, dragP)})`,
                  }}
                >
                  <DemoPetCard featured={dragP > 0.22} pet={cato} />
                </div>
              ) : null}
            </DemoWindow>
          </DemoAppFrame>

          {hero ? (
            <DesktopPet
              elapsedMs={frame * 33}
              pet={cato}
              presentation={hero}
              scale={HERO_SCALE}
              x={hero.x}
              y={hero.y}
            />
          ) : null}

          <section
            className="pd-video-terminal-zone"
            style={
              {
                opacity: terminalOpacity,
                transform: `translateX(-50%) translateY(${lerp(12, 0, easeOutCubic(progress(terminalL, 24, 22)))}px)`,
              } as CSSProperties
            }
          >
            <DemoTerminal
              className="pd-video-terminal-window"
              cwd={cato.cwd}
              typingStartFrame={beat("terminal", TERMINAL_TYPING.command + 30)}
            />
          </section>

          <Sequence
            durationInFrames={scene("multi-pet").duration}
            from={scene("multi-pet").from}
            layout="none"
            name="One pet per project"
          >
            <MultiPetScene />
          </Sequence>

          <Sequence
            durationInFrames={scene("closing").duration}
            from={scene("closing").from}
            layout="none"
            name="Closing"
          >
            <ClosingScene />
          </Sequence>

          {clickBurstA > 0 && clickBurstA < 1 ? (
            <ClickBurst progress={clickBurstA} x={HERO_TOUCH.x} y={HERO_TOUCH.y} />
          ) : null}
          {clickBurstB > 0 && clickBurstB < 1 ? (
            <ClickBurst progress={clickBurstB} x={HERO_TOUCH.x} y={HERO_TOUCH.y} />
          ) : null}
          {heartBurstP > 0 && heartBurstP < 1 ? (
            <HeartBurst progress={heartBurstP} x={HERO_X} y={HERO_CENTER_Y} />
          ) : null}
          {poofP > 0 && poofP < 1 ? (
            <PoofBurst progress={poofP} x={HERO_EXIT_X} y={HERO_CENTER_Y} />
          ) : null}

          {cursor ? <DemoCursor scale={cursor.scale} x={cursor.x} y={cursor.y} /> : null}
        </main>
      </div>

      {/* Captions are titles, not set dressing — the camera must not drag them
          out of frame during a push-in. */}
      <main className="pd-video__stage pd-video__stage--overlay">
        <SceneCaption opacity={windowOpacity(summonL, 2, 10, 84, 14)}>
          Summon a pet from your deck.
        </SceneCaption>
        <SceneCaption opacity={windowOpacity(terminalL, 0, 10, 96, 14)}>
          Double-click it to open its terminal.
        </SceneCaption>
        <SceneCaption opacity={windowOpacity(completedL, 30, 10, 62, 12)}>
          Done — and it waits.
        </SceneCaption>
        <SceneCaption opacity={windowOpacity(completedL, 66, 10, 140, 14)}>
          Pet it to release.
        </SceneCaption>
        <SceneCaption opacity={windowOpacity(sceneLocal(frame, "multi-pet"), 4, 10, 34, 12)}>
          Every project gets its own.
        </SceneCaption>
        <SceneCaption opacity={windowOpacity(sceneLocal(frame, "multi-pet"), 52, 10, 168, 14)}>
          And a life of their own.
        </SceneCaption>
      </main>
    </AbsoluteFill>
  );
}

function SceneCaption({ children, opacity }: { children: ReactNode; opacity: number }) {
  if (opacity <= 0) {
    return null;
  }
  return (
    <Caption
      style={{
        left: "50%",
        opacity,
        textAlign: "center",
        top: 118,
        transform: "translateX(-50%)",
      }}
    >
      {children}
    </Caption>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero pet — spans summon through the two attention holds                     */
/* -------------------------------------------------------------------------- */

function heroPose(frame: number): PetMotionKeyframe | null {
  const summonL = sceneLocal(frame, "summon");
  const terminalL = sceneLocal(frame, "terminal");
  const completedL = sceneLocal(frame, "completed");

  if (summonL < 58 || completedL >= 168) {
    return null;
  }

  // Dropped out of the card and onto the desktop. The fall accelerates to carry
  // the flick's momentum through, then the pet settles and waves.
  if (terminalL < 0) {
    const dropP = easeInCubic(progress(summonL, 58, 26));
    return {
      activity: dropP < 1 ? "midAir" : "greeting",
      animationState: dropP < 1 ? "jumping" : "waving",
      decisionEmote: dropP < 1 ? null : presentBehaviorDecisionToken("greet"),
      frame,
      x: HERO_X,
      y: lerp(560, HERO_GROUND_Y, dropP),
    };
  }

  // Double-clicked open; the bound agent picks up the task.
  if (completedL < 0) {
    return {
      animationState: terminalL >= 104 ? "running" : "idle",
      frame,
      x: HERO_X,
      y: HERO_GROUND_Y,
    };
  }

  if (completedL < 26) {
    return {
      animationState: "running",
      frame,
      overlay: {
        kind: "agent-channel",
        label: null,
        message: "running the test suite",
        status: "working",
      },
      working: true,
      x: HERO_X,
      y: HERO_GROUND_Y,
    };
  }

  // The hold. Hopping in place: done, pleased about it, and going nowhere until
  // you say so — this is the whole point of the video. The "Done" capsule and
  // its sparkle come from the completed agent status, not from us.
  if (completedL < 108) {
    return {
      animationState: "jumping",
      frame,
      overlay: {
        kind: "agent-channel",
        label: null,
        message: "tests are green",
        status: "completed",
      },
      working: true,
      x: HERO_X,
      y: HERO_GROUND_Y - Math.abs(Math.sin((completedL - 26) / 9)) * 20,
    };
  }

  // Petted — the task is released, and `beingPetted` is a real pet activity.
  if (completedL < 142) {
    return {
      activity: "beingPetted",
      animationState: "waving",
      frame,
      working: true,
      x: HERO_X,
      y: HERO_GROUND_Y,
    };
  }

  const exitP = easeOutCubic(progress(completedL, 142, 20));
  return {
    animationState: "running-right",
    frame,
    x: lerp(HERO_X, HERO_EXIT_X, exitP),
    y: lerp(HERO_GROUND_Y, HERO_GROUND_Y - 24, exitP),
  };
}

/* -------------------------------------------------------------------------- */
/* Cursor                                                                      */
/* -------------------------------------------------------------------------- */

function cursorAt(frame: number): { scale: number; x: number; y: number } | null {
  const summonL = sceneLocal(frame, "summon");
  const terminalL = sceneLocal(frame, "terminal");
  const completedL = sceneLocal(frame, "completed");
  const heroCenter = HERO_TOUCH;

  if (summonL < 6 || completedL >= 150) {
    return null;
  }

  if (terminalL < 0) {
    // Swoops in, sizes up the one card it wants, then flicks it out of the deck.
    if (summonL < 22) {
      const p = easeOutCubic(progress(summonL, 6, 16));
      return {
        scale: CURSOR_SCALE,
        x: lerp(1680, HERO_X, p),
        y: 828 - Math.sin(p * Math.PI) * 46,
      };
    }
    if (summonL < 34) {
      return {
        scale: CURSOR_SCALE,
        x: HERO_X + Math.sin((summonL - 22) / 2.4) * 3,
        y: 828,
      };
    }
    if (summonL < 54) {
      // Rides the card out at the same speed.
      return { scale: CURSOR_SCALE, x: HERO_X, y: lerp(828, 498, progress(summonL, 34, 20)) };
    }
    if (summonL < 88) {
      // Lets go and stays put — the pet is its own thing now.
      return { scale: CURSOR_SCALE, x: HERO_X, y: 498 };
    }
    const p = easeOutCubic(progress(summonL, 88, 20));
    return {
      scale: CURSOR_SCALE,
      x: HERO_X,
      y: lerp(498, heroCenter.y, p),
    };
  }

  if (completedL < 0) {
    if (terminalL < 6) {
      return { scale: CURSOR_SCALE, ...heroCenter };
    }
    if (terminalL < 34) {
      const clicking = terminalL % 16 < 8;
      return { scale: clicking ? CURSOR_SCALE * 0.86 : CURSOR_SCALE, ...heroCenter };
    }
    const p = easeOutCubic(progress(terminalL, 34, 16));
    return {
      scale: CURSOR_SCALE,
      x: lerp(heroCenter.x, CURSOR_PARK.x, p),
      y: lerp(heroCenter.y, CURSOR_PARK.y, p),
    };
  }

  // Stays parked well past the completion, so the badge is visibly ignored for a
  // beat before anyone reaches for it.
  if (completedL < 62) {
    return { scale: CURSOR_SCALE, ...CURSOR_PARK };
  }
  if (completedL < 84) {
    const p = easeOutCubic(progress(completedL, 62, 22));
    return {
      scale: CURSOR_SCALE,
      x: lerp(CURSOR_PARK.x, heroCenter.x, p),
      y: lerp(CURSOR_PARK.y, heroCenter.y, p),
    };
  }
  // The stroke gesture: back and forth across the pet, easing at each turn.
  if (completedL < 108) {
    const t = progress(completedL, 84, 24);
    return {
      scale: CURSOR_SCALE * 0.94,
      x: heroCenter.x + Math.sin(t * Math.PI * 2 * 2.5) * 52,
      y: heroCenter.y + Math.cos(t * Math.PI * 2 * 2.5) * 9,
    };
  }
  if (completedL < 130) {
    return { scale: CURSOR_SCALE, ...heroCenter };
  }
  const p = easeOutCubic(progress(completedL, 130, 20));
  return {
    scale: CURSOR_SCALE,
    x: lerp(heroCenter.x, 1620, p),
    y: lerp(heroCenter.y, 520, p),
  };
}

/* -------------------------------------------------------------------------- */
/* One pet per project                                                         */
/* -------------------------------------------------------------------------- */

/** Frames of head start each pet's sprite clock carries, to break the lockstep. */
const SPRITE_PHASE_OFFSET: Record<string, number> = { bloop: 0, fenn: 5, mochi: 11 };

function MultiPetScene() {
  const local = useCurrentFrame();
  const opacity = windowOpacity(local, 0, 10, scene("multi-pet").duration - 10, 10);

  return (
    <section className="pd-video-multi" style={{ opacity }}>
      <DesktopBackdrop />
      {WORKSPACE_PETS.map((pet) => {
        const pose = multiPetPose(pet.id, local);
        return (
          <DesktopPet
            // Each pet reads the atlas from its own offset, so two pets running
            // side by side are never on the same stride frame.
            elapsedMs={(local + SPRITE_PHASE_OFFSET[pet.id]) * 33}
            key={pet.id}
            pet={pet}
            presentation={pose}
            scale={MULTI_PET_SCALE}
            x={pose.x}
            y={pose.y}
          />
        );
      })}
    </section>
  );
}

/**
 * First the claim — one pet per project — and then the part you only see if you
 * leave them alone.
 *
 * There is deliberately no shared beat table below. An earlier cut had two pets
 * playing tag off one timeline, and a pair driven by the same clock reads as
 * choreography no matter how the easing is staggered. Each routine here is a
 * pure function of its own period and phase, so nothing can ever line up.
 */
const PACK_SHOT_END = 40;

const MULTI_PET_HOME: Record<string, number> = { bloop: 940, fenn: 1450, mochi: 380 };

function multiPetPose(petId: string, local: number): PetMotionKeyframe {
  const home = MULTI_PET_HOME[petId];
  const onTheClock = local < PACK_SHOT_END;

  // The pack shot: each pet parked on its own agent.
  if (onTheClock) {
    if (petId === "bloop") {
      return {
        animationState: "running",
        frame: local,
        overlay: {
          kind: "agent-channel",
          label: null,
          message: "running the deploy",
          status: "working",
        },
        working: true,
        x: home,
        y: DESKTOP_GROUND_Y,
      };
    }
    if (petId === "fenn") {
      return {
        animationState: "review",
        frame: local,
        overlay: {
          kind: "agent-channel",
          label: null,
          message: "a test is failing",
          status: "failed",
        },
        working: true,
        x: home,
        y: DESKTOP_GROUND_Y,
      };
    }
    return {
      activity: "napping",
      animationState: "idle",
      decisionEmote: presentBehaviorDecisionToken("nap"),
      frame: local,
      working: true,
      x: home,
      y: DESKTOP_GROUND_Y,
    };
  }

  const t = local - PACK_SHOT_END;

  if (petId === "mochi") {
    return hoppingPose(t, home);
  }
  if (petId === "bloop") {
    return wanderingPose(t, home);
  }
  return pottering(t, home);
}

/** Mochi wakes up and bounces: a real arc, with a beat of rest between hops. */
function hoppingPose(t: number, home: number): PetMotionKeyframe {
  const HOP = 20;
  const REST = 14;
  const cycle = t % (HOP + REST);
  const airborne = cycle < HOP;
  const arc = airborne ? Math.sin((cycle / HOP) * Math.PI) : 0;
  // Each hop carries it a little way along, and the drift turns it around.
  const drift = Math.sin(t / 44) * 96;

  return {
    activity: airborne ? "hopping" : "exploring",
    animationState: airborne ? "jumping" : "idle",
    // Sparkles on the push-off only; carrying the token through the whole arc
    // left a badge pinned over its head the entire scene.
    decisionEmote: cycle < 7 ? presentBehaviorDecisionToken("request-jump") : null,
    frame: t,
    x: home + drift,
    y: DESKTOP_GROUND_Y - arc * 92,
  };
}

/**
 * Bloop ambles. Speed comes from the derivative of its own path, so it slows to
 * a stop at each turn and changes facing while standing still — a pet cannot
 * reverse mid-stride.
 */
function wanderingPose(t: number, home: number): PetMotionKeyframe {
  const speed = Math.cos(t / 27);
  const moving = Math.abs(speed) > 0.3;

  return {
    activity: moving ? "exploring" : "observing",
    animationState: moving ? (speed > 0 ? "running-right" : "running-left") : "idle",
    // A stroll is background life; `observe` put a "?" over its head that read
    // as the pet being stuck rather than idly looking around.
    decisionEmote: null,
    frame: t,
    x: home + Math.sin(t / 27) * 155,
    y: DESKTOP_GROUND_Y + Math.cos(t / 19) * 4,
  };
}

/** Fenn stays put and busies itself — looking around, then a tidy-up. */
function pottering(t: number, home: number): PetMotionKeyframe {
  const cycle = t % 96;
  const grooming = cycle >= 54;

  return {
    activity: grooming ? "grooming" : "observing",
    animationState: grooming ? "idle" : "review",
    decisionEmote: grooming ? presentBehaviorDecisionToken("groom") : null,
    frame: t,
    x: home + Math.sin(t / 33) * 26,
    y: DESKTOP_GROUND_Y + Math.cos(t / 23) * 4,
  };
}

/* -------------------------------------------------------------------------- */
/* Closing                                                                     */
/* -------------------------------------------------------------------------- */

function ClosingScene() {
  const local = useCurrentFrame();
  return (
    <section className="pd-video-closing" style={{ opacity: progress(local, 0, 10) }}>
      <div className="pd-video-closing__wash" />
      <div className="pd-video-closing__dots" />
      <div
        className="pd-video-closing__reveal"
        style={{
          opacity: progress(local, 0, 22),
          transform: `translateY(${lerp(26, 0, easeOutCubic(progress(local, 0, 26)))}px)`,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: Remotion renders outside Next.js, so next/image is unavailable here. */}
        <img alt="" src={staticFile("petsdriven-mark.svg")} />
        <h2>
          Pets<span className="pd-video-closing__hyphen">-</span>Driven
        </h2>
        <p className="pd-video-closing__eyebrow">a cute way to develop with AI agents</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Camera                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The camera zooms around the bottom edge of the frame. Pets live on the floor,
 * so anchoring there crops the empty upper desktop instead of the action.
 */
export const CAMERA_ORIGIN = { x: 960, y: 1080 };

/**
 * Exactly one push-in, on the one beat that needs it.
 *
 * Earlier cuts also punched in on the landing and drifted through the terminal.
 * Three moves in twenty seconds read as restlessness, not emphasis — and a 1.04
 * drift is motion nobody can name. Everything except the attention hold now sits
 * still, so when the camera finally moves it means something.
 */
const CAMERA_KEYS: { frame: number; scale: number }[] = [
  { frame: beat("summon", 0), scale: 1 },
  // The pet has finished and is waiting on you: come in close for the capsule
  // and the petting, hold through the release, pull back as it leaves.
  { frame: beat("completed", 20), scale: 1 },
  { frame: beat("completed", 64), scale: 1.22 },
  { frame: beat("completed", 142), scale: 1.22 },
  { frame: beat("completed", 172), scale: 1 },
  // Wide and flat for the pack shot — three pets have to fit side by side.
  { frame: beat("multi-pet", 0), scale: 1 },
  { frame: beat("closing", 0), scale: 1 },
];

function cameraAt(frame: number) {
  const first = CAMERA_KEYS[0];
  if (frame <= first.frame) {
    return first.scale;
  }
  for (let index = 1; index < CAMERA_KEYS.length; index += 1) {
    const from = CAMERA_KEYS[index - 1];
    const to = CAMERA_KEYS[index];
    if (frame <= to.frame) {
      return lerp(
        from.scale,
        to.scale,
        easeInOutCubic((frame - from.frame) / (to.frame - from.frame)),
      );
    }
  }
  return CAMERA_KEYS[CAMERA_KEYS.length - 1].scale;
}
