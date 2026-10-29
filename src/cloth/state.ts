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
 * camera picture, to check the resting cloth matches it; `skyOnly` hides
 * just the cloth.
 */
export const devView = { bare: false, skyOnly: false };

/** Whether anyone has grabbed the cloth yet (the hint goes for good then). */
let grabbedOnce = false;
export const markGrabbed = () => {
  grabbedOnce = true;
};
export const hasGrabbed = () => grabbedOnce;
