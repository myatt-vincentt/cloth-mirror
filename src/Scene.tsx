// Scene.tsx — Cloth Mirror: your camera picture is a sheet of cloth. Pull,
// peel, fold and crumple it to find a starry night behind. See PLAN.md.
import { lazy, Suspense } from "react";

import { ClothScene } from "./cloth/ClothScene";

// Dev-only helper for previewing without a camera. Lazy and behind a
// constant esbuild folds to false in production. Two rules:
// `process.env.NODE_ENV`, not `import.meta.env.DEV` (vincentt-xr/v2-template#112);
// and write the check INSIDE the ternary — hoisted into a `const`, esbuild
// keeps the dead branch.
const DevMediaSwitcher =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./DevMediaSwitcher"))
    : null;

export const Scene = () => (
  <>
    <ClothScene />
    {DevMediaSwitcher ? (
      <Suspense fallback={null}>
        <DevMediaSwitcher />
      </Suspense>
    ) : null}
  </>
);
