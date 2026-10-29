// The four fabrics. Each has its own feel (how it moves) and its own finish
// (how light sits on it). The live picture is always the fabric's pattern.
import type { ClothPhysics } from "./sim";

export type LookId = "silk" | "denim" | "jelly" | "foil";

export type LookFinish = {
  /** How much folds darken and brighten with the light (0–1). */
  shading: number;
  /** Highlight strength and tightness. */
  gloss: number;
  shininess: number;
  /** Soft glow at grazing angles, like silk. */
  sheen: number;
  /** Mirror-like metal: the picture tinted by bright reflections (0–1). */
  metal: number;
  /** Fine twill weave bumps (denim). */
  weave: number;
  /** Fine crinkle bumps (foil). */
  crinkle: number;
  /** How much of the sky shows through (jelly). */
  clarity: number;
};

export type Look = {
  id: LookId;
  label: string;
  physics: ClothPhysics;
  finish: LookFinish;
};

export const LOOKS: Look[] = [
  {
    id: "silk",
    label: "Silk",
    physics: {
      iterations: 6,
      stretch: 1,
      slack: 0.05,
      bend: 0.06,
      damping: 0.97,
      homeSpring: 10,
      gravity: 9,
      buckle: 0.55,
      creaseMemory: 0,
      creaseFade: 0,
    },
    finish: {
      shading: 0.85,
      gloss: 0.32,
      shininess: 24,
      sheen: 0.45,
      metal: 0,
      weave: 0,
      crinkle: 0,
      clarity: 0,
    },
  },
  {
    id: "denim",
    label: "Denim",
    physics: {
      iterations: 10,
      stretch: 1,
      slack: 0.03,
      bend: 0.55,
      damping: 0.965,
      homeSpring: 7,
      gravity: 11,
      buckle: 0.3,
      creaseMemory: 0,
      creaseFade: 0,
    },
    finish: {
      shading: 1,
      gloss: 0.04,
      shininess: 6,
      sheen: 0.05,
      metal: 0,
      weave: 1,
      crinkle: 0,
      clarity: 0,
    },
  },
  {
    id: "jelly",
    label: "Jelly",
    physics: {
      iterations: 3,
      stretch: 0.45,
      slack: 0.3,
      bend: 0.25,
      damping: 0.98,
      homeSpring: 22,
      gravity: 7,
      buckle: 0.25,
      creaseMemory: 0,
      creaseFade: 0,
    },
    finish: {
      shading: 0.55,
      gloss: 1.3,
      shininess: 110,
      sheen: 0.3,
      metal: 0,
      weave: 0,
      crinkle: 0,
      clarity: 0.3,
    },
  },
  {
    id: "foil",
    label: "Foil",
    physics: {
      iterations: 10,
      stretch: 1,
      slack: 0.03,
      bend: 0.12,
      damping: 0.95,
      homeSpring: 4,
      gravity: 8,
      buckle: 1.1,
      creaseMemory: 0.85,
      creaseFade: 0.3,
    },
    finish: {
      shading: 1,
      gloss: 1.1,
      shininess: 60,
      sheen: 0,
      metal: 0.75,
      weave: 0,
      crinkle: 1,
      clarity: 0,
    },
  },
];

export const lookById = (id: LookId) =>
  LOOKS.find((l) => l.id === id) ?? LOOKS[0];
