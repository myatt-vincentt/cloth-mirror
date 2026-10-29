// Grabbing the cloth with a finger or the mouse (the grab itself is
// useGrabControl.ts). Each finger holds its own point, so two fingers can
// stretch it. A quick double-tap re-hangs the sheet.
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

import type { Cloth } from "./sim";
import type { GrabControl } from "./useGrabControl";

/** A tap moves less than this (px) and is shorter than this (ms). */
const TAP_SLOP = 12;
const TAP_MS = 280;
/** Two taps this close in time (ms) and space (px) re-hang the sheet. */
const DOUBLE_TAP_MS = 340;
const DOUBLE_TAP_PX = 48;

type Touch = {
  start: { x: number; y: number };
  startTime: number;
  travelled: number;
};

export const usePointerGrab = (cloth: Cloth, control: GrabControl) => {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const touches = new Map<number, Touch>();
    let lastTap = { time: -1e9, x: 0, y: 0 };

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = local(e);
      el.setPointerCapture?.(e.pointerId);
      touches.set(e.pointerId, {
        start: p,
        startTime: performance.now(),
        travelled: 0,
      });
      control.begin(e.pointerId, p.x, p.y);
    };

    const move = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      const p = local(e);
      t.travelled = Math.max(
        t.travelled,
        Math.hypot(p.x - t.start.x, p.y - t.start.y),
      );
      control.move(e.pointerId, p.x, p.y);
    };

    const up = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      touches.delete(e.pointerId);
      control.end(e.pointerId);
      const now = performance.now();
      const isTap = t.travelled < TAP_SLOP && now - t.startTime < TAP_MS;
      if (!isTap) return;
      if (
        now - lastTap.time < DOUBLE_TAP_MS &&
        Math.hypot(t.start.x - lastTap.x, t.start.y - lastTap.y) < DOUBLE_TAP_PX
      ) {
        cloth.startRehang();
        lastTap = { time: -1e9, x: 0, y: 0 };
      } else {
        lastTap = { time: now, x: t.start.x, y: t.start.y };
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
      touches.forEach((_, id) => control.end(id));
    };
  }, [gl, cloth, control]);
};
