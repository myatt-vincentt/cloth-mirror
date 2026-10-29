// The live picture as a hanging sheet of cloth. It lies exactly where the
// camera picture is, pinned along the top. Grab it with a finger or the mouse
// to pull, peel, fold and crumple it; let go and it swings back and settles.
// A double-tap re-hangs it neatly.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  PerspectiveCamera,
  Vector3,
} from "three";
import { useXRCameraTexture } from "@vincentt-xr/sdk/low-level";

import { blendFinish, createClothMaterial } from "./clothMaterial";
import { lookById } from "./looks";
import { Cloth, gridFor } from "./sim";
import { devView, getLook, setLook } from "./state";
import { HandGrab } from "./HandGrab";
import { HeadShake } from "./HeadShake";
import { useGrabControl } from "./useGrabControl";
import { usePointerGrab } from "./usePointerGrab";

/** Dev only: head shakes that re-hung the sheet. */
const devCount = { shakes: 0 };

/** The picture plane's depth: where the camera background is drawn. */
const PLANE_Z = -1;
/** How fast a new fabric's finish fades in (1/s). */
const FINISH_RATE = 8;
/**
 * Moved cloth is nudged towards the camera a little, more further down the
 * sheet, so a flap folded over itself never flickers against the part below.
 * Nothing moves while the sheet rests, so it still lines up with the picture.
 */
const LAYER_LIFT = 0.05;

const buildGeometry = (cloth: Cloth) => {
  const { cols, rows, count } = cloth;
  const g = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(count * 3), 3);
  position.setUsage(DynamicDrawUsage);
  position.array.set(cloth.home);
  const normal = new BufferAttribute(new Float32Array(count * 3), 3);
  normal.setUsage(DynamicDrawUsage);
  const fold = new BufferAttribute(new Float32Array(count), 1);
  fold.setUsage(DynamicDrawUsage);
  const uv = new Float32Array(count * 2);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const k = j * cols + i;
      uv[k * 2] = i / (cols - 1);
      uv[k * 2 + 1] = 1 - j / (rows - 1);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  g.setAttribute("position", position);
  g.setAttribute("normal", normal);
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setAttribute("aFold", fold);
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
};

export const ClothSheet = () => {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const texture = useXRCameraTexture();

  // The picture plane fills the view exactly, like the camera background.
  const aspect = size.width / Math.max(1, size.height);
  const camZ = camera.position.z || 5;
  const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * (camZ - PLANE_Z);
  const width = height * aspect;
  const { cols, rows } = gridFor(aspect);

  const cloth = useMemo(
    () =>
      new Cloth(
        cols,
        rows,
        width,
        height,
        PLANE_Z,
        lookById(getLook()).physics,
      ),
    [cols, rows, width, height],
  );
  const geometry = useMemo(() => buildGeometry(cloth), [cloth]);
  const material = useMemo(() => createClothMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const control = useGrabControl(cloth, PLANE_Z);
  usePointerGrab(cloth, control);

  // Dev only: a window object for checking (particle count, grab state, look).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return undefined;
    const w = window as unknown as { __cloth?: unknown };
    let avg = 0;
    const timer = window.setInterval(() => {
      avg = avg * 0.8 + cloth.lastMs * 0.2;
    }, 100);
    w.__cloth = {
      get particles() {
        return cloth.count;
      },
      get grid() {
        return { cols: cloth.cols, rows: cloth.rows };
      },
      get constraints() {
        return cloth.constraintCount;
      },
      get grabs() {
        return cloth.grabbed();
      },
      get look() {
        return getLook();
      },
      setLook,
      rehang: () => cloth.startRehang(),
      get rehanging() {
        return cloth.rehanging;
      },
      get shakes() {
        return devCount.shakes;
      },
      get asleep() {
        return cloth.asleep;
      },
      get simMs() {
        return +avg.toFixed(3);
      },
      get maxDisplacement() {
        return +cloth.maxDisplacement().toFixed(4);
      },
      get textureColorSpace() {
        return texture?.colorSpace;
      },
      /** Show the bare camera picture, to compare with the resting cloth. */
      set bare(v: boolean) {
        devView.bare = v;
      },
      /** Show only the night behind the cloth. */
      set skyOnly(v: boolean) {
        devView.skyOnly = v;
      },
    };
    return () => {
      window.clearInterval(timer);
      delete w.__cloth;
    };
  }, [cloth, texture]);

  const meshRef = useRef<Mesh>(null);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const look = lookById(getLook());
    cloth.physics = look.physics;
    blendFinish(material, look.finish, 1 - Math.exp(-FINISH_RATE * dt));
    material.uniforms.uCamera.value = texture ?? null;
    material.uniforms.uRepeat.value = [cols * 3, rows * 3];

    control.update(dt);
    const wasAsleep = cloth.asleep;
    cloth.update(dt);
    if (meshRef.current)
      meshRef.current.visible = !!texture && !devView.bare && !devView.skyOnly;
    // Nothing moved: the mesh from last frame is still right.
    if (wasAsleep && cloth.asleep) return;

    const position = geometry.getAttribute("position") as BufferAttribute;
    const fold = geometry.getAttribute("aFold") as BufferAttribute;
    const out = position.array as Float32Array;
    const folds = fold.array as Float32Array;
    const { pos, home } = cloth;
    for (let k = 0; k < cloth.count; k += 1) {
      const x = k * 3;
      tmp.set(
        pos[x] - home[x],
        pos[x + 1] - home[x + 1],
        pos[x + 2] - home[x + 2],
      );
      const moved = tmp.length();
      const row = Math.floor(k / cloth.cols) / (cloth.rows - 1);
      out[x] = pos[x];
      out[x + 1] = pos[x + 1];
      out[x + 2] = pos[x + 2] + LAYER_LIFT * row * Math.min(1, moved / 0.2);
      folds[k] = moved;
    }
    position.needsUpdate = true;
    fold.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        frustumCulled={false}
        renderOrder={0}
      />
      <HandGrab control={control} />
      <HeadShake
        onShake={() => {
          if (control.holding() === 0) {
            cloth.startRehang();
            devCount.shakes += 1;
          }
        }}
      />
    </>
  );
};
