// Grabbing the cloth with a finger or the mouse.
//
// Touching down picks the cloth point nearest the finger on screen (within a
// small radius, the front-most layer first) and holds a little patch around
// it. Dragging moves that patch with the finger, eased so it never jitters,
// and lifts it towards you the further it travels, so a pulled corner peels
// up and folds over instead of sliding flat. Each finger holds its own patch,
// so two fingers can stretch it. Letting go keeps the finger's motion.
// A quick double-tap re-hangs the sheet.
//
// Everything is worked out from where the finger really is on screen, so on
// the mirrored front camera the cloth moves exactly under the finger.
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";

import type { Cloth } from "./sim";

/** A touch picks cloth within this share of the screen's short side. */
const PICK_RADIUS = 0.12;
/** Easing of the held patch towards the finger (1/s). */
const FOLLOW_RATE = 32;
/** How far a dragged patch lifts towards the camera at most (world units). */
const MAX_LIFT = 1.1;
/** Drag distance (share of the short side) for the full lift. */
const LIFT_DISTANCE = 0.6;
/** A tap moves less than this (px) and is shorter than this (ms). */
const TAP_SLOP = 12;
const TAP_MS = 280;
/** Two taps this close in time (ms) and space (px) re-hang the sheet. */
const DOUBLE_TAP_MS = 340;
const DOUBLE_TAP_PX = 48;

type Hold = {
  /** The finger now, and the eased point the patch follows (canvas px). */
  raw: { x: number; y: number };
  eased: { x: number; y: number };
  start: { x: number; y: number };
  startTime: number;
  travelled: number;
  /** View depth of the held point when it was picked. */
  depth: number;
  lift: number;
  /** Nothing was in reach: the touch only counts as a tap. */
  empty: boolean;
};

export const usePointerGrab = (cloth: Cloth, planeZ: number) => {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const holds = useMemo(() => new Map<number, Hold>(), []);

  const helpers = useMemo(() => {
    const v = new Vector3();
    const dir = new Vector3();
    const forward = new Vector3();
    const viewProj = new Matrix4();

    /** Canvas px → a world point on the view ray at view depth `depth`. */
    const worldAt = (x: number, y: number, depth: number) => {
      const el = gl.domElement;
      const w = el.clientWidth;
      const h = el.clientHeight;
      v.set((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).unproject(camera);
      dir.copy(v).sub(camera.position).normalize();
      camera.getWorldDirection(forward);
      const t = depth / Math.max(1e-4, dir.dot(forward));
      return v.copy(camera.position).addScaledVector(dir, t);
    };

    /** The cloth particle nearest the canvas point, or -1. */
    const pick = (x: number, y: number) => {
      const el = gl.domElement;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const radius = PICK_RADIUS * Math.min(w, h);
      viewProj.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      let best = -1;
      let bestScore = Infinity;
      const { pos } = cloth;
      for (let k = 0; k < cloth.count; k += 1) {
        if (!cloth.isPinned(k)) {
          v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).applyMatrix4(
            viewProj,
          );
          const sx = ((v.x + 1) / 2) * w;
          const sy = ((1 - v.y) / 2) * h;
          const d = Math.hypot(sx - x, sy - y);
          // Nearer the camera wins a close call, so the top layer is taken.
          const score = d - pos[k * 3 + 2] * radius * 0.5;
          if (d < radius && score < bestScore) {
            bestScore = score;
            best = k;
          }
        }
      }
      return best;
    };

    const depthOf = (k: number) => {
      v.set(cloth.pos[k * 3], cloth.pos[k * 3 + 1], cloth.pos[k * 3 + 2]);
      camera.getWorldDirection(forward);
      return v.sub(camera.position).dot(forward);
    };

    return { worldAt, pick, depthOf };
  }, [gl, camera, cloth]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    let lastTap = { time: -1e9, x: 0, y: 0 };

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = local(e);
      el.setPointerCapture?.(e.pointerId);
      const k = helpers.pick(p.x, p.y);
      holds.set(e.pointerId, {
        raw: { ...p },
        eased: { ...p },
        start: { ...p },
        startTime: performance.now(),
        travelled: 0,
        depth: k >= 0 ? helpers.depthOf(k) : 0,
        lift: 0,
        empty: k < 0,
      });
      if (k >= 0) cloth.grab(e.pointerId, k);
    };

    const move = (e: PointerEvent) => {
      const h = holds.get(e.pointerId);
      if (!h) return;
      const p = local(e);
      h.raw = p;
      h.travelled = Math.max(
        h.travelled,
        Math.hypot(p.x - h.start.x, p.y - h.start.y),
      );
    };

    const up = (e: PointerEvent) => {
      const h = holds.get(e.pointerId);
      if (!h) return;
      holds.delete(e.pointerId);
      cloth.release(e.pointerId);
      const now = performance.now();
      const isTap = h.travelled < TAP_SLOP && now - h.startTime < TAP_MS;
      if (!isTap) return;
      if (
        now - lastTap.time < DOUBLE_TAP_MS &&
        Math.hypot(h.start.x - lastTap.x, h.start.y - lastTap.y) < DOUBLE_TAP_PX
      ) {
        cloth.startRehang();
        lastTap = { time: -1e9, x: 0, y: 0 };
      } else {
        lastTap = { time: now, x: h.start.x, y: h.start.y };
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("lostpointercapture", up);
      holds.forEach((_, id) => cloth.release(id));
      holds.clear();
    };
  }, [gl, cloth, helpers, holds]);

  return useMemo(
    () => ({
      /** Ease each held patch towards its finger; call once per frame. */
      update(dt: number) {
        const el = gl.domElement;
        const short = Math.min(el.clientWidth, el.clientHeight) || 1;
        const k = 1 - Math.exp(-FOLLOW_RATE * dt);
        const held = [...holds.entries()];
        for (let n = 0; n < held.length; n += 1) {
          const [id, h] = held[n];
          if (!h.empty) {
            h.eased.x += (h.raw.x - h.eased.x) * k;
            h.eased.y += (h.raw.y - h.eased.y) * k;
            const far = Math.hypot(
              h.eased.x - h.start.x,
              h.eased.y - h.start.y,
            );
            const t = Math.min(1, far / (LIFT_DISTANCE * short));
            const lift = MAX_LIFT * (1 - (1 - t) ** 2);
            h.lift += (lift - h.lift) * k;
            // Lifting slides along the view ray, so the patch stays under the
            // finger on screen while it comes towards you.
            const p = helpers.worldAt(h.eased.x, h.eased.y, h.depth - h.lift);
            cloth.moveGrab(id, p.x, p.y, Math.max(planeZ - 0.5, p.z));
          }
        }
      },
    }),
    [gl, holds, helpers, cloth, planeZ],
  );
};
