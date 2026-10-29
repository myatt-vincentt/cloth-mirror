// A pinch in the air (thumb tip to index tip), read about 12 times a second.
// Pure, so it can be tested on its own.
//
// Closing is harder than staying closed, so a pinch never flickers, and it
// must hold for two readings before it counts. Between readings the pinch
// point glides smoothly from the last reading to the newest one.

export const PINCH = {
  /** Pinch amount (1 = tips touching) that closes it, and opens it. */
  close: 0.62,
  open: 0.4,
  /** Readings in a row a closed pinch must last before it grabs. */
  confirm: 2,
  /** A fist also brings the tips together; above this grab it isn't a pinch. */
  maxGrab: 0.5,
  /**
   * Two hands closer than this (palm to palm, tracker units: the screen is 2
   * wide) overlap, and the hidden fingers misread as a pinch.
   */
  handsApart: 0.3,
  /** A pinch this close to an edge (share of the screen) doesn't start. */
  edge: 0.03,
  /** Tiny moves are eased (this share taken), so a held hand doesn't shake. */
  steady: 0.5,
  steadyPx: 5,
};

export type PinchState = {
  closed: boolean;
  /** Closed readings in a row. */
  run: number;
};

export const pinchState = (): PinchState => ({ closed: false, run: 0 });

/** Feed one reading; true while the pinch is confirmed closed. */
export const feedPinch = (
  s: PinchState,
  amount: number,
  grab: number,
  handsTogether: boolean,
): boolean => {
  const closed =
    grab <= PINCH.maxGrab &&
    !handsTogether &&
    (s.closed ? amount > PINCH.open : amount >= PINCH.close);
  s.closed = closed;
  s.run = closed ? s.run + 1 : 0;
  return s.run >= PINCH.confirm;
};

type Point = { x: number; y: number };

/** The glide between the last two readings (canvas px, ms). */
export type Glide = {
  from: Point;
  to: Point;
  at: number;
  span: number;
};

export const startGlide = (p: Point, now: number): Glide => ({
  from: { ...p },
  to: { ...p },
  at: now,
  span: 1,
});

/** Where the point is now: one reading behind, so the motion is smooth. */
export const glideAt = (g: Glide, now: number): Point => {
  const t = Math.min(1, Math.max(0, (now - g.at) / g.span));
  const e = t * t * (3 - 2 * t);
  return {
    x: g.from.x + (g.to.x - g.from.x) * e,
    y: g.from.y + (g.to.y - g.from.y) * e,
  };
};

/** A new reading at `now`: glide on to it from wherever the point is. */
export const feedGlide = (g: Glide, raw: Point, now: number) => {
  const here = glideAt(g, now);
  const dx = raw.x - g.to.x;
  const dy = raw.y - g.to.y;
  const px = Math.hypot(dx, dy);
  const k = Math.min(
    1,
    PINCH.steady + (1 - PINCH.steady) * (px / PINCH.steadyPx),
  );
  const span = Math.min(150, Math.max(40, now - g.at));
  g.from = here;
  g.to = { x: g.to.x + dx * k, y: g.to.y + dy * k };
  g.at = now;
  g.span = span;
};

/**
 * The live hand in front of the cloth (LiveHands.tsx) is drawn inside an
 * outline from tracking, which is a moment behind the picture. These say how
 * solid it should be: sharp while the outline can only be a little off, gone
 * while it could show a patch of the old background.
 */
export const OUTLINE = {
  /** Outline error (in hand sizes) still drawn fully, and where it is gone. */
  sharp: 0.08,
  gone: 0.24,
  /** Tracking's own delay on top of the reading's age (ms). */
  latency: 30,
  /** Fade speeds (1/s): back in gently, out at once. */
  rise: 6,
  fall: 40,
};

/** How far off the outline may be now, in hand sizes. */
export const outlineError = (speed: number, ageMs: number) =>
  speed * ((ageMs + OUTLINE.latency) / 1000);

/** How solid the live hand should be for an outline error. */
export const outlineTarget = (error: number) => {
  const t = Math.min(
    1,
    Math.max(0, (error - OUTLINE.sharp) / (OUTLINE.gone - OUTLINE.sharp)),
  );
  return 1 - t * t * (3 - 2 * t);
};

/** Ease the hand's solidity towards its target over `dt` seconds. */
export const stepOutline = (alpha: number, target: number, dt: number) => {
  const rate = target < alpha ? OUTLINE.fall : OUTLINE.rise;
  return alpha + (target - alpha) * (1 - Math.exp(-rate * dt));
};
