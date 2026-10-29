// How the cloth is drawn: the live picture is the fabric's pattern, and light
// falls on its folds. Lying flat, the front is exactly the camera picture;
// every fold darkens or catches a highlight. The back of the fabric shows a
// darker, greyer copy of the picture, so a fold over itself reads clearly.
import { DoubleSide, ShaderMaterial, Vector3 } from "three";
import type { Texture } from "three";

import type { LookFinish } from "./looks";

const vertexShader = /* glsl */ `
attribute float aFold;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vFold;

void main() {
  vUv = uv;
  vFold = aFold;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uCamera;
uniform vec3 uLight;
uniform vec2 uRepeat;
uniform float uShading;
uniform float uGloss;
uniform float uShininess;
uniform float uSheen;
uniform float uMetal;
uniform float uWeave;
uniform float uCrinkle;
uniform float uClarity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vFold;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Smooth value noise and its slope, for the crinkle bumps.
vec3 noised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  float v = a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
  vec2 g = du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx);
  return vec3(v, g);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 V = normalize(-vViewPos);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;

  // How far this spot is tilted from lying flat: highlights only live on
  // folds, so the resting sheet is the picture itself.
  float tilt = smoothstep(0.004, 0.09, 1.0 - abs(N.z));

  // Jelly bends the picture a little where it bulges, like looking through
  // a thick clear sweet. Flat, nothing shifts.
  vec2 bend = uClarity > 0.0 ? N.xy * 0.09 * uClarity * tilt : vec2(0.0);
  vec3 base = texture2D(uCamera, vUv + bend).rgb;

  // Fine surface bumps: a twill weave (denim) or crinkles (foil).
  vec2 bump = vec2(0.0);
  float weaveShade = 0.0;
  if (uWeave > 0.0) {
    // Diagonal twill ridges, broken up a little so they read as threads.
    vec2 p = vUv * uRepeat;
    float d = (p.x + p.y) * 6.2832;
    float ridge = sin(d);
    float slub = sin(p.x * 3.1416) * sin(p.y * 1.7) * 0.5;
    bump += uWeave * vec2(cos(d)) * (0.14 + 0.06 * slub);
    weaveShade = uWeave * (ridge * 0.035 + slub * 0.03);
  }
  if (uCrinkle > 0.0) {
    float amount = uCrinkle * (0.14 + 0.9 * clamp(vFold * 3.0, 0.0, 1.0));
    vec3 n1 = noised(vUv * uRepeat * 0.9);
    vec3 n2 = noised(vUv * uRepeat * 2.3 + 7.1);
    bump += amount * (n1.yz * 0.22 + n2.yz * 0.1);
  }
  vec3 Nb = normalize(N + vec3(bump, 0.0));

  // Soft light from above, a little in front.
  vec3 L = normalize(uLight);
  float flatDiffuse = 0.42 + 0.58 * max(L.z, 0.0);
  float diffuse = 0.42 + 0.58 * max(dot(Nb, L), 0.0);
  float shade = mix(1.0, diffuse / flatDiffuse, uShading);
  shade *= 1.0 + weaveShade;

  vec3 col = base;
  if (uClarity > 0.0) {
    // Jelly: a touch brighter and juicier, glowing where light passes through.
    col = mix(vec3(luma(col)), col, 1.0 + 0.6 * uClarity);
    col *= 1.0 + 0.25 * uClarity * tilt;
  }
  if (!gl_FrontFacing) {
    // The back of the fabric: darker and greyer, like cloth seen from behind.
    col = mix(vec3(luma(base)), base, 0.4) * 0.55;
  }

  // Foil: the picture turns silvery and picks up bright reflections.
  if (uMetal > 0.0) {
    vec3 R = reflect(-V, Nb);
    float strips = pow(abs(sin(R.x * 5.0 + R.y * 3.0)), 6.0);
    float sky = smoothstep(-0.2, 0.9, R.y);
    float env = 0.55 + 0.35 * sky + 0.9 * strips * (0.3 + 0.7 * tilt);
    vec3 silver = vec3(luma(col)) * 1.05 + 0.04;
    col = mix(col, silver, 0.32 * uMetal) * mix(1.0, env, uMetal);
  }

  col *= shade;

  vec3 H = normalize(L + V);
  float spec = uGloss * pow(max(dot(Nb, H), 0.0), uShininess);
  float rim = uSheen * pow(1.0 - max(dot(Nb, V), 0.0), 3.0);
  float glint = uCrinkle > 0.0 ? max(tilt, 0.35) : tilt;
  col += vec3(spec * glint + rim * tilt) * (gl_FrontFacing ? 1.0 : 0.5);

  // Jelly: a little of the sky shows through, more at the folds.
  float alpha = 1.0 - uClarity * (0.6 + 0.4 * tilt);

  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

export const createClothMaterial = () =>
  new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    uniforms: {
      uCamera: { value: null as Texture | null },
      uLight: { value: new Vector3(0.3, 0.75, 0.6) },
      uRepeat: { value: [60, 100] },
      uShading: { value: 1 },
      uGloss: { value: 0 },
      uShininess: { value: 16 },
      uSheen: { value: 0 },
      uMetal: { value: 0 },
      uWeave: { value: 0 },
      uCrinkle: { value: 0 },
      uClarity: { value: 0 },
    },
  });

/** The uniform each finish setting drives. */
const FINISH_UNIFORM: Record<keyof LookFinish, string> = {
  shading: "uShading",
  gloss: "uGloss",
  shininess: "uShininess",
  sheen: "uSheen",
  metal: "uMetal",
  weave: "uWeave",
  crinkle: "uCrinkle",
  clarity: "uClarity",
};

/** Ease the material towards a finish (`k` = share of the way, 0–1). */
export const blendFinish = (
  material: ShaderMaterial,
  finish: LookFinish,
  k: number,
) => {
  (Object.keys(FINISH_UNIFORM) as (keyof LookFinish)[]).forEach((key) => {
    const u = material.uniforms[FINISH_UNIFORM[key]];
    u.value += (finish[key] - u.value) * k;
  });
};
