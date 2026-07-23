/**
 * Geometry for the home screen's fanned pet cards.
 *
 * The fan used to be sized from the card count alone — a step of 150px down to
 * a hard floor of 88px, a fixed 22px drop per step — with nothing checking the
 * result against the space the fan actually has. Past roughly nine cards the
 * spread simply grew out of the window: with sixteen cards in a 1200px window
 * the outermost cards sat at x -267 and x 1570, and the lowest reached y 1082
 * in an 800px window. `.pd-home` clips rather than scrolls, so those cards were
 * unreachable, not merely off-centre.
 *
 * Everything here is therefore derived from the count *and* the width the fan
 * is being drawn into: as cards are added the spread, tilt and drop collapse
 * together so the outermost card's tilted footprint keeps fitting, while a
 * floor on the step guarantees each card an uncovered strip to grab.
 */

/** Rendered card width. Published to CSS as `--pd-fan-card-width`. */
export const FAN_CARD_WIDTH = 224;

/**
 * Card height assumed before the real cards have been measured. Height is not
 * fixed — a pet whose name wraps to a second line makes its card ~50px taller —
 * and since a tilted card swings its full height sideways, guessing low here is
 * what puts the ends of the fan back off screen. Callers pass the measured
 * height once they have one.
 */
export const FAN_CARD_HEIGHT = 300;

/** Tilt beyond which a fanned card stops reading as a card. */
const FAN_MAX_TILT_DEG = 16;

/** Step between neighbouring cards when the fan has room to spread. */
const FAN_BASE_STEP_X = 150;

/**
 * The narrowest step the fan may collapse to. Each card is covered by its inner
 * neighbour except for a strip exactly this wide, so the step *is* the card's
 * click target — 24px by the card's full height stays comfortably grabbable,
 * and stopping any higher would push the ends of a long fan out of the window,
 * which is the worse failure: an off-screen card cannot be clicked at all.
 */
export const FAN_MIN_STEP_X = 24;

/** Tilt added per step out from the middle before the fan collapses. */
const FAN_BASE_ROTATION_DEG = 7;

/** Drop added per step out from the middle before the fan collapses. */
const FAN_BASE_DROP_Y = 22;

/**
 * Total drop the outermost card may reach. The cards deliberately hang past the
 * bottom of their container (`bottom: -40px`); this bounds how much further the
 * ends of the fan may sink so they cannot leave the window.
 */
const FAN_MAX_DROP_Y = 60;

/** Breathing room kept between the outermost card and the container edge. */
const FAN_EDGE_GUTTER = 12;

export interface FanLayout {
  /** Horizontal distance between neighbouring cards, in px. */
  stepX: number;
  /** Tilt added per step out from the middle of the fan, in degrees. */
  rotationDeg: number;
  /** Vertical drop added per step out from the middle of the fan, in px. */
  dropY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * How many steps the outermost card sits from the middle of the fan. Cards are
 * laid out around the middle rather than around a chosen "centre" card, so an
 * even count fans out symmetrically instead of leaning one card to the right.
 */
export function fanSpread(count: number): number {
  return count > 0 ? (count - 1) / 2 : 0;
}

/** The offset, in steps, of the card at `index` from the middle of the fan. */
export function fanOffset(index: number, count: number): number {
  return index - fanSpread(count);
}

/**
 * Resolve the fan's geometry for `count` cards drawn into `containerWidth` px,
 * given the tallest card's height.
 *
 * A `containerWidth` of 0 means "not measured yet" (the first paint, or a
 * headless render) and keeps the uncollapsed spread, so the fan never starts
 * out artificially squashed.
 */
export function fanLayout(
  count: number,
  containerWidth: number,
  cardHeight: number = FAN_CARD_HEIGHT,
): FanLayout {
  const spread = fanSpread(count);

  if (spread <= 0) {
    return {
      stepX: FAN_BASE_STEP_X,
      rotationDeg: FAN_BASE_ROTATION_DEG,
      dropY: FAN_BASE_DROP_Y,
    };
  }

  // Tilt and drop are bounded by their totals at the ends of the fan, not by
  // the per-step amount, so a long fan stays as flat and shallow as it needs.
  const tiltedRotationDeg = Math.min(FAN_BASE_ROTATION_DEG, FAN_MAX_TILT_DEG / spread);
  const dropY = Math.min(FAN_BASE_DROP_Y, FAN_MAX_DROP_Y / spread);

  if (containerWidth <= 0) {
    return { stepX: FAN_BASE_STEP_X, rotationDeg: tiltedRotationDeg, dropY };
  }

  // How far the outermost card reaches past the point it is anchored at. Cards
  // pivot on `transform-origin: bottom center`, so a tilt swings their whole
  // height outward, not half of it — measuring from the card's centre instead
  // under-reserves by ~50px per card at the ends and puts them back off screen.
  function stepFor(rotationDeg: number): number {
    const tiltRad = ((rotationDeg * spread) / 180) * Math.PI;
    const reserve =
      (FAN_CARD_WIDTH / 2) * Math.cos(tiltRad) +
      Math.max(cardHeight, FAN_CARD_HEIGHT) * Math.sin(tiltRad) +
      FAN_EDGE_GUTTER;

    return (containerWidth / 2 - reserve) / spread;
  }

  const tiltedStepX = stepFor(tiltedRotationDeg);

  // The tilt is the expensive part of the reserve — it costs roughly a card's
  // height in width at each end. Once the fan is long enough that keeping it
  // would squeeze the cards below a clickable strip, drop the tilt instead:
  // a flat fan is a smaller loss than cards nobody can reach.
  const rotationDeg = tiltedStepX >= FAN_MIN_STEP_X ? tiltedRotationDeg : 0;

  return {
    // Past roughly forty cards even a flat fan runs out of width; it keeps the
    // minimum strip from there on and lets the ends overflow, because a thinner
    // strip would be no more clickable than an off-screen card.
    stepX: clamp(rotationDeg === 0 ? stepFor(0) : tiltedStepX, FAN_MIN_STEP_X, FAN_BASE_STEP_X),
    rotationDeg,
    dropY,
  };
}

/**
 * Stacking order for a card: highest in the middle, falling away evenly toward
 * both ends. Scaled by the spread rather than stepped by a fixed amount so a
 * long fan cannot run the outermost cards down to (or below) zero.
 */
export function fanZIndex(offset: number, count: number): number {
  const spread = fanSpread(count);

  return spread <= 0 ? 60 : Math.round(60 - (Math.abs(offset) / spread) * 48);
}
