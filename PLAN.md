# Plan — Cloth Mirror

Your camera picture is a sheet of cloth. Pull it, peel a corner, fold it over and crumple it,
and a starry night shows behind it. The picture keeps playing live as it bends, so your own
face folds. Built on SDK 2.0.0-alpha.9. Front camera, one player.

## Design

- The picture fills the whole window. Resting, the cloth lies exactly on the camera picture.
- It hangs like a curtain: the top corners and a few points along the top edge are pinned, so
  it can be pulled, peeled and crumpled but always swings back and settles. A double-tap
  re-hangs it neatly with an ease-out settle.
- Behind it is a quiet night: a deep blue sky, twinkling stars, a faint Milky Way, a soft moon
  with a warm glow, thin clouds and low hills in mist. One full-screen shader, no images.
- The back of the cloth shows a darker, greyer copy of the picture, so folds read clearly.
- Grab with a finger or the mouse: the nearest cloth point within reach is held with a small
  patch around it and follows the finger smoothly, lifting towards you the further it travels,
  so a corner peels up and folds over. Each finger holds its own point. Pulled past the sheet's
  reach it goes taut. Letting go keeps the finger's motion.
- Four fabrics, picked with wordless glass chips in the control band, each showing a tiny
  swatch. The picture is always the fabric's pattern.
  - Silk: soft sheen, flowy, low stiffness.
  - Denim: matte, a fine twill weave, stiffer.
  - Jelly: glossy and a little see-through, bends the picture where it bulges, wobbly and
    bouncy.
  - Foil: metallic and crinkly, keeps its creases for a while.

## How it works

- `src/cloth/sim.ts` (unit-tested): the cloth on the CPU. About 1200 particles in a grid with
  square cells for the window's shape, Verlet integration at a fixed 60 Hz, stretch and bend
  constraints, top pins, tethers to the pins (so a hard pull drags the sheet instead of thinning
  it), a pull back to the flat picture, and gravity on the parts that have been moved. Squeezed
  cloth buckles out of the picture so crumples wrinkle. Left alone, it firms up so folds come
  undone, lifts face-down flaps so they swing open, and after a few seconds eases any leftover
  knot home; at rest it stops simulating until the next grab.
- `ClothSheet.tsx`: the mesh, placed where the camera picture is drawn and textured with the
  live camera texture; normals every frame. Moved cloth is nudged a little towards the camera
  further down the sheet so folds never flicker against the part below.
- `clothMaterial.ts`: the fabric shader. Lying flat, the front is the picture itself; folds take
  light, highlights and sheen; the back is darker and greyer.
- `usePointerGrab.ts`: finger and mouse grabs, eased; a double-tap re-hangs.
- `NightSky.tsx`: the night behind. `LookChips.tsx`: the fabric chips. `looks.ts`: each fabric's
  feel and finish.
- Dev only: `window.__cloth` (particle count, grid, grab state, look, `setLook`, `rehang`, sim
  time per frame, how far the sheet is from rest).

## Next

Step 2: pinch in the air with either hand to grab, two hands to stretch, a hint, and polish.
