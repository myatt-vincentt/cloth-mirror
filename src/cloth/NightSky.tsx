// The surprise behind the picture: a quiet starry night. A deep blue sky,
// twinkling stars, a faint band of the Milky Way, a soft moon with a warm
// glow, and low hills in mist along the bottom. One full-screen shader, no
// images. It sits behind everything, so it shows wherever the cloth is peeled
// or crumpled away.
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ShaderMaterial, Vector2 } from "three";
import type { Mesh } from "three";

import { devView } from "./state";

const vertexShader = /* glsl */ `
void main() {
  // Covers the whole screen, behind everything.
  gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

// One layer of stars on a grid: each cell may hold one, twinkling slowly.
float stars(vec2 p, float density, float size) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash(cell);
  if (h > density) return 0.0;
  vec2 o = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
  float d = length(f - o * 0.7);
  float twinkle = 0.65 + 0.35 * sin(uTime * (0.6 + h * 2.4) + h * 40.0);
  float b = hash(cell + 1.9);
  return smoothstep(size, 0.0, d) * twinkle * (0.35 + 0.65 * b * b);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // Square units, 1 = the screen height.
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);

  // Sky: deep navy at the top, a softer violet blue near the horizon.
  vec3 top = vec3(0.012, 0.02, 0.07);
  vec3 mid = vec3(0.03, 0.05, 0.16);
  vec3 low = vec3(0.13, 0.12, 0.28);
  vec3 sky = mix(low, mid, smoothstep(0.05, 0.5, uv.y));
  sky = mix(sky, top, smoothstep(0.5, 1.0, uv.y));

  // The Milky Way: a faint diagonal band of dust and light.
  vec2 q = vec2(p.x * 0.8 + p.y * 0.6, -p.x * 0.6 + p.y * 0.8);
  float band = exp(-pow((q.y - 0.55) * 3.2, 2.0));
  float dust = fbm(q * 3.5 + 2.0);
  sky += vec3(0.11, 0.1, 0.2) * band * smoothstep(0.35, 0.9, dust) * 0.9;
  sky -= vec3(0.02, 0.02, 0.03) * band * smoothstep(0.55, 0.8, fbm(q * 7.0 + 9.0));

  // Stars, fewer and dimmer near the horizon, more inside the band.
  float horizonFade = smoothstep(0.14, 0.4, uv.y);
  float s = stars(p * 90.0, 0.11, 0.12) * 0.9
          + stars(p * 45.0 + 17.0, 0.07, 0.09) * 1.2
          + stars(p * 22.0 + 41.0, 0.05, 0.07) * 1.7;
  s += stars(q * 140.0, 0.25 * band, 0.12) * 0.6;
  sky += vec3(0.9, 0.93, 1.0) * s * horizonFade;

  // The moon, high on one side, with a soft warm glow around it.
  vec2 moon = vec2(aspect * 0.22, 0.76);
  float r = 0.065;
  float d = length(p - moon);
  float glow = exp(-d * 5.0) * 0.32 + exp(-d * 18.0) * 0.35;
  sky += vec3(1.0, 0.92, 0.78) * glow * 0.55;
  if (d < r * 1.02) {
    vec2 m = (p - moon) / r;
    float limb = sqrt(max(0.0, 1.0 - dot(m, m)));
    float seas = fbm(m * 2.2 + 4.0);
    vec3 face = vec3(0.98, 0.95, 0.86) * (0.78 + 0.22 * limb);
    face *= 1.0 - 0.22 * smoothstep(0.45, 0.7, seas);
    float edge = smoothstep(1.0, 0.96, length(m));
    sky = mix(sky, face, edge);
  }

  // Thin clouds drifting past the moon.
  float cloud = fbm(vec2(p.x * 2.2 + uTime * 0.012, p.y * 6.0));
  float cloudBand = smoothstep(0.55, 0.85, uv.y) * smoothstep(1.0, 0.8, uv.y);
  sky += vec3(0.2, 0.2, 0.3) * smoothstep(0.55, 0.85, cloud) * cloudBand * (0.25 + glow);

  // Low hills in mist along the bottom.
  float far = 0.15 + 0.035 * fbm(vec2(p.x * 1.6, 3.0)) + 0.02 * sin(p.x * 2.5);
  float near = 0.09 + 0.05 * fbm(vec2(p.x * 2.4 + 8.0, 1.0));
  float mist = exp(-max(0.0, uv.y - far) * 14.0) * 0.12;
  sky += vec3(0.25, 0.24, 0.42) * mist;
  sky = mix(sky, vec3(0.05, 0.055, 0.12), smoothstep(far + 0.003, far - 0.003, uv.y));
  sky = mix(sky, vec3(0.02, 0.022, 0.05), smoothstep(near + 0.003, near - 0.003, uv.y));

  // A whisper of grain so the gradient never bands.
  sky += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

  gl_FragColor = vec4(sky, 1.0);
}
`;

export const NightSky = () => {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uRes: { value: new Vector2(1, 1) },
          uTime: { value: 0 },
        },
      }),
    [],
  );
  material.uniforms.uRes.value.set(size.width * dpr, size.height * dpr);
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.1);
    if (ref.current) ref.current.visible = !devView.bare;
  });
  return (
    <mesh
      ref={ref}
      renderOrder={-998}
      frustumCulled={false}
      material={material}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
};
