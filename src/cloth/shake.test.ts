import { describe, expect, it } from "vitest";

import { feedShake, shakeState } from "./shake.sim";

/** Feed a yaw curve sampled at 15 Hz; the times (s) a shake was read. */
const run = (yaw: (t: number) => number, seconds: number) => {
  const s = shakeState();
  const hits: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 15) {
    if (feedShake(s, yaw(t), t)) hits.push(t);
  }
  return hits;
};

describe("head shake", () => {
  it("reads a quick left-right-left shake", () => {
    const hits = run((t) => 0.25 * Math.sin(t * Math.PI * 2 * 0.9), 2.6);
    expect(hits.length).toBe(1);
  });

  it("reads a slower shake (about 0.9 s per turn)", () => {
    expect(run((t) => 0.25 * Math.sin(t * Math.PI * 2 * 0.55), 4).length).toBe(
      1,
    );
  });

  it("ignores a still head and small wobbles", () => {
    expect(run(() => 0.05, 5)).toEqual([]);
    expect(run((t) => 0.04 * Math.sin(t * 9), 5)).toEqual([]);
  });

  it("ignores looking left, then right, then back, slowly", () => {
    const look = (t: number) => {
      if (t < 2) return 0.3 * Math.min(1, t);
      if (t < 5) return 0.3 - 0.6 * Math.min(1, (t - 2) / 1.5);
      return -0.3 + 0.3 * Math.min(1, (t - 5) / 1.5);
    };
    expect(run(look, 8)).toEqual([]);
  });

  it("counts a long shake once per cooldown, not every turn", () => {
    const hits = run((t) => 0.25 * Math.sin(t * Math.PI * 2 * 1.2), 4);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < hits.length; i += 1)
      expect(hits[i] - hits[i - 1]).toBeGreaterThan(1.2);
  });
});
