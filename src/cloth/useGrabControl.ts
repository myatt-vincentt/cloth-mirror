// Holding the cloth, for every kind of grab: a finger, the mouse, or a pinch
// in the air. They all feel the same.
//
// A grab starts at a point on screen: the cloth point nearest it (within a
// small radius, the front-most layer first) is held with a little patch
// around it. Moving moves that patch, eased so it never jitters, and lifts it
// towards you the further it travels, so a pulled corner peels up and folds
// over instead of sliding flat. Each grab holds its own patch, so two can
// stretch the sheet. Letting go keeps the last motion, so a flick throws.
//
// Everything is worked out from where the grab really is on screen, so on the
// mirrored front camera the cloth moves exactly under the finger.
import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";

import type { Cloth } from "./sim";
import { markGrabbed } from "./state";

/** A grab picks cloth within this share of the screen's short side. */
const PICK_RADIUS = 0.12;
/** Easing of the held patch towards the grab point (1/s). */
const FOLLOW_RATE = 32;
/** How far a dragged patch lifts towards the camera at most (world units). */
const MAX_LIFT = 1.1;
/** Drag distance (share of the short side) for the full lift. */
const LIFT_DISTANCE = 0.6;

type Hold = {
  /** The grab point now, and the eased point the patch follows (canvas px). */
  raw: { x: number; y: number };
  eased: { x: number; y: number };
  start: { x: number; y: number };
  /** View depth of the held point when it was picked. */
  depth: number;
  lift: number;
};

export type GrabControl = {
  /** Start grab `id` at canvas point (x, y). False when no cloth is in reach. */
  begin: (id: number, x: number, y: number) => boolean;
  move: (id: number, x: number, y: number) => void;
  end: (id: number) => void;
  /** Ease every held patch towards its grab point; call once per frame. */
  update: (dt: number) => void;
  isHolding: (id: number) => boolean;
  holding: () => number;
};

export const useGrabControl = (cloth: Cloth, planeZ: number): GrabControl => {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  return useMemo(() => {
    const holds = new Map<number, Hold>();
    const v = new Vector3();
    const dir = new Vector3();
    const forward = new Vector3();
    const viewProj = new Matrix4();
    const size = () => ({
      w: gl.domElement.clientWidth || 1,
      h: gl.domElement.clientHeight || 1,
    });

    /** Canvas px → a world point on the view ray at view depth `depth`. */
    const worldAt = (x: number, y: number, depth: number) => {
      const { w, h } = size();
      v.set((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).unproject(camera);
      dir.copy(v).sub(camera.position).normalize();
      camera.getWorldDirection(forward);
      const t = depth / Math.max(1e-4, dir.dot(forward));
      return v.copy(camera.position).addScaledVector(dir, t);
    };

    /** The cloth particle nearest the canvas point, or -1. */
    const pick = (x: number, y: number) => {
      const { w, h } = size();
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

    return {
      begin(id, x, y) {
        holds.delete(id);
        cloth.release(id);
        const k = pick(x, y);
        if (k < 0) return false;
        holds.set(id, {
          raw: { x, y },
          eased: { x, y },
          start: { x, y },
          depth: depthOf(k),
          lift: 0,
        });
        cloth.grab(id, k);
        markGrabbed();
        return true;
      },
      move(id, x, y) {
        const h = holds.get(id);
        if (!h) return;
        h.raw.x = x;
        h.raw.y = y;
      },
      end(id) {
        holds.delete(id);
        cloth.release(id);
      },
      isHolding: (id) => holds.has(id),
      holding: () => holds.size,
      update(dt) {
        // A re-hang lets go of everything: forget those grabs too.
        const held = cloth.grabbed().map((g) => g.id);
        [...holds.keys()].forEach((id) => {
          if (!held.includes(id)) holds.delete(id);
        });
        const { w, h: hgt } = size();
        const short = Math.min(w, hgt);
        const k = 1 - Math.exp(-FOLLOW_RATE * dt);
        const list = [...holds.entries()];
        for (let n = 0; n < list.length; n += 1) {
          const [id, h] = list[n];
          h.eased.x += (h.raw.x - h.eased.x) * k;
          h.eased.y += (h.raw.y - h.eased.y) * k;
          const far = Math.hypot(h.eased.x - h.start.x, h.eased.y - h.start.y);
          const t = Math.min(1, far / (LIFT_DISTANCE * short));
          const lift = MAX_LIFT * (1 - (1 - t) ** 2);
          h.lift += (lift - h.lift) * k;
          // Lifting slides along the view ray, so the patch stays under the
          // grab point on screen while it comes towards you.
          const p = worldAt(h.eased.x, h.eased.y, h.depth - h.lift);
          cloth.moveGrab(id, p.x, p.y, Math.max(planeZ - 0.5, p.z));
        }
      },
    };
  }, [gl, camera, cloth, planeZ]);
};
