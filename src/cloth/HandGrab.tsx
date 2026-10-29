// Pinch in the air to grab the cloth. Either hand works, and each hand holds
// its own point, so two hands can stretch the sheet between them. Open the
// hand to let go; the cloth keeps the hand's motion, so a flick throws it.
//
// A small glowing ring sits between thumb and index of each hand in view:
// hollow while open, filled while holding. The real hands stay in front of
// the cloth (HandCutout), so the hand holding it is never painted over.
//
// Hands are read about 12 times a second; between readings the pinch point
// glides smoothly (pinch.sim.ts). Tracker points are already mirrored like the
// picture, so the grab lands at the fingertips on screen.
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { XRModel } from "@vincentt-xr/sdk";
import { HandCutout, HandTracker } from "@vincentt-xr/sdk/tracking";
import {
  measureGrab,
  measurePinch,
  useXRModelNode,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";

import {
  PINCH,
  feedGlide,
  feedPinch,
  glideAt,
  pinchState,
  startGlide,
  type Glide,
  type PinchState,
} from "./pinch.sim";
import type { GrabControl } from "./useGrabControl";

/** Hand inference rate: the hand model is the costliest thing on screen. */
const HAND_FPS = 12;
/** A hand unseen this long (ms) lets go and its ring fades. */
const LOST_MS = 300;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
/** Palm centre (middle-finger knuckle), for the hands-together check. */
const PALM = 9;
const SIDES = ["left", "right"] as const;
type Side = (typeof SIDES)[number];
/** Grab ids for the hands (pointer ids are never negative). */
const GRAB_ID: Record<Side, number> = { left: -1, right: -2 };

const ARLES = "#f4d968";
const CSS = `
.cm-ring { position: absolute; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px;
  border-radius: 50%; border: 2px solid ${ARLES}; opacity: 0; pointer-events: none;
  box-shadow: 0 0 10px rgb(244 217 104 / .75), inset 0 0 6px rgb(244 217 104 / .45);
  background: rgb(35 37 40 / .25);
  transition: opacity 160ms ease-out, background-color 120ms ease-out; }
.cm-ring.on { background: rgb(244 217 104 / .9);
  box-shadow: 0 0 16px rgb(244 217 104 / .95), 0 0 4px rgb(255 255 255 / .8); }
`;

type HandRead = {
  pinch: PinchState;
  glide: Glide | null;
  stamp: number;
  seenAt: number;
};

export const HandGrab = ({ control }: { control: GrabControl }) => {
  const hands = useXRModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const gl = useThree((s) => s.gl);
  const reads = useMemo(
    () =>
      Object.fromEntries(
        SIDES.map((s) => [
          s,
          { pinch: pinchState(), glide: null, stamp: -1, seenAt: -1e9 },
        ]),
      ) as Record<Side, HandRead>,
    [],
  );
  const rings = useRef<Record<Side, HTMLDivElement | null>>({
    left: null,
    right: null,
  });

  useFrame(() => {
    const now = performance.now();
    const w = gl.domElement.clientWidth || 1;
    const h = gl.domElement.clientHeight || 1;
    const poses = hands?.poses;
    const fresh = (s: Side) => {
      const p = poses?.[s];
      return p && !p.held && p.image.length > 20 ? p : null;
    };

    SIDES.forEach((side) => {
      const r = reads[side];
      const id = GRAB_ID[side];
      const pose = fresh(side);
      if (pose && pose.timestampMs !== r.stamp) {
        r.stamp = pose.timestampMs;
        r.seenAt = now;
        const pts = pose.image;
        // Tracker points: centre origin, y up, mirrored like the picture.
        const mid = {
          x: ((pts[THUMB_TIP].x + pts[INDEX_TIP].x) * 0.25 + 0.5) * w,
          y: (0.5 - (pts[THUMB_TIP].y + pts[INDEX_TIP].y) * 0.25) * h,
        };
        if (!r.glide) r.glide = startGlide(mid, now);
        else feedGlide(r.glide, mid, now);
        const other = fresh(side === "left" ? "right" : "left");
        const together =
          !!other &&
          Math.hypot(
            other.image[PALM].x - pts[PALM].x,
            other.image[PALM].y - pts[PALM].y,
          ) < PINCH.handsApart;
        const closed = feedPinch(
          r.pinch,
          measurePinch(pts),
          measureGrab(pts),
          together,
        );
        const inside =
          mid.x > PINCH.edge * w &&
          mid.x < (1 - PINCH.edge) * w &&
          mid.y > PINCH.edge * h &&
          mid.y < (1 - PINCH.edge) * h;
        if (closed && !control.isHolding(id) && r.pinch.run === PINCH.confirm) {
          if (inside) {
            const at = glideAt(r.glide, now);
            control.begin(id, at.x, at.y);
          }
        } else if (!closed && control.isHolding(id)) {
          control.end(id);
        }
      }
      const seen = now - r.seenAt < LOST_MS;
      if (!seen) {
        if (control.isHolding(id)) control.end(id);
        r.glide = null;
        r.pinch = pinchState();
      }
      const at = r.glide ? glideAt(r.glide, now) : null;
      if (at && control.isHolding(id)) control.move(id, at.x, at.y);

      const ring = rings.current[side];
      if (ring) {
        ring.style.opacity = seen && at ? "1" : "0";
        if (at) ring.style.transform = `translate(${at.x}px, ${at.y}px)`;
        ring.classList.toggle("on", control.isHolding(id));
      }
    });
  });

  return (
    <>
      <HandTracker targetFps={HAND_FPS}>
        <HandCutout inflate={0.9} />
      </HandTracker>
      <Html fullscreen zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <style>{CSS}</style>
        <div
          className="cm-ring"
          ref={(el) => {
            rings.current.left = el;
          }}
        />
        <div
          className="cm-ring"
          ref={(el) => {
            rings.current.right = el;
          }}
        />
      </Html>
    </>
  );
};
