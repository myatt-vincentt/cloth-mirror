// Which fabric is on, shared by the chips and the cloth.
import { useSyncExternalStore } from "react";

import type { LookId } from "./looks";

let look: LookId = "silk";
const listeners = new Set<() => void>();

export const getLook = () => look;

export const setLook = (next: LookId) => {
  if (next === look) return;
  look = next;
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useLook = () => useSyncExternalStore(subscribe, getLook, getLook);

/**
 * Dev only: `bare` hides the cloth and the night sky, leaving the plain
 * camera picture, to check the resting cloth matches it.
 */
export const devView = { bare: false };
