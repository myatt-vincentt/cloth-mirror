// Cloth Mirror: the live picture is a sheet of cloth hanging from the top of
// the screen, with a starry night behind it (NightSky.tsx). Grab and pull it
// (ClothSheet.tsx) and pick its fabric with the chips (LookChips.tsx).
import { ClothSheet } from "./ClothSheet";
import { LookChips } from "./LookChips";
import { NightSky } from "./NightSky";

export const ClothScene = () => (
  <>
    <NightSky />
    <ClothSheet />
    <LookChips />
  </>
);
