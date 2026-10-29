// The four fabrics, as wordless glass chips in the control band at the
// bottom. Each chip holds a tiny swatch of its fabric: soft silk, woven
// denim, glossy jelly, crinkled foil.
import type { CSSProperties } from "react";
import { Html } from "@react-three/drei";
import { useXRReady } from "@vincentt-xr/sdk/low-level";

import { LOOKS, type LookId } from "./looks";
import { setLook, useLook } from "./state";

const ARLES = "#f4d968";

const CSS = `
.cm-root { position: absolute; inset: 0; pointer-events: none;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
.cm-scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 160px;
  background: linear-gradient(rgb(35 37 40 / 0), rgb(35 37 40 / .45)); }
.cm-band { position: absolute; left: 50%; transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom) + 24px);
  display: flex; gap: 6px; padding: 6px; border-radius: 999px; pointer-events: auto;
  animation: cm-enter 220ms ease-out both; }
@keyframes cm-enter { from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); } }
.cm-glass { background: rgb(35 37 40 / .64);
  backdrop-filter: blur(20px) saturate(1.5); -webkit-backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgb(235 246 253 / .18);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / .22), 0 8px 24px rgb(0 0 0 / .22); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .cm-glass { background: rgb(35 37 40 / .82); } }
.cm-chip { position: relative; width: 48px; height: 48px; border-radius: 50%; border: 0;
  padding: 0; margin: 0; background: transparent; cursor: pointer; outline: none;
  touch-action: manipulation; display: grid; place-items: center;
  transition: transform 160ms ease-out, box-shadow 160ms ease-out; }
.cm-chip:active { transform: scale(0.96); }
.cm-chip:focus-visible { box-shadow: 0 0 0 2px ${ARLES}; }
.cm-chip.on { box-shadow: inset 0 0 0 2px ${ARLES}; }
.cm-swatch { width: 32px; height: 32px; border-radius: 50%; overflow: hidden;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / .18), 0 2px 6px rgb(0 0 0 / .3); }
@keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .cm-chip:active { transform: none; }
  .cm-band { animation-name: cm-fade; } }
`;

/** A tiny picture of each fabric, drawn with CSS gradients. */
const SWATCH: Record<LookId, CSSProperties> = {
  // Soft folds with a pale sheen running across them.
  silk: {
    background: [
      "linear-gradient(115deg, rgb(255 255 255 / 0) 30%, rgb(255 255 255 / .55) 45%, rgb(255 255 255 / 0) 58%)",
      "linear-gradient(115deg, rgb(255 255 255 / 0) 62%, rgb(255 255 255 / .3) 72%, rgb(255 255 255 / 0) 82%)",
      "linear-gradient(160deg, #e9c9d6, #c58ea6 55%, #8f5a74)",
    ].join(", "),
  },
  // A blue twill: diagonal ridges over a fine thread grid.
  denim: {
    background: [
      "repeating-linear-gradient(45deg, rgb(255 255 255 / .16) 0 1.5px, rgb(255 255 255 / 0) 1.5px 4px)",
      "repeating-linear-gradient(-45deg, rgb(0 0 0 / .14) 0 1px, rgb(0 0 0 / 0) 1px 3px)",
      "radial-gradient(circle at 35% 30%, #5d82b4, #2f4f7e 60%, #1f3558)",
    ].join(", "),
  },
  // A glossy, see-through drop with a bright highlight.
  jelly: {
    background: [
      "radial-gradient(circle at 34% 28%, rgb(255 255 255 / .95) 0 9%, rgb(255 255 255 / 0) 22%)",
      "radial-gradient(circle at 66% 74%, rgb(255 255 255 / .35) 0 6%, rgb(255 255 255 / 0) 16%)",
      "radial-gradient(circle at 50% 50%, rgb(120 236 210 / .55), rgb(46 170 160 / .75) 62%, rgb(20 110 120 / .9))",
    ].join(", "),
  },
  // Crumpled silver: hard-edged facets catching the light.
  foil: {
    background: [
      "conic-gradient(from 20deg at 42% 46%, #f4f6f8, #9aa3ad 12%, #e7ebef 21%, #6f7883 33%, #d9dee3 44%, #a8b0b9 58%, #fafbfc 66%, #7d8691 79%, #c9ced4 90%, #f4f6f8)",
    ].join(", "),
  },
};

export const LookChips = () => {
  const look = useLook();
  // The chips appear with the camera picture, not over the loading screen.
  const ready = useXRReady();
  if (!ready) return null;
  return (
    <Html fullscreen zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <style>{CSS}</style>
      <div className="cm-root">
        <div className="cm-scrim" />
        <div className="cm-band cm-glass" role="radiogroup" aria-label="Fabric">
          {LOOKS.map((l) => (
            <button
              type="button"
              key={l.id}
              role="radio"
              aria-checked={look === l.id}
              aria-label={l.label}
              className={`cm-chip ${look === l.id ? "on" : ""}`}
              onClick={() => setLook(l.id)}
            >
              <span className="cm-swatch" style={SWATCH[l.id]} />
            </button>
          ))}
        </div>
      </div>
    </Html>
  );
};
