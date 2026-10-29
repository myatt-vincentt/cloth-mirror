// A quick shake of the head (left, right, left) re-hangs the sheet, like a
// double-tap. Read from the head's turn (face tracking at a low rate) by
// shake.sim.ts.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useFaceInfo } from "@vincentt-xr/sdk/tracking";

import { feedShake, resetShake, shakeState } from "./shake.sim";

/** Face inference rate: a head shake reads well at this. */
const FACE_FPS = 15;

export const HeadShake = ({ onShake }: { onShake: () => void }) => {
  const face = useFaceInfo({ active: true, numFaces: 1, targetFps: FACE_FPS });
  const latest = useRef(face);
  latest.current = face;
  const seen = useRef<typeof face>(null);
  const state = useRef(shakeState());

  useFrame(({ clock }) => {
    const f = latest.current;
    if (f === seen.current) return;
    seen.current = f;
    if (!f) {
      resetShake(state.current);
      return;
    }
    if (feedShake(state.current, f.pose.rotation.y, clock.elapsedTime))
      onShake();
  });
  return null;
};
