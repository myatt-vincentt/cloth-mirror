// Pinch in the air to grab the cloth. Either hand works, and each hand holds
// its own point, so two hands can stretch the sheet between them. Open the
// hand to let go; the cloth keeps the hand's motion, so a flick throws it.
//
// A small glowing ring sits between thumb and index of each hand in view:
// hollow while open, filled while holding. The real hands stay in front of
// the cloth (LiveHands.tsx), so the hand holding it is never painted over;
// while a hand moves too fast for its outline to keep up, it fades instead.
//
// Hands are read about 12 times a second; between readings the pinch point
// glides smoothly (pinch.sim.ts). Tracker points are already mirrored like the picture, so
// the grab lands at the fingertips on screen.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { XRModel } from "@vincentt-xr/sdk";
import { HandTracker } from "@vincentt-xr/sdk/tracking";
import {
  measureGrab,
  measurePinch,
  useXRModelNode,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";

import { LiveHands, type LiveHand } from "./LiveHands";
import {
  PINCH,
  feedGlide,
  feedPinch,
  glideAt,
  outlineError,
  outlineTarget,
  pinchState,
  startGlide,
  stepOutline,
  type Glide,
  type PinchState,
} from "./pinch.sim";
import type { GrabControl } from "./useGrabControl";

/**
 * Hand inference rate: the hand model is the costliest thing on screen. (It
 * stays fixed: changing it while running restarts hand tracking.)
 */
const HAND_FPS = 12;
const WRIST = 0;
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
.cm-hand { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none;
  opacity: 0; transition: opacity 160ms ease-out; }
.cm-ring { position: absolute; left: -13px; top: -13px; width: 26px; height: 26px;
  box-sizing: border-box; border-radius: 50%; border: 2px solid ${ARLES};
  box-shadow: 0 0 10px rgb(244 217 104 / .75), inset 0 0 6px rgb(244 217 104 / .45);
  background: rgb(35 37 40 / .25); transition: background-color 120ms ease-out; }
.cm-ring.on { background: rgb(244 217 104 / .9);
  box-shadow: 0 0 16px rgb(244 217 104 / .95), 0 0 4px rgb(255 255 255 / .8);
  animation: cm-breathe 1.8s ease-out 180ms infinite alternate; }
.cm-ring.pop { animation: cm-pop 180ms ease-out, cm-breathe 1.8s ease-out 180ms infinite alternate; }
.cm-ripple-at { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.cm-ripple { position: absolute; left: -13px; top: -13px; width: 26px; height: 26px;
  box-sizing: border-box; border-radius: 50%; border: 2px solid ${ARLES}; opacity: 0; }
.cm-ripple.go { animation: cm-ripple 300ms ease-out both; }
@keyframes cm-pop {
  0% { transform: scale(1); box-shadow: 0 0 16px rgb(244 217 104 / .95); }
  45% { transform: scale(1.15); box-shadow: 0 0 26px rgb(244 217 104 / 1), 0 0 8px rgb(255 255 255 / .9); }
  100% { transform: scale(1); box-shadow: 0 0 16px rgb(244 217 104 / .95); } }
@keyframes cm-breathe {
  from { box-shadow: 0 0 14px rgb(244 217 104 / .85), 0 0 4px rgb(255 255 255 / .7); }
  to { box-shadow: 0 0 22px rgb(244 217 104 / 1), 0 0 6px rgb(255 255 255 / .9); } }
@keyframes cm-ripple {
  from { opacity: .85; transform: scale(1); }
  to { opacity: 0; transform: scale(2); } }
@media (prefers-reduced-motion: reduce) {
  .cm-ring.on, .cm-ring.pop { animation: none; }
  .cm-ripple.go { animation: cm-fade-out 300ms ease-out both; }
  @keyframes cm-fade-out { from { opacity: .85; } to { opacity: 0; } } }
`;

type HandRead = {
  pinch: PinchState;
  glide: Glide | null;
  stamp: number;
  seenAt: number;
  /** The palm at the last reading (px), and how fast it moves (hand sizes/s). */
  palm: { x: number; y: number } | null;
  speed: number;
};

export const HandGrab = ({ control }: { control: GrabControl }) => {
  const hands = useXRModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const gl = useThree((s) => s.gl);
  const reads = useMemo(
    () =>
      Object.fromEntries(
        SIDES.map((s) => [
          s,
          {
            pinch: pinchState(),
            glide: null,
            stamp: -1,
            seenAt: -1e9,
            palm: null,
            speed: 0,
          },
        ]),
      ) as Record<Side, HandRead>,
    [],
  );
  type RingEls = {
    hand: HTMLDivElement | null;
    ring: HTMLDivElement | null;
    rippleAt: HTMLDivElement | null;
    ripple: HTMLDivElement | null;
  };
  const rings = useRef<Record<Side, RingEls>>({
    left: { hand: null, ring: null, rippleAt: null, ripple: null },
    right: { hand: null, ring: null, rippleAt: null, ripple: null },
  });
  const wasHolding = useRef<Record<Side, boolean>>({
    left: false,
    right: false,
  });
  const live = useMemo<Record<Side, LiveHand>>(
    () => ({
      left: { points: null, alpha: 0 },
      right: { points: null, alpha: 0 },
    }),
    [],
  );
  const liveList = useMemo(() => [live.left, live.right], [live]);
  const rate = useRef({ last: 0, gap: 0 });

  // Dev only: the hand reading rate, for checking.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return undefined;
    const w = window as unknown as { __hands?: unknown };
    w.__hands = {
      get hz() {
        return rate.current.gap ? +(1000 / rate.current.gap).toFixed(1) : 0;
      },
      get alpha() {
        return [+live.left.alpha.toFixed(2), +live.right.alpha.toFixed(2)];
      },
    };
    return () => {
      delete w.__hands;
    };
  }, [live]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
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
        const gap = pose.timestampMs - r.stamp;
        if (side === "right" || !fresh("right")) {
          const g = pose.timestampMs - rate.current.last;
          if (g > 0 && g < 500)
            rate.current.gap = rate.current.gap * 0.8 + g * 0.2;
          rate.current.last = pose.timestampMs;
        }
        r.stamp = pose.timestampMs;
        r.seenAt = now;
        const pts = pose.image;
        // How fast the palm moves, in hand sizes per second.
        const palm = { x: pts[PALM].x * (w / 2), y: pts[PALM].y * (h / 2) };
        const handSize =
          Math.hypot(
            (pts[PALM].x - pts[WRIST].x) * (w / 2),
            (pts[PALM].y - pts[WRIST].y) * (h / 2),
          ) || 1;
        const speed =
          r.palm && gap > 0 && gap < 400
            ? Math.hypot(palm.x - r.palm.x, palm.y - r.palm.y) /
              handSize /
              (gap / 1000)
            : 0;
        // Smoothed against tracking jitter, but a sudden move counts at once.
        r.speed = Math.max(speed * 0.8, r.speed * 0.5 + speed * 0.5);
        r.palm = palm;
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
        r.palm = null;
        r.pinch = pinchState();
      }
      // The live hand: solid while its outline can keep up, faded while it
      // can't, gone once the hand is lost.
      const lh = live[side];
      const target =
        pose && seen ? outlineTarget(outlineError(r.speed, now - r.stamp)) : 0;
      lh.alpha = stepOutline(lh.alpha, target, dt);
      if (pose) lh.points = pose.image;
      const at = r.glide ? glideAt(r.glide, now) : null;
      if (at && control.isHolding(id)) control.move(id, at.x, at.y);

      const els = rings.current[side];
      const holding = control.isHolding(id);
      if (els.hand && els.ring) {
        els.hand.style.opacity = seen && at ? "1" : "0";
        if (at) els.hand.style.transform = `translate(${at.x}px, ${at.y}px)`;
        if (holding && !wasHolding.current[side]) {
          // Pinch closed: a quick pop and glow pulse, then a gentle breathing glow.
          els.ring.classList.remove("pop");
          els.ring.getBoundingClientRect();
          els.ring.classList.add("pop");
        }
        if (!holding) els.ring.classList.remove("pop");
        els.ring.classList.toggle("on", holding);
      }
      if (
        !holding &&
        wasHolding.current[side] &&
        els.ripple &&
        els.rippleAt &&
        at
      ) {
        // Let go: a small ripple spreads where the hand opened.
        els.rippleAt.style.transform = `translate(${at.x}px, ${at.y}px)`;
        els.ripple.classList.remove("go");
        els.ripple.getBoundingClientRect();
        els.ripple.classList.add("go");
      }
      wasHolding.current[side] = holding;
    });
  });

  return (
    <>
      <HandTracker targetFps={HAND_FPS} />
      <LiveHands hands={liveList} />
      <Html fullscreen zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <style>{CSS}</style>
        {SIDES.map((side) => (
          <div key={side}>
            <div
              className="cm-ripple-at"
              ref={(el) => {
                rings.current[side].rippleAt = el;
              }}
            >
              <div
                className="cm-ripple"
                ref={(el) => {
                  rings.current[side].ripple = el;
                }}
              />
            </div>
            <div
              className="cm-hand"
              ref={(el) => {
                rings.current[side].hand = el;
              }}
            >
              <div
                className="cm-ring"
                ref={(el) => {
                  rings.current[side].ring = el;
                }}
              />
            </div>
          </div>
        ))}
      </Html>
    </>
  );
};
