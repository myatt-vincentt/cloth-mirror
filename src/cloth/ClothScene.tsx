// Cloth Mirror: the live picture is a sheet of cloth hanging from the top of
// the screen, with a magical night behind it (NightSky.tsx). Grab and pull it
// by hand or touch (ClothSheet.tsx), pick its fabric with the chips
// (LookChips.tsx); a ghost hand shows how until the first grab (PinchHint.tsx).
import { ClothSheet } from "./ClothSheet";
import { LookChips } from "./LookChips";
import { NightSky } from "./NightSky";
import { PinchHint } from "./PinchHint";

export const ClothScene = () => (
  <>
    <NightSky />
    <ClothSheet />
    <LookChips />
    <PinchHint />
  </>
);
