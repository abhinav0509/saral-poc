// ============================================================
// SARAL · DESIGN TOKENS — single source of truth
// Ported 1:1 from the original app/globals.css @theme block.
// Plain ESM (no types) so plain Node can generate CSS from it
// AND so tokens.ts can re-export it with types layered on.
// Do not edit values without updating the Figma variable collection.
// After editing, run `pnpm --filter @saral/tokens build` to regen theme.css.
// ============================================================

/** Color primitives — raw ramps. */
export const colorPrimitives = {
  primary: {
    50: "#E8F4F3",
    100: "#C7E4E2",
    200: "#8FC9C5",
    300: "#5EAEA8",
    400: "#2E938B",
    500: "#0E5E5A",
    600: "#0B4B48",
    700: "#093937",
    800: "#062826",
    900: "#041716",
    950: "#021110",
  },
  accent: {
    50: "#FBF1EA",
    100: "#F7E0D0",
    200: "#EFC1A1",
    300: "#E7A172",
    400: "#DF8B53",
    500: "#D97A3C",
    600: "#B65D26",
    700: "#93491D",
    800: "#6F3514",
    900: "#4B240C",
  },
  neutral: {
    0: "#FAF8F4", // Mist · canvas
    50: "#F3F1ED",
    100: "#E6E2DA", // Hairline
    200: "#D6D2C9",
    300: "#B8B4AB",
    400: "#8B8780",
    500: "#6E6A64",
    600: "#5A6168", // Muted ink
    700: "#41464A",
    800: "#2A2D30",
    900: "#1A1C1E",
    950: "#0F1419", // Ink
  },
  sage: {
    50: "#ECF4F0",
    100: "#D2E6DC",
    200: "#A5CDB9",
    300: "#79B496",
    400: "#5BA487",
    500: "#4A9B7F",
    600: "#3D8068",
    700: "#2F6451",
    800: "#214839",
    900: "#122B22",
  },
  amber: {
    50: "#FAF1E0",
    100: "#F4DFB6",
    200: "#E9C273",
    300: "#DEA52F",
    400: "#C9881B",
    500: "#B8740F",
    600: "#98610C",
    700: "#784E0A",
    800: "#583807",
    900: "#382503",
  },
  sindoor: {
    50: "#F7E5E8",
    100: "#EDC1C7",
    200: "#DA8D97",
    300: "#C75C68",
    400: "#BC4753",
    500: "#B23A48",
    600: "#92303B",
    700: "#74262F",
    800: "#561C23",
    900: "#381217",
  },
};

/**
 * Semantic color aliases. Values are token references (group + shade) into
 * colorPrimitives, EXCEPT raw strings (e.g. text.inverse) noted inline.
 * On web these become `var(--color-<group>-<shade>)`; in JS/RN we resolve
 * them to concrete hex via resolveSemantic().
 */
export const colorSemantic = {
  surface: {
    canvas: ["neutral", 0],
    raised: ["neutral", 50],
    sunken: ["neutral", 100],
    inverse: ["neutral", 950],
    brand: ["primary", 500],
    "brand-subtle": ["primary", 50],
    "accent-subtle": ["accent", 50],
  },
  text: {
    primary: ["neutral", 950],
    secondary: ["neutral", 600],
    tertiary: ["neutral", 400],
    // Pure white — warm cream read too dim on teal CTAs
    inverse: "#FFFFFF",
    brand: ["primary", 500],
    accent: ["accent", 600],
    success: ["sage", 700],
    warning: ["amber", 700],
    critical: ["sindoor", 600],
  },
  border: {
    subtle: ["neutral", 100],
    default: ["neutral", 200],
    strong: ["neutral", 400],
    focus: ["primary", 500],
    brand: ["primary", 500],
    critical: ["sindoor", 500],
  },
};

export const radius = {
  none: "0",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  "2xl": "1.5rem",
  full: "9999px",
};

export const fontFamily = {
  sans: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  hindi: "var(--font-mukta), var(--font-inter), sans-serif",
};

/**
 * Type roles. Each: { size, lineHeight, letterSpacing? }.
 * Emitted as --text-<role>, --text-<role>--line-height, --text-<role>--letter-spacing.
 */
export const fontSize = {
  "display-lg": { size: "3rem", lineHeight: "3.5rem", letterSpacing: "-0.03em" },
  "display-md": { size: "2.25rem", lineHeight: "2.75rem", letterSpacing: "-0.02em" },
  h1: { size: "2rem", lineHeight: "2.5rem", letterSpacing: "-0.02em" },
  h2: { size: "1.5rem", lineHeight: "2rem", letterSpacing: "-0.015em" },
  h3: { size: "1.25rem", lineHeight: "1.75rem", letterSpacing: "-0.01em" },
  h4: { size: "1.125rem", lineHeight: "1.625rem", letterSpacing: "-0.005em" },
  "body-lg": { size: "1rem", lineHeight: "1.5rem" },
  "body-md": { size: "0.875rem", lineHeight: "1.25rem" },
  "body-sm": { size: "0.75rem", lineHeight: "1.125rem" },
  "label-lg": { size: "0.875rem", lineHeight: "1.25rem" },
  "label-md": { size: "0.75rem", lineHeight: "1rem" },
  "label-sm": { size: "0.6875rem", lineHeight: "0.875rem" },
  caption: { size: "0.6875rem", lineHeight: "0.875rem" },
};

export const duration = {
  fast: "120ms",
  default: "200ms",
  slow: "320ms",
  reveal: "480ms",
};

export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0, 0, 0, 1)",
  exit: "cubic-bezier(0.3, 0, 1, 1)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1.2)",
};

export const shadow = {
  sm: "0 1px 2px rgba(15, 20, 25, 0.04), 0 1px 3px rgba(15, 20, 25, 0.06)",
  md: "0 4px 6px -1px rgba(15, 20, 25, 0.06), 0 2px 4px -2px rgba(15, 20, 25, 0.08)",
  lg: "0 12px 16px -4px rgba(15, 20, 25, 0.08), 0 4px 8px -2px rgba(15, 20, 25, 0.10)",
};

/** Resolve a semantic value (token-ref tuple or raw string) to concrete hex. */
export function resolveSemantic(value) {
  if (typeof value === "string") return value;
  const [group, shade] = value;
  return colorPrimitives[group][shade];
}
