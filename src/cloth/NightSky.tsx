// The surprise behind the picture: a magical night, just after sunset. A
// rosy twilight glow along the horizon fades up into deep blue; a soft
// aurora ripples across the middle of the sky; bright stars twinkle
// everywhere, with a shooting star now and then; a moon with a warm glow
// sits near the middle; low hills in mist along the bottom. One full-screen
// shader, no images. It shows wherever the cloth is peeled or crumpled away,
// and real hands stay in front of it (LiveHands.tsx).
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ShaderMaterial, Vector2 } from "three";
import type { Mesh } from "three";

import { devView } from "./state";

const vertexShader = /* glsl */ `
void main() {
  // Covers the whole screen, at the very back.
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
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

// One layer of stars on a grid: each cell may hold one, twinkling.
vec3 stars(vec2 p, float density, float size) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash(cell);
  if (h > density) return vec3(0.0);
  vec2 o = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
  float d = length(f - o * 0.7);
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.8 + h * 3.0) + h * 40.0);
  float b = hash(cell + 1.9);
  float core = smoothstep(size, 0.0, d);
  float halo = smoothstep(size * 3.0, 0.0, d) * 0.25;
  // Most stars are white; a few are warm or blue.
  vec3 tint = mix(vec3(1.0), b > 0.8 ? vec3(1.0, 0.85, 0.7) : vec3(0.75, 0.85, 1.0), step(0.6, b));
  return tint * (core + halo) * twinkle * (0.45 + 0.75 * b);
}

// A shooting star in slot i: a bright head with a fading tail, now and then.
float shootingStar(vec2 p, float aspect, float i) {
  float period = 4.3 + i * 2.7;
  float t = uTime + i * 1.9;
  float cycle = floor(t / period);
  float life = fract(t / period) * period;
  if (life > 0.7) return 0.0;
  float k = life / 0.7;
  vec2 start = vec2((hash(vec2(cycle, i)) - 0.5) * aspect * 0.9, 0.62 + 0.3 * hash(vec2(i, cycle)));
  vec2 dir = normalize(vec2(hash(vec2(cycle + 4.0, i)) > 0.5 ? 1.0 : -1.0, -0.45));
  vec2 head = start + dir * (0.45 * k);
  vec2 tail = head - dir * 0.16;
  vec2 pa = p - tail;
  vec2 ba = head - tail;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  float fade = sin(k * 3.1416);
  return smoothstep(0.0028, 0.0, d) * h * h * fade * 1.6;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // Square units, 1 = the screen height.
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float y = uv.y;

  // Twilight: deep blue overhead, violet, then rose and a warm peach glow
  // along the horizon.
  vec3 top = vec3(0.035, 0.04, 0.13);
  vec3 high = vec3(0.09, 0.09, 0.28);
  vec3 mid = vec3(0.3, 0.17, 0.42);
  vec3 low = vec3(0.86, 0.42, 0.46);
  vec3 horizon = vec3(1.0, 0.7, 0.5);
  vec3 sky = mix(horizon, low, smoothstep(0.12, 0.22, y));
  sky = mix(sky, mid, smoothstep(0.2, 0.36, y));
  sky = mix(sky, high, smoothstep(0.34, 0.62, y));
  sky = mix(sky, top, smoothstep(0.62, 1.0, y));

  // The aurora: soft curtains rippling across the middle of the sky, green
  // at their foot and violet at their tops.
  float drift = uTime * 0.04;
  float warp = fbm(vec2(p.x * 1.3 + drift, drift * 0.7));
  float foot = 0.47 + 0.08 * sin(p.x * 2.1 + warp * 4.0 + uTime * 0.15);
  float above = y - foot;
  float curtain = smoothstep(-0.03, 0.02, above) * exp(-max(above, 0.0) * 5.5);
  float rays = 0.45 + 0.55 * noise(vec2(p.x * 22.0 + warp * 6.0, uTime * 0.25));
  float sway = 0.55 + 0.45 * sin(p.x * 3.3 - uTime * 0.2 + warp * 2.0);
  float aurora = curtain * rays * sway;
  vec3 auroraColor = mix(vec3(0.2, 1.0, 0.62), vec3(0.62, 0.4, 1.0), smoothstep(0.04, 0.26, above));
  sky += auroraColor * aurora * 1.05;

  // Stars everywhere, a little fainter in the bright glow near the horizon.
  float glowFade = 0.35 + 0.65 * smoothstep(0.14, 0.4, y);
  vec3 s = stars(p * 80.0, 0.16, 0.11) * 1.1
         + stars(p * 40.0 + 17.0, 0.1, 0.09) * 1.5
         + stars(p * 19.0 + 41.0, 0.07, 0.07) * 2.0;
  sky += s * glowFade;
  sky += vec3(1.0, 0.97, 0.9) * (shootingStar(p, aspect, 0.0) + shootingStar(p, aspect, 1.0));

  // The moon, a little right of the middle, with a soft warm glow.
  vec2 moon = vec2(aspect * 0.14, 0.64);
  float r = 0.05;
  float d = length(p - moon);
  float glow = exp(-d * 4.0) * 0.28 + exp(-d * 14.0) * 0.4;
  sky += vec3(1.0, 0.9, 0.75) * glow * 0.6;
  if (d < r * 1.02) {
    vec2 m = (p - moon) / r;
    float limb = sqrt(max(0.0, 1.0 - dot(m, m)));
    float seas = fbm(m * 2.2 + 4.0);
    vec3 face = vec3(1.0, 0.97, 0.88) * (0.8 + 0.2 * limb);
    face *= 1.0 - 0.18 * smoothstep(0.45, 0.7, seas);
    sky = mix(sky, face, smoothstep(1.0, 0.95, length(m)));
  }

  // Low hills in mist along the bottom, their tops caught by the glow.
  float far = 0.15 + 0.03 * fbm(vec2(p.x * 1.6, 3.0)) + 0.018 * sin(p.x * 2.5);
  float near = 0.085 + 0.045 * fbm(vec2(p.x * 2.4 + 8.0, 1.0));
  float mist = exp(-max(0.0, y - far) * 16.0) * 0.18;
  sky += vec3(1.0, 0.7, 0.65) * mist;
  vec3 farHill = vec3(0.24, 0.13, 0.27) + vec3(0.25, 0.12, 0.1) * smoothstep(far - 0.02, far, y);
  sky = mix(sky, farHill, smoothstep(far + 0.002, far - 0.002, y));
  sky = mix(sky, vec3(0.07, 0.05, 0.12), smoothstep(near + 0.002, near - 0.002, y));

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
      // Over the camera picture, behind the cloth and the live hands.
      renderOrder={-998}
      frustumCulled={false}
      material={material}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
};
