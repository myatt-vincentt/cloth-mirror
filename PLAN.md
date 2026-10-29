# Plan — Cloth Mirror

Your camera picture is a sheet of cloth. Pull it, peel a corner, fold it over and crumple it,
and a starry night shows behind it. The picture keeps playing live as it bends, so your own
face folds. Built on SDK 2.0.0-alpha.9. Front camera, one player.

## Design

- The picture fills the whole window. Resting, the cloth lies exactly on the camera picture.
- It hangs like a curtain: the top corners and a few points along the top edge are pinned, so
  it can be pulled, peeled and crumpled but always swings back and settles. A double-tap or a
  quick head shake (left, right, left) re-hangs it neatly with an ease-out settle.
- Behind it is a magical night just after sunset: a rosy, peach twilight glow along the
  horizon fading up into deep blue, a soft green-to-violet aurora rippling across the middle,
  bright twinkling stars everywhere with a shooting star now and then, a moon with a warm glow
  near the middle, and low hills in mist. One full-screen shader, no images.
- The back of the cloth shows a darker, greyer copy of the picture, so folds read clearly.
- Grab with a pinch in the air (thumb to index), a finger or the mouse: the nearest cloth point
  within reach is held with a small patch around it and follows smoothly, lifting towards you
  the further it travels, so a corner peels up and folds over. Each hand or finger holds its
  own point, so two hands stretch the sheet between them. Pulled past the sheet's reach it goes
  taut. Opening the hand or lifting the finger lets go and keeps the motion, so a flick throws.
- A small glowing Arles ring sits between thumb and index of each hand in view: hollow while
  open, filled while holding. Real hands always stay in front of the cloth and the sky; while a
  hand moves too fast for tracking to keep up, it fades behind the cloth instead of showing a
  stale patch, and comes back as it slows.
- Hint: low in the middle, a small see-through ghost hand pinches and pulls down, over and
  over, until the first grab (hand or touch); then it fades for good. No text.
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
- `useGrabControl.ts`: one grab, whatever holds it: picking the nearest point, the eased
  follow and the lift. `usePointerGrab.ts`: fingers and the mouse; a double-tap re-hangs.
- `HandGrab.tsx` + `pinch.sim.ts` (unit-tested): hands at 12 fps; a pinch closes at 0.62 and opens at 0.40, must hold two readings, never
  counts a fist or overlapping hands, and glides smoothly between readings. The rings.
- `LiveHands.tsx`: the live camera picture redrawn inside each hand's outline (the SDK's
  `writeHandCutout` silhouette) on top of the cloth. Each hand fades with how far its outline
  may be off (speed × the reading's age, `pinch.sim.ts`), so a lagging outline dissolves.
- `HeadShake.tsx` + `shake.sim.ts` (unit-tested): the head's turn from face tracking at 15 fps;
  three turning points at least 6° apart within 2.6 s.
- `PinchHint.tsx`: the SDK ghost hand (`HandGestureHint`, OK pose) on `hand-v1.glb`.
- `NightSky.tsx`: the night behind. `LookChips.tsx`: the fabric chips. `looks.ts`: each fabric's
  feel and finish.
- Dev only: `window.__cloth` (particle count, grid, grab state, look, `setLook`, `rehang`, sim
  time per frame, how far the sheet is from rest, head shakes seen, `bare` / `skyOnly` views).

## Next

Step 3: polish.
