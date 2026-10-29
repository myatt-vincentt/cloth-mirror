// Dev only: keyboard shortcuts for previewing. 1–4 pick silk, denim, jelly
// or foil; R re-hangs the sheet. Never reaches production (Scene.tsx).
import { useEffect } from "react";

import { LOOKS } from "./looks";
import { setLook } from "./state";

const DevKeys = () => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= LOOKS.length) setLook(LOOKS[n - 1].id);
      if (e.key === "r" || e.key === "R")
        (
          window as unknown as { __cloth?: { rehang: () => void } }
        ).__cloth?.rehang();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
};

export default DevKeys;
