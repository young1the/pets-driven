import { ink } from "@pets-driven/design-system/tokens";

/**
 * The ball, drawn rather than typed.
 *
 * It started life as the ⚽ emoji, and the problem was never the football — it
 * was the medium. A flat vector glyph from the system emoji font sits beside
 * soft shaded sprites and reads as a sticker someone stuck on the desktop. So
 * this is the same classic black-and-white ball, drawn properly: a real
 * truncated icosahedron rather than a decorative scatter of shapes, lit from
 * the top left, and wearing the white rim the sprites carry so it belongs to
 * the same set.
 *
 * Its panels are `ink[950]` rather than `#000`, and its body runs to `ink[200]`
 * rather than grey. Black and white at a glance, still on the app's palette up
 * close — the same trick the sprites use to keep their outlines from going
 * hard.
 *
 * One SVG string, not two drawings. The desktop overlay and the place dialog
 * render it as an image and the playground canvas draws that same string, so no
 * surface can drift into showing a different ball — the rule the trinket glyph
 * catalogue exists to enforce, applied to a picture.
 */

/** The SVG's own coordinate space. Rendered at whatever size a host asks for. */
export const BALL_ART_SIZE = 64;

/**
 * How much of that box the ball itself spans: r=25 plus half of the 3px white
 * rim, doubled. The artwork is deliberately smaller than its box so a host can
 * place it on the body's centre without the rim touching the edge.
 */
export const BALL_ART_BODY_SPAN = 53;

export function ballArtSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BALL_ART_SIZE} ${BALL_ART_SIZE}" width="${BALL_ART_SIZE}" height="${BALL_ART_SIZE}">
  <defs>
    <radialGradient id="ball-body" cx="34%" cy="28%" r="78%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="55%" stop-color="${ink[50]}"/>
      <stop offset="100%" stop-color="${ink[200]}"/>
    </radialGradient>
    <clipPath id="ball-clip">
      <circle cx="32" cy="32" r="25"/>
    </clipPath>
  </defs>
  <circle cx="32" cy="32" r="25" fill="url(#ball-body)"/>
  <g clip-path="url(#ball-clip)">
    <!-- A truncated icosahedron, which is what a football actually is: one
         pentagon facing the viewer, five more that the silhouette cuts down to
         slivers, and the seams between them. The outer five sit *past* the rim
         on purpose — pull them inward and their black merges into a ring, at
         which point the white between them reads as the spokes of an alloy
         wheel. That was the first attempt. -->
    <g fill="${ink[950]}">
      <polygon points="32.00 21.00 42.46 28.60 38.47 40.90 25.53 40.90 21.54 28.60"/>
      <polygon points="42.87 17.04 39.79 7.53 47.87 1.66 55.95 7.53 52.87 17.04"/>
      <polygon points="49.60 37.71 57.68 31.84 65.76 37.71 62.68 47.22 52.68 47.22"/>
      <polygon points="32.00 50.50 40.08 56.37 37.00 65.88 27.00 65.88 23.92 56.37"/>
      <polygon points="14.40 37.71 11.32 47.22 1.32 47.22 -1.76 37.71 6.32 31.84"/>
      <polygon points="21.13 17.04 11.13 17.04 8.05 7.53 16.13 1.66 24.21 7.53"/>
    </g>
    <g stroke="${ink[950]}" stroke-width="1.1" stroke-linecap="round" opacity="0.7">
      <line x1="32" y1="21" x2="32" y2="7"/>
      <line x1="42.46" y1="28.6" x2="55.78" y2="24.27"/>
      <line x1="38.47" y1="40.9" x2="46.69" y2="52.23"/>
      <line x1="25.53" y1="40.9" x2="17.31" y2="52.23"/>
      <line x1="21.54" y1="28.6" x2="8.22" y2="24.27"/>
    </g>
    <!-- Ground-side shading, inside the clip so it hugs the silhouette. -->
    <ellipse cx="32" cy="68" rx="32" ry="22" fill="${ink[900]}" fill-opacity="0.18"/>
  </g>
  <circle cx="32" cy="32" r="25" fill="none" stroke="#FFFFFF" stroke-width="3"/>
  <ellipse cx="22" cy="19" rx="7" ry="5" fill="#FFFFFF" fill-opacity="0.55" transform="rotate(-28 22 19)"/>
</svg>`;
}

/** The SVG as a data URI, for a canvas that draws it through an <img>. */
export function ballArtDataUri(): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(ballArtSvg())}`;
}

/**
 * The same artwork as a canvas-drawable image.
 *
 * Built once and cached, because a canvas renderer runs every frame and cannot
 * await a decode. Until the first decode lands `drawBallArt` falls back to a
 * plain filled circle, which is one or two frames on a data URI and keeps the
 * ball from blinking into existence.
 */
let ballImage: HTMLImageElement | null = null;
let ballImageReady = false;

function ensureBallImage(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (!ballImage) {
    ballImage = new Image();
    ballImage.onload = () => {
      ballImageReady = true;
    };
    ballImage.src = ballArtDataUri();
  }
  return ballImageReady ? ballImage : null;
}

/**
 * Draw the ball centred on (x, y) at `radius`, rotated by `angle` radians.
 *
 * The rotation is the whole reason a canvas host cannot just paint a circle:
 * a sphere with no marking on it looks identical however far it has turned, so
 * a rolling ball would read as a sliding one.
 */
export function drawBallArt(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
): void {
  const image = ensureBallImage();
  context.save?.();
  context.translate?.(x, y);
  context.rotate?.(angle);
  // Scale by the ball's own span inside the artwork, not the artwork's box, or
  // the drawn ball comes out smaller than the physics body it stands for.
  const size = radius * 2 * (BALL_ART_SIZE / BALL_ART_BODY_SPAN);
  if (image) {
    context.drawImage(image, -size / 2, -size / 2, size, size);
  } else {
    context.beginPath();
    context.arc?.(0, 0, radius, 0, Math.PI * 2);
    context.fillStyle = "#FFFFFF";
    context.fill();
  }
  context.restore?.();
}

/**
 * The radius the artwork is actually drawn at in an overlay window, which is
 * what a roll has to be measured against — not the physics radius. The drawing
 * is deliberately larger than the body it stands for, and a ball that turned at
 * its body's rate would visibly under-rotate for its size.
 */
export const BALL_ART_RENDERED_RADIUS_PX = 26;

/**
 * Advance a rolling body's rotation by the distance it travelled.
 *
 * A ball rolling without slipping turns `distance / radius` radians, so this is
 * the whole of it. Pure and exported because the surface that calls it reads
 * its input from `window.screenX` inside an animation frame, which no test can
 * drive — the arithmetic is the part worth pinning down.
 */
export function rollRotation(current: number, deltaPx: number, radiusPx: number): number {
  if (radiusPx <= 0) return current;
  return current + deltaPx / radiusPx;
}
