import Svg, { Path, Circle } from "react-native-svg";
import { palette } from "@/lib/colors";

/**
 * The Saral mark — a single archway (clinic doorway / sanctuary) with a Haldi
 * bindi (the patient at the heart). Built on an 80×96 grid: pillars at x=14 &
 * x=66, spring line y=44, apex y=18, open base y=88. Stroke 7, bindi r=5 at (40,33).
 */
export function SaralArch({
  size = 24,
  stroke = palette.brand,
  bindi = palette.accent,
}: {
  size?: number;
  stroke?: string;
  bindi?: string;
}) {
  const w = size;
  const h = Math.round((size * 96) / 80);
  return (
    <Svg width={w} height={h} viewBox="0 0 80 96" fill="none">
      <Path
        d="M 14 88 L 14 44 C 14 30 26 18 40 18 C 54 18 66 30 66 44 L 66 88"
        stroke={stroke}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {size >= 18 && <Circle cx={40} cy={33} r={5} fill={bindi} />}
    </Svg>
  );
}
