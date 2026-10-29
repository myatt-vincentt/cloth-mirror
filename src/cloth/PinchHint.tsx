// The only hint, wordless, low in the middle of the screen, in the style of
// the pinch ring: two small glowing dots (thumb and index) come together
// into a filled ring, pull down, and let go with a ripple, over and over. It
// fades for good after the first grab, by hand or by touch.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useXRReady } from "@vincentt-xr/sdk/low-level";

import { hasGrabbed } from "./state";

const ARLES = "#f4d968";
/** Seconds per pinch-and-pull. */
const LOOP = 2.8;

const CSS = `
.cm-hint { position: absolute; left: 50%; top: 70%; width: 0; height: 0; pointer-events: none;
  opacity: 0; transition: opacity 400ms ease-out; }
.cm-hint.on { opacity: 1; }
.cm-hint span { position: absolute; left: 0; top: 0; border-radius: 50%;
  animation-duration: ${LOOP}s; animation-iteration-count: infinite;
  animation-timing-function: ease-out; animation-fill-mode: both; }
.cm-hint .dot { width: 10px; height: 10px; margin: -5px 0 0 -5px; background: ${ARLES};
  box-shadow: 0 0 10px rgb(244 217 104 / .8); }
.cm-hint .thumb { animation-name: cm-hint-thumb; }
.cm-hint .index { animation-name: cm-hint-index; }
.cm-hint .ring { width: 26px; height: 26px; margin: -13px 0 0 -13px;
  background: rgb(244 217 104 / .9); border: 2px solid ${ARLES}; box-sizing: border-box;
  box-shadow: 0 0 16px rgb(244 217 104 / .95); animation-name: cm-hint-ring; }
.cm-hint .ripple { width: 26px; height: 26px; margin: -13px 0 0 -13px; box-sizing: border-box;
  border: 2px solid ${ARLES}; animation-name: cm-hint-ripple; }
@keyframes cm-hint-thumb {
  0% { opacity: 0; transform: translate(-16px, 14px); }
  12% { opacity: 1; transform: translate(-16px, 14px); }
  32% { opacity: 1; transform: translate(0, 0); }
  34%, 100% { opacity: 0; transform: translate(0, 0); } }
@keyframes cm-hint-index {
  0% { opacity: 0; transform: translate(14px, -16px); }
  12% { opacity: 1; transform: translate(14px, -16px); }
  32% { opacity: 1; transform: translate(0, 0); }
  34%, 100% { opacity: 0; transform: translate(0, 0); } }
@keyframes cm-hint-ring {
  0%, 32% { opacity: 0; transform: translateY(0) scale(1); }
  34% { opacity: 1; transform: translateY(0) scale(1); }
  40% { opacity: 1; transform: translateY(0) scale(1.15); }
  46% { opacity: 1; transform: translateY(0) scale(1); }
  72% { opacity: 1; transform: translateY(48px) scale(1); }
  80%, 100% { opacity: 0; transform: translateY(48px) scale(1); } }
@keyframes cm-hint-ripple {
  0%, 72% { opacity: 0; transform: translateY(48px) scale(1); }
  73% { opacity: .9; transform: translateY(48px) scale(1); }
  84%, 100% { opacity: 0; transform: translateY(48px) scale(2.1); } }
@media (prefers-reduced-motion: reduce) {
  .cm-hint .thumb, .cm-hint .index, .cm-hint .ripple { display: none; }
  .cm-hint .ring { animation: none; opacity: .9; } }
`;

export const PinchHint = () => {
  const ready = useXRReady();
  const el = useRef<HTMLDivElement>(null);
  const gone = useRef(false);

  useFrame(() => {
    const e = el.current;
    if (!e || gone.current) return;
    const show = ready && !hasGrabbed();
    e.classList.toggle("on", show);
    // Once grabbed it fades out and never comes back.
    if (ready && hasGrabbed()) gone.current = true;
  });

  return (
    <Html fullscreen zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
      <style>{CSS}</style>
      <div ref={el} className="cm-hint" aria-hidden="true">
        <span className="dot thumb" />
        <span className="dot index" />
        <span className="ring" />
        <span className="ripple" />
      </div>
    </Html>
  );
};
