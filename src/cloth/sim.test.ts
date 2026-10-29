import { describe, expect, it } from "vitest";

import { LOOKS } from "./looks";
import { Cloth, gridFor } from "./sim";

const W = 2.8;
const H = 4.97;
const make = (look = LOOKS[0]) => {
  const { cols, rows } = gridFor(W / H);
  return new Cloth(cols, rows, W, H, -1, look.physics);
};
const run = (c: Cloth, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) c.update(1 / 60);
};

describe("cloth", () => {
  it("keeps about 1200 particles with square cells", () => {
    const { cols, rows } = gridFor(9 / 16);
    expect(cols * rows).toBeGreaterThan(1100);
    expect(cols * rows).toBeLessThan(1300);
    expect(rows / cols).toBeCloseTo(16 / 9, 0);
  });

  it.each(LOOKS.map((l) => [l.id, l] as const))(
    "%s: the untouched sheet stays exactly on the picture",
    (_, look) => {
      const c = make(look);
      run(c, 5);
      expect(c.maxDisplacement()).toBeLessThan(1e-5);
    },
  );

  it.each(LOOKS.map((l) => [l.id, l] as const))(
    "%s: a pulled corner swings back and settles",
    (_, look) => {
      const c = make(look);
      const corner = c.count - 1;
      c.grab(1, corner);
      for (let i = 0; i < 60; i += 1) {
        c.moveGrab(1, 0, 0, 0);
        c.update(1 / 60);
      }
      expect(c.maxDisplacement()).toBeGreaterThan(1);
      c.release(1);
      run(c, 25);
      // Foil keeps faint creases a while; the others are back on the picture.
      expect(c.maxDisplacement()).toBeLessThan(
        look.id === "foil" ? 0.08 : 0.02,
      );
    },
  );

  it.each(LOOKS.map((l) => [l.id, l] as const))(
    "%s: folds and crumples from anywhere always come undone",
    (_, look) => {
      const paths = [
        // bottom-left corner folded to the top-right
        { from: [0, 1], to: [0.9, -2] },
        // middle of the bottom edge pushed up into the middle: a crumple
        { from: [0.5, 1], to: [0, 0.6] },
        // a point mid-picture pulled down and out
        { from: [0.4, 0.5], to: [-0.5, -3.5] },
        // right edge folded across to the left
        { from: [1, 0.6], to: [-1.3, -0.8] },
      ];
      paths.forEach(({ from, to }) => {
        const c = make(look);
        const k =
          Math.round(from[1] * (c.rows - 1)) * c.cols +
          Math.round(from[0] * (c.cols - 1));
        c.grab(1, k);
        for (let i = 0; i < 90; i += 1) {
          const t = i / 89;
          c.moveGrab(
            1,
            c.home[k * 3] + (to[0] - c.home[k * 3]) * t,
            c.home[k * 3 + 1] + (to[1] - c.home[k * 3 + 1]) * t,
            -1 + Math.sin(t * Math.PI) * 0.8,
          );
          c.update(1 / 60);
        }
        c.release(1);
        run(c, 30);
        expect(c.maxDisplacement()).toBeLessThan(
          look.id === "foil" ? 0.08 : 0.02,
        );
      });
    },
  );

  it.each(LOOKS.map((l) => [l.id, l] as const))(
    "%s: rests (stops simulating) once settled, wakes on a grab",
    (_, look) => {
      const c = make(look);
      expect(c.asleep).toBe(true);
      c.grab(1, c.count - 1);
      expect(c.asleep).toBe(false);
      for (let i = 0; i < 30; i += 1) {
        c.moveGrab(1, 0, -1, -0.5);
        c.update(1 / 60);
      }
      c.release(1);
      run(c, look.id === "foil" ? 40 : 8);
      expect(c.asleep).toBe(true);
      expect(c.maxDisplacement()).toBeLessThan(1e-6);
    },
  );

  it("never moves the pins", () => {
    const c = make();
    c.grab(1, Math.floor(c.count / 2));
    for (let i = 0; i < 60; i += 1) {
      c.moveGrab(1, 1, -3, 1);
      c.update(1 / 60);
    }
    for (let k = 0; k < c.cols; k += 1) {
      if (c.isPinned(k)) {
        expect(c.pos[k * 3]).toBe(c.home[k * 3]);
        expect(c.pos[k * 3 + 1]).toBe(c.home[k * 3 + 1]);
      }
    }
  });

  it("re-hangs neatly onto the picture", () => {
    const c = make(LOOKS[3]);
    c.grab(1, c.count - 5);
    for (let i = 0; i < 60; i += 1) {
      c.moveGrab(1, 0.3, 1, 0.5);
      c.update(1 / 60);
    }
    c.startRehang(0.9);
    let last = c.maxDisplacement();
    for (let i = 0; i < 60; i += 1) {
      c.update(1 / 60);
      const now = c.maxDisplacement();
      // Ease-out: always closer, never past home.
      expect(now).toBeLessThanOrEqual(last + 1e-6);
      last = now;
    }
    expect(c.rehanging).toBe(false);
    expect(c.maxDisplacement()).toBeLessThan(1e-6);
  });
});
