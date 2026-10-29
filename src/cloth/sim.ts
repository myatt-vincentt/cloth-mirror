// The cloth: a grid of particles joined by distance constraints, moved with
// Verlet integration. Plain numbers only (no three.js), so it can be tested
// and timed on its own.
//
// The sheet hangs in a flat rectangle (its "home": the camera picture). The
// top corners and a few points along the top edge are pinned there, so it
// behaves like a curtain: pull, peel or crumple it and it always swings back
// and settles. Gravity only pulls on the parts that have been moved away from
// home, so the resting sheet lies exactly on the picture.

export type ClothPhysics = {
  /** Constraint passes per step: more is stiffer. */
  iterations: number;
  /** How hard the sheet keeps its length (0–1). Below 1 it stretches. */
  stretch: number;
  /** The most the sheet may stretch away from the pins (0.05 = 5%). */
  slack: number;
  /** How hard it resists bending (0–1): low folds like silk, high like denim. */
  bend: number;
  /** Velocity kept per step (0–1): lower settles sooner. */
  damping: number;
  /** Pull back towards home (1/s²): higher springs back faster. */
  homeSpring: number;
  /** Gravity on a moved part (world units/s²). */
  gravity: number;
  /** How far squeezed cloth buckles out of the picture, so crumples wrinkle. */
  buckle: number;
  /** How much a crumple leaves a lasting crease (0 = none). */
  creaseMemory: number;
  /** How fast creases fade (1/s). */
  creaseFade: number;
};

/** A hand or finger holding a small patch of the cloth. */
type Grab = {
  /** The particle under the finger. */
  index: number;
  /** The patch around it, and each one's offset from it at grab time. */
  patch: number[];
  offsets: Float32Array;
  /** Where the finger wants the held particle (world). */
  target: [number, number, number];
  /** The previous target, for the throw on release. */
  last: [number, number, number];
};

const STEP = 1 / 60;
/** A held point may stretch the sheet this much more than it stretches alone. */
const GRAB_STRETCH = 0.06;
/**
 * Once nobody holds it, the sheet slowly firms up so even a soft fabric
 * unfolds itself: a flap folded flat over the sheet has no other way back.
 * It starts after this many seconds and is full this many seconds later.
 */
const SETTLE_DELAY = 0.5;
const SETTLE_RAMP = 1.2;
const SETTLE_BEND = 0.5;
/**
 * Last of all, a sheet left alone this long that is still not home (a knot
 * the physics can't undo) eases the rest of the way by itself, like a
 * re-hang, so it always settles.
 */
