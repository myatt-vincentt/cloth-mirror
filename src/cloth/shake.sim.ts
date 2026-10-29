// A head shake, read from the head's yaw (left-right turn): the head turns
// one way, back the other way, and back again, each turn at least `swing`
// wide, all within `window` seconds. Looking left and then right once is not
// a shake. Pure, so it can be tested on its own.

export const SHAKE = {
  /** The smallest turn that counts (radians, about 6°). */
  swing: 0.1,
  /** Turning points needed: left, right, left (or the other way round). */
  turns: 3,
  /** All of them within this many seconds. */
  window: 2.6,
  /** No second shake this soon after one (s). */
  cooldown: 1.2,
};

export type ShakeState = {
  /** The furthest point of the current turn, and which way it is going. */
  peak: number;
  dir: 0 | 1 | -1;
  /** Times of the turning points so far. */
  turns: number[];
  lastShake: number;
};

export const shakeState = (): ShakeState => ({
  peak: 0,
  dir: 0,
  turns: [],
  lastShake: -Infinity,
});

/** Forget the head (it left the picture). */
export const resetShake = (s: ShakeState) => {
  s.dir = 0;
  s.turns = [];
};

/** Feed one yaw reading at time `t` (s); true when a shake just finished. */
export const feedShake = (s: ShakeState, yaw: number, t: number): boolean => {
  if (s.dir === 0) {
    // The first reading: follow the head from wherever it is.
    s.dir = 1;
    s.peak = yaw;
    return false;
  }
  if ((s.dir === 1 && yaw > s.peak) || (s.dir === -1 && yaw < s.peak)) {
    s.peak = yaw;
    return false;
  }
  if (Math.abs(yaw - s.peak) < SHAKE.swing) return false;
  // Turned back far enough: the peak was a turning point.
  s.turns = s.turns.filter((x) => t - x < SHAKE.window);
  s.turns.push(t);
  s.dir = s.dir === 1 ? -1 : 1;
  s.peak = yaw;
  if (s.turns.length >= SHAKE.turns && t - s.lastShake > SHAKE.cooldown) {
    s.lastShake = t;
    s.turns = [];
    return true;
  }
  return false;
};
