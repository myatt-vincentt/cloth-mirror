import { describe, expect, it } from "vitest";

import {
  PINCH,
  feedGlide,
  feedPinch,
  glideAt,
  pinchState,
  startGlide,
} from "./pinch.sim";

describe("pinch", () => {
  it("grabs only after two closed readings in a row", () => {
    const s = pinchState();
    expect(feedPinch(s, 0.7, 0, false)).toBe(false);
    expect(feedPinch(s, 0.7, 0, false)).toBe(true);
  });

  it("is harder to close than to keep closed", () => {
    const s = pinchState();
    expect(feedPinch(s, 0.55, 0, false)).toBe(false);
    expect(feedPinch(s, 0.55, 0, false)).toBe(false);
    feedPinch(s, 0.65, 0, false);
    feedPinch(s, 0.65, 0, false);
    // Loosening a little keeps holding; opening past 0.4 lets go.
    expect(feedPinch(s, 0.45, 0, false)).toBe(true);
    expect(feedPinch(s, 0.35, 0, false)).toBe(false);
  });

  it("never counts a fist or two hands overlapping", () => {
    const fist = pinchState();
    feedPinch(fist, 0.9, PINCH.maxGrab + 0.1, false);
    expect(feedPinch(fist, 0.9, PINCH.maxGrab + 0.1, false)).toBe(false);
    const both = pinchState();
    feedPinch(both, 0.9, 0, true);
    expect(feedPinch(both, 0.9, 0, true)).toBe(false);
  });

  it("glides smoothly from one reading to the next", () => {
    const g = startGlide({ x: 0, y: 0 }, 0);
    feedGlide(g, { x: 100, y: 0 }, 83);
    const a = glideAt(g, 83);
    const b = glideAt(g, 83 + 40);
    const c = glideAt(g, 83 + 200);
    expect(a.x).toBeCloseTo(0);
    expect(b.x).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(100);
    expect(c.x).toBeCloseTo(100);
  });

  it("steadies tiny moves of a held hand", () => {
    const g = startGlide({ x: 50, y: 50 }, 0);
    feedGlide(g, { x: 52, y: 50 }, 83);
    expect(glideAt(g, 1000).x).toBeLessThan(52);
    expect(glideAt(g, 1000).x).toBeGreaterThan(50);
  });
});
