// The real hands, in front of the cloth and the sky: the live camera picture
// drawn again inside each hand's outline (the SDK's hand silhouette: palm,
// fingers and forearm), on top of everything. Resting, it matches the cloth
// exactly, so it only shows once the cloth moves away from under a hand.
//
// The outline comes from hand tracking, which is a moment behind the
// picture. While a hand moves fast the outline would lag behind and show a
// hand-shaped patch of the old background, so each hand's layer fades out
// with how far its outline may be off (HandGrab.tsx works that out), and
// fades back once the hand slows down.
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  LessDepth,
  ShaderMaterial,
  Vector2,
} from "three";
import type { Texture } from "three";
import { useXRCameraTexture } from "@vincentt-xr/sdk/low-level";
import {
  HAND_CUTOUT_TRIANGLES,
  writeHandCutout,
} from "@vincentt-xr/sdk/tracking";
import type { TrackerPoint } from "@vincentt-xr/sdk";

/** One hand's layer: its tracker points (or null) and how solid it is. */
export type LiveHand = {
  points: ArrayLike<TrackerPoint> | null;
  alpha: number;
};

/** Outline width (1 = the SDK default) and forearm length in hand sizes. */
const OUTLINE = { inflate: 0.9, forearm: 1.4 };
const VERTS = HAND_CUTOUT_TRIANGLES * 3;

const vertexShader = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  // At the near plane: each pixel is drawn once even where the outline's
  // pieces overlap, so a fading hand stays even.
  gl_Position = vec4(position.xy, -0.999, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uCamera;
uniform vec2 uRes;
varying float vAlpha;
void main() {
  vec3 c = texture2D(uCamera, gl_FragCoord.xy / uRes).rgb;
  gl_FragColor = vec4(c, vAlpha);
  #include <colorspace_fragment>
}
`;

export const LiveHands = ({ hands }: { hands: LiveHand[] }) => {
  const texture = useXRCameraTexture();
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const n = VERTS * hands.length;
    const pos = new BufferAttribute(new Float32Array(n * 3), 3);
    pos.setUsage(DynamicDrawUsage);
    const alpha = new BufferAttribute(new Float32Array(n), 1);
    alpha.setUsage(DynamicDrawUsage);
    g.setAttribute("position", pos);
    g.setAttribute("aAlpha", alpha);
    return g;
  }, [hands.length]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: true,
        depthFunc: LessDepth,
        uniforms: {
          uCamera: { value: null as Texture | null },
          uRes: { value: new Vector2(1, 1) },
        },
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const scratch = useMemo(() => new Float32Array(VERTS * 2), []);

  useFrame(() => {
    material.uniforms.uCamera.value = texture ?? null;
    material.uniforms.uRes.value.set(size.width * dpr, size.height * dpr);
    const pos = geometry.getAttribute("position") as BufferAttribute;
    const alpha = geometry.getAttribute("aAlpha") as BufferAttribute;
    const p = pos.array as Float32Array;
    const a = alpha.array as Float32Array;
    let drawn = 0;
    hands.forEach((hand) => {
      if (!hand.points || hand.alpha < 0.01) return;
      const count = writeHandCutout(
        hand.points,
        size.width / Math.max(1, size.height),
        OUTLINE,
        scratch,
      );
      for (let v = 0; v < count; v += 1) {
        p[(drawn + v) * 3] = scratch[v * 2];
        p[(drawn + v) * 3 + 1] = scratch[v * 2 + 1];
        p[(drawn + v) * 3 + 2] = 0;
        a[drawn + v] = hand.alpha;
      }
      drawn += count;
    });
    geometry.setDrawRange(0, drawn);
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      // On top of the cloth and the sky; under the hint and the chips.
      renderOrder={10}
    />
  );
};
