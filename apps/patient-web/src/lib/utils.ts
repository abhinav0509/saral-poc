import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The Saral type ramp defines custom font-size tokens (text-h1, text-label-md,
 * text-caption, …) on top of Tailwind's defaults. Out-of-the-box tw-merge
 * doesn't know these are font-sizes — it sees them as another `text-*` and
 * lumps them in with color utilities, dropping legitimate color classes
 * like `text-white` when both are present.
 *
 * Registering our scale here keeps the design system honest: every CTA
 * keeps its color even when a size class is also applied to the same node.
 */
const SARAL_FONT_SIZE_TOKENS = [
  "display-lg",
  "display-md",
  "h1",
  "h2",
  "h3",
  "h4",
  "body-lg",
  "body-md",
  "body-sm",
  "label-lg",
  "label-md",
  "label-sm",
  "caption",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: SARAL_FONT_SIZE_TOKENS }],
    },
  },
});

/**
 * Concatenate Tailwind class names, deduplicating where last-wins
 * conflicts would otherwise stick around. Use anywhere a component
 * accepts a `className` prop to keep overrides clean.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
