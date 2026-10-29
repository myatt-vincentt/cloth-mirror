// The only hint, wordless: low in the middle of the screen a small
// see-through ghost hand pinches and pulls down, over and over. It goes for
// good after the first grab, by hand or by touch.
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group, PerspectiveCamera } from "three";
import { defineGltfAsset, useXRAsset } from "@vincentt-xr/sdk";
import { useXRReady } from "@vincentt-xr/sdk/low-level";
import {
  HAND_HINT_LOOP,
  HandGestureHint,
  sampleHintLoop,
} from "@vincentt-xr/sdk/instructions";

import { hasGrabbed } from "./state";

const handAsset = defineGltfAsset("/models/hand-v1.glb");

const HINT = {
  /** Depth of the hint (world z): in front of the cloth. */
  z: 1.5,
  /** Hand height, as a share of the screen height. */
  height: 0.16,
  /** Centre height, as a share of the half screen below the middle. */
  low: 0.5,
  /** How far it pulls down while pinched (share of the screen height). */
  pull: 0.07,
  /** Seconds per pinch-and-pull. */
  seconds: 2.6,
  fadeIn: 0.5,
  fadeOut: 0.4,
  renderOrder: 20,
};

const LOOP = { ...HAND_HINT_LOOP, seconds: HINT.seconds, stagger: 0 };
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export const PinchHint = () => {
  const { value: hand } = useXRAsset(handAsset);
  const ready = useXRReady();
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const g = useRef<Group>(null);
  const shownAt = useRef(-1);
  const goneAt = useRef(-1);
  const done = useRef(false);

  useFrame(({ clock }) => {
    const o = g.current;
    if (!o || done.current) return;
    const t = clock.elapsedTime;
    if (shownAt.current < 0) {
      if (!ready) return;
      shownAt.current = t;
    }
    if (goneAt.current < 0 && hasGrabbed()) goneAt.current = t;
    const fadeIn = easeOut(Math.min(1, (t - shownAt.current) / HINT.fadeIn));
    const fadeOut =
      goneAt.current < 0
        ? 1
        : 1 - easeOut(Math.min(1, (t - goneAt.current) / HINT.fadeOut));
    if (fadeOut <= 0) {
      done.current = true;
      o.visible = false;
      return;
    }
    // Screen height at the hint's depth, so it keeps its size on any screen.
    const dist = camera.position.z - HINT.z;
    const screenH = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
    const { drive } = sampleHintLoop(t, LOOP);
    const pull = drive ** 3 * HINT.pull * screenH;
    o.visible = true;
    o.position.set(0, -HINT.low * (screenH / 2) - pull, HINT.z);
    o.scale.setScalar(Math.max(1e-4, fadeIn * fadeOut) * HINT.height * screenH);
  });

  if (!hand) return null;
  return (
    <group ref={g} visible={false}>
      <HandGestureHint
        gesture="ok"
        model={hand.scene}
        poses={hand.animations}
        height={1}
        loop={LOOP}
        orbit={0}
        look={{ glow: false }}
        renderOrder={HINT.renderOrder}
      />
    </group>
  );
};
