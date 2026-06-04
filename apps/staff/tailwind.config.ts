import type { Config } from "tailwindcss";
import {
  colorPrimitives,
  colorSemantic,
  radius,
  fontSize,
  resolveSemantic,
} from "@saral/tokens";

// Flatten semantic aliases → "surface-brand", "text-primary", "border-default"…
// so the RN app uses the SAME class names as the web app
// (bg-surface-brand, text-text-primary, border-border-default).
const semanticColors: Record<string, string> = {};
for (const [group, entries] of Object.entries(colorSemantic)) {
  for (const [key, value] of Object.entries(entries)) {
    semanticColors[`${group}-${key}`] = resolveSemantic(value as never);
  }
}

// Primitive ramps → primary: { 50: …, 500: … }, accent, sage, etc.
const primitiveColors = colorPrimitives as Record<string, Record<string, string>>;

// Type ramp → text-h1, text-label-md, … carrying line-height + letter-spacing.
const fontSizeMap: Record<
  string,
  [string, { lineHeight: string; letterSpacing?: string }]
> = {};
for (const [role, spec] of Object.entries(fontSize)) {
  const letterSpacing = (spec as { letterSpacing?: string }).letterSpacing;
  fontSizeMap[role] = [
    spec.size,
    {
      lineHeight: spec.lineHeight,
      ...(letterSpacing ? { letterSpacing } : {}),
    },
  ];
}

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: { ...primitiveColors, ...semanticColors },
      borderRadius: radius,
      fontSize: fontSizeMap,
    },
  },
  plugins: [],
} satisfies Config;