const TIDY_DELAY = 3.5;
const TIDY_LEFT = 0.02;
const TIDY_DURATION = 1.2;
/** Closer to home than this (world units, well under a pixel) is at rest. */
const SLEEP_LEFT = 2e-4;
/** While settling, cloth lying face-down lifts towards you this fast (units/s). */
const UNFOLD_LIFT = 0.6;
const MAX_STEPS = 3;
/** Gravity grows to full over this distance from home (world units). */
const GRAVITY_RAMP = 0.35;
/** How far the cloth may go behind the picture / come towards the camera. */
const BEHIND = 0.8;
const TOWARDS = 4;

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export class Cloth {
  readonly cols: number;

  readonly rows: number;

  readonly count: number;

  readonly width: number;

  readonly height: number;

  /** Current positions, xyz per particle. */
  readonly pos: Float32Array;

  private readonly prev: Float32Array;

  /** The flat resting place of each particle (its spot in the picture). */
  readonly home: Float32Array;

  /** A lasting crease height per particle (foil keeps its crinkles). */
  readonly crease: Float32Array;

  private readonly invMass: Float32Array;

  private readonly pinned: Uint8Array;

  /** Constraints: particle pairs, rest lengths, and which kind. */
  private readonly ca: Uint32Array;

  private readonly cb: Uint32Array;

  private readonly rest: Float32Array;

  /** 0 = stretch (edges and diagonals), 1 = bend (every second particle). */
  private readonly kind: Uint8Array;

  /** A smooth up/down sign field: which way each spot buckles. */
  private readonly buckleSign: Float32Array;

  /** Each particle's nearest pin and its resting distance to it. */
  private readonly tetherPin: Uint32Array;

  private readonly tetherRest: Float32Array;

  private readonly grabs = new Map<number, Grab>();

  private accumulator = 0;

  /** Seconds since the last grab let go. */
  private idle = 0;

  /** The leftover-knot check ran for this release. */
  private tidied = false;

  /** Resting on the picture with nothing to simulate. */
  asleep = true;

  private rehang: {
    from: Float32Array;
    t: number;
    duration: number;
    keepCreases: boolean;
  } | null = null;

  physics: ClothPhysics;

  private readonly zMin: number;

  private readonly zMax: number;

  /** Milliseconds the last `update` took, for the frame budget. */
  lastMs = 0;

  constructor(
    cols: number,
    rows: number,
    width: number,
    height: number,
    z: number,
    physics: ClothPhysics,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.count = cols * rows;
    this.width = width;
    this.height = height;
    this.physics = physics;
    this.zMin = z - BEHIND;
    this.zMax = z + TOWARDS;
    const n = this.count;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.home = new Float32Array(n * 3);
    this.crease = new Float32Array(n);
    this.invMass = new Float32Array(n).fill(1);
    this.pinned = new Uint8Array(n);
    this.buckleSign = new Float32Array(n);

    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        const x = -width / 2 + (i / (cols - 1)) * width;
        const y = height / 2 - (j / (rows - 1)) * height;
        this.home[k * 3] = x;
        this.home[k * 3 + 1] = y;
        this.home[k * 3 + 2] = z;
        // Wrinkles bulge mostly towards the camera, in soft blobs.
        const s =
          Math.sin(i * 0.9 + j * 0.37) * Math.cos(j * 0.8 - i * 0.29) + 0.35;
        this.buckleSign[k] = s >= 0 ? 1 : -0.6;
      }
    }
    this.pos.set(this.home);
    this.prev.set(this.home);

    // Pins: both top corners and about every sixth point along the top.
    const spacing = Math.max(2, Math.round((cols - 1) / 6));
    for (let i = 0; i < cols; i += 1) {
      if (i % spacing === 0 || i === cols - 1) {
        this.pinned[i] = 1;
        this.invMass[i] = 0;
      }
    }

    this.tetherPin = new Uint32Array(n);
    this.tetherRest = new Float32Array(n);
    for (let k = 0; k < n; k += 1) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < cols; i += 1) {
        if (this.pinned[i]) {
          const d = Math.hypot(
            this.home[k * 3] - this.home[i * 3],
            this.home[k * 3 + 1] - this.home[i * 3 + 1],
          );
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      this.tetherPin[k] = best;
      this.tetherRest[k] = bestD;
    }

    const a: number[] = [];
    const b: number[] = [];
    const kinds: number[] = [];
    const link = (p: number, q: number, kd: number) => {
      a.push(p);
      b.push(q);
      kinds.push(kd);
    };
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        if (i + 1 < cols) link(k, k + 1, 0);
        if (j + 1 < rows) link(k, k + cols, 0);
        if (i + 1 < cols && j + 1 < rows) {
          link(k, k + cols + 1, 0);
          link(k + 1, k + cols, 0);
        }
        if (i + 2 < cols) link(k, k + 2, 1);
        if (j + 2 < rows) link(k, k + 2 * cols, 1);
      }
    }
    this.ca = Uint32Array.from(a);
    this.cb = Uint32Array.from(b);
    this.kind = Uint8Array.from(kinds);
    this.rest = new Float32Array(a.length);
    for (let c = 0; c < a.length; c += 1) {
      const p = a[c] * 3;
      const q = b[c] * 3;
      this.rest[c] = Math.hypot(
        this.home[p] - this.home[q],
        this.home[p + 1] - this.home[q + 1],
      );
    }
  }

  get constraintCount() {
    return this.rest.length;
  }

  isPinned(k: number) {
    return this.pinned[k] === 1;
  }

  /** Grid neighbours within `radius` cells, the particle itself first. */
  private patchAround(k: number, radius: number) {
    const ci = k % this.cols;
    const cj = Math.floor(k / this.cols);
    const out = [k];
    for (let dj = -radius; dj <= radius; dj += 1) {
      for (let di = -radius; di <= radius; di += 1) {
        const i = ci + di;
        const j = cj + dj;
        if (
          (di !== 0 || dj !== 0) &&
          i >= 0 &&
          j >= 0 &&
          i < this.cols &&
          j < this.rows &&
          !this.pinned[j * this.cols + i]
        )
          out.push(j * this.cols + i);
      }
    }
    return out;
  }

  /** Hold the patch around particle `k` with grab `id`. */
  grab(id: number, k: number) {
    this.release(id);
    this.rehang = null;
    this.asleep = false;
    const patch = this.patchAround(k, 1);
    const offsets = new Float32Array(patch.length * 3);
    const p = this.pos;
    patch.forEach((q, n) => {
      offsets[n * 3] = p[q * 3] - p[k * 3];
      offsets[n * 3 + 1] = p[q * 3 + 1] - p[k * 3 + 1];
      offsets[n * 3 + 2] = p[q * 3 + 2] - p[k * 3 + 2];
    });
    const at: [number, number, number] = [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]];
    this.grabs.set(id, {
      index: k,
      patch,
      offsets,
      target: [...at],
      last: [...at],
    });
  }

  /**
   * Move grab `id` so its particle heads for `target` (world). The sheet
   * only reaches so far from its pins: pulled further, it goes taut and the
   * held point stays at the end of its reach.
   */
  moveGrab(id: number, x: number, y: number, z: number) {
    const g = this.grabs.get(id);
    if (!g) return;
    const q = this.tetherPin[g.index] * 3;
    const px = this.home[q];
    const py = this.home[q + 1];
    const pz = this.home[q + 2];
    const tz = Math.min(this.zMax, Math.max(this.zMin, z));
    const dx = x - px;
    const dy = y - py;
    const dz = tz - pz;
    const d = Math.hypot(dx, dy, dz);
    const reach =
      this.tetherRest[g.index] * (1 + this.physics.slack + GRAB_STRETCH);
    const f = d > reach ? reach / d : 1;
    g.target[0] = px + dx * f;
    g.target[1] = py + dy * f;
    g.target[2] = pz + dz * f;
  }

  /** Let go. The patch keeps the finger's last motion, so a flick throws. */
  release(id: number) {
    const g = this.grabs.get(id);
    if (!g) return;
    this.grabs.delete(id);
    const vx = (g.target[0] - g.last[0]) * 0.8;
    const vy = (g.target[1] - g.last[1]) * 0.8;
    const vz = (g.target[2] - g.last[2]) * 0.8;
    g.patch.forEach((q) => {
      this.prev[q * 3] = this.pos[q * 3] - vx;
      this.prev[q * 3 + 1] = this.pos[q * 3 + 1] - vy;
      this.prev[q * 3 + 2] = this.pos[q * 3 + 2] - vz;
    });
  }

  releaseAll() {
    [...this.grabs.keys()].forEach((id) => this.release(id));
  }

  /** The particle each grab holds (for the debug view). */
  grabbed() {
    return [...this.grabs.entries()].map(([id, g]) => ({ id, index: g.index }));
  }

  /**
   * Re-hang the sheet neatly: everything eases home and stops. Foil creases
   * are smoothed out too, unless `keepCreases`.
   */
  startRehang(duration = 0.9, keepCreases = false) {
    this.releaseAll();
    this.asleep = false;
    this.rehang = { from: this.pos.slice(), t: 0, duration, keepCreases };
  }

  get rehanging() {
    return this.rehang !== null;
  }

  /** The farthest any particle is from home (world units). */
  maxDisplacement() {
    let m = 0;
    for (let k = 0; k < this.count * 3; k += 3) {
      const d = Math.hypot(
        this.pos[k] - this.home[k],
        this.pos[k + 1] - this.home[k + 1],
        this.pos[k + 2] - this.home[k + 2] - this.crease[k / 3],
      );
      if (d > m) m = d;
    }
    return m;
  }

  /** Advance by `dt` seconds of real time (fixed 60 Hz steps inside). */
  update(dt: number) {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    if (this.asleep) {
      this.lastMs = 0;
      return;
    }
    if (this.rehang) {
      this.stepRehang(dt);
    } else {
      this.accumulator = Math.min(this.accumulator + dt, STEP * MAX_STEPS);
      while (this.accumulator >= STEP && !this.rehang) {
        this.step(STEP);
        this.accumulator -= STEP;
      }
      if (
        this.grabs.size === 0 &&
        this.idle > TIDY_DELAY &&
        !this.tidied &&
        this.maxDisplacement() > TIDY_LEFT
      ) {
        this.startRehang(TIDY_DURATION, true);
      }
      if (this.idle > TIDY_DELAY) this.tidied = true;
      // Resting still on the picture: stop simulating until the next grab.
      if (
        this.grabs.size === 0 &&
        !this.rehang &&
        this.tidied &&
        this.maxDisplacement() < SLEEP_LEFT
      ) {
        for (let k = 0; k < this.count * 3; k += 1) {
          this.pos[k] =
            this.home[k] + (k % 3 === 2 ? this.crease[(k - 2) / 3] : 0);
        }
        this.prev.set(this.pos);
        this.asleep = !this.crease.some((c) => c !== 0);
      }
    }
    this.lastMs =
      (typeof performance !== "undefined" ? performance.now() : 0) - t0;
  }

  private stepRehang(dt: number) {
    const r = this.rehang!;
    r.t = Math.min(1, r.t + dt / r.duration);
    const e = easeOutCubic(r.t);
    const { pos, home, crease } = this;
    if (!r.keepCreases) {
      for (let k = 0; k < this.count; k += 1) crease[k] *= 1 - e;
    }
    for (let k = 0; k < this.count * 3; k += 1) {
      const goal = home[k] + (k % 3 === 2 ? crease[(k - 2) / 3] : 0);
      pos[k] = r.from[k] + (goal - r.from[k]) * e;
    }
    this.prev.set(pos);
    if (r.t >= 1) {
      if (!r.keepCreases) crease.fill(0);
      this.rehang = null;
      this.accumulator = 0;
      this.tidied = true;
    }
  }

  private holdGrabs() {
    this.grabs.forEach((g) => {
      g.patch.forEach((q, n) => {
        this.pos[q * 3] = g.target[0] + g.offsets[n * 3];
        this.pos[q * 3 + 1] = g.target[1] + g.offsets[n * 3 + 1];
        this.pos[q * 3 + 2] = g.target[2] + g.offsets[n * 3 + 2];
      });
    });
  }

  private step(h: number) {
    const ph = this.physics;
    const { pos, prev, home, invMass, crease } = this;
    const h2 = h * h;
    if (this.grabs.size > 0) {
      this.idle = 0;
      this.tidied = false;
    } else this.idle += h;
    const settle = Math.min(
      1,
      Math.max(0, (this.idle - SETTLE_DELAY) / SETTLE_RAMP),
    );
    const bend = ph.bend + (Math.max(ph.bend, SETTLE_BEND) - ph.bend) * settle;

    // Remember where each grab was, for the throw on release.
    const held = [...this.grabs.values()];
    for (let n = 0; n < held.length; n += 1) {
      const g = held[n];
      g.last[0] = this.pos[g.index * 3];
      g.last[1] = this.pos[g.index * 3 + 1];
      g.last[2] = this.pos[g.index * 3 + 2];
    }

    for (let k = 0; k < this.count; k += 1) {
      if (invMass[k] !== 0) {
        const x = k * 3;
        const hz = home[x + 2] + crease[k];
        const dx = pos[x] - home[x];
        const dy = pos[x + 1] - home[x + 1];
        const dz = pos[x + 2] - hz;
        const away = Math.min(1, Math.hypot(dx, dy, dz) / GRAVITY_RAMP);
        const ax = -ph.homeSpring * dx;
        const ay = -ph.homeSpring * dy - ph.gravity * away;
        const az = -ph.homeSpring * dz;
        const vx = (pos[x] - prev[x]) * ph.damping;
        const vy = (pos[x + 1] - prev[x + 1]) * ph.damping;
        const vz = (pos[x + 2] - prev[x + 2]) * ph.damping;
        prev[x] = pos[x];
        prev[x + 1] = pos[x + 1];
        prev[x + 2] = pos[x + 2];
        pos[x] += vx + ax * h2;
        pos[x + 1] += vy + ay * h2;
        pos[x + 2] = Math.min(
          this.zMax,
          Math.max(this.zMin, pos[x + 2] + vz + az * h2),
        );
      }
    }

    if (settle > 0) this.liftFlipped(UNFOLD_LIFT * settle * h);

    this.holdGrabs();
    const { ca, cb, rest, kind, buckleSign } = this;
    const heldMask = this.heldMask();
    for (let it = 0; it < ph.iterations; it += 1) {
      for (let c = 0; c < rest.length; c += 1) {
        const p = ca[c];
        const q = cb[c];
        const wp = heldMask[p] ? 0 : invMass[p];
        const wq = heldMask[q] ? 0 : invMass[q];
        const w = wp + wq;
        if (w !== 0) {
          const px = p * 3;
          const qx = q * 3;
          const dx = pos[qx] - pos[px];
          const dy = pos[qx + 1] - pos[px + 1];
          const dz = pos[qx + 2] - pos[px + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const r = rest[c];
          let s: number;
          if (kind[c] === 0) s = ph.stretch;
          else s = d < r ? bend : ph.stretch * 0.5;
          const corr = ((d - r) / d) * s;
          const fp = (wp / w) * corr;
          const fq = (wq / w) * corr;
          pos[px] += dx * fp;
          pos[px + 1] += dy * fp;
          pos[px + 2] += dz * fp;
          pos[qx] -= dx * fq;
          pos[qx + 1] -= dy * fq;
          pos[qx + 2] -= dz * fq;
          // Squeezed cloth buckles out of the picture instead of sliding
          // flat over itself, so a crumple wrinkles.
          if (kind[c] === 0 && it === 0 && d < r * 0.92 && ph.buckle > 0) {
            const lift = (r * 0.92 - d) * ph.buckle;
            pos[px + 2] += lift * buckleSign[p] * wp;
            pos[qx + 2] += lift * buckleSign[q] * wq;
          }
        }
      }
    }
    if (settle < 1) this.tether(heldMask, 1 - settle);
    this.holdGrabs();

    // Foil: a crumple leaves creases that fade slowly.
    if (ph.creaseMemory > 0) {
      const fade = Math.exp(-ph.creaseFade * h);
      for (let k = 0; k < this.count; k += 1) {
        const dz = pos[k * 3 + 2] - home[k * 3 + 2];
        const target = dz * ph.creaseMemory;
        let c = crease[k] * fade;
        if (Math.abs(target) > Math.abs(c)) c += (target - c) * 0.02;
        crease[k] = Math.abs(c) < 1e-4 ? 0 : c;
      }
    }
  }

  /**
   * However hard it is pulled, the sheet stretches only a little away from
   * its pins, so a strong pull drags the whole sheet instead of thinning it.
   * It eases off while the sheet settles, so it never holds a fold in place.
   */
  private tether(held: Uint8Array, strength: number) {
    const { pos, home, invMass, tetherPin, tetherRest } = this;
    const slack = 1 + this.physics.slack;
    for (let k = 0; k < this.count; k += 1) {
      if (invMass[k] !== 0 && !held[k]) {
        const x = k * 3;
        const q = tetherPin[k] * 3;
        const dx = pos[x] - home[q];
        const dy = pos[x + 1] - home[q + 1];
        const dz = pos[x + 2] - home[q + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const max = tetherRest[k] * slack;
        if (d > max) {
          const f = 1 - (1 - max / d) * strength;
          pos[x] = home[q] + dx * f;
          pos[x + 1] = home[q + 1] + dy * f;
          pos[x + 2] = home[q + 2] + dz * f;
        }
      }
    }
  }

  /**
   * A flap folded flat over the sheet lies face-down, and pulling it straight
   * home only presses it into the fold. Lifting face-down cloth towards the
   * camera lets it swing open instead.
   */
  private liftFlipped(amount: number) {
    const { pos, cols, rows, invMass } = this;
    for (let j = 0; j < rows - 1; j += 1) {
      for (let i = 0; i < cols - 1; i += 1) {
        const k = j * cols + i;
        if (invMass[k] !== 0) {
          const x = k * 3;
          const r = x + 3;
          const d = x + cols * 3;
          const ax = pos[r] - pos[x];
          const ay = pos[r + 1] - pos[x + 1];
          const bx = pos[d] - pos[x];
          const by = pos[d + 1] - pos[x + 1];
          // Resting, right × down points away from the camera (negative z).
          if (ax * by - ay * bx > 0) pos[x + 2] += amount;
        }
      }
    }
  }

  private heldScratch: Uint8Array | null = null;

  private heldMask() {
    if (!this.heldScratch) this.heldScratch = new Uint8Array(this.count);
    const m = this.heldScratch;
    m.fill(0);
    this.grabs.forEach((g) => {
      g.patch.forEach((q) => {
        m[q] = 1;
      });
    });
    return m;
  }
}

/** A grid of about `budget` particles whose cells are square for `aspect`. */
export const gridFor = (aspect: number, budget = 1200) => {
  const cols = Math.max(8, Math.round(Math.sqrt(budget * aspect)));
  const rows = Math.max(8, Math.round(budget / cols));
  return { cols, rows };
};
