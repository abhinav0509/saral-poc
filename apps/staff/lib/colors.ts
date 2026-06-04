// Concrete hex from the shared tokens — for the handful of RN props that take a
// color value instead of a className (ActivityIndicator, SVG fills, Animated
// interpolations, StatusBar). Keep everything else on NativeWind classes.
import { colorPrimitives, colorSemantic, resolveSemantic } from "@saral/tokens";

export const palette = {
  brand: colorPrimitives.primary[500],
  brandSubtle: colorPrimitives.primary[50],
  accent: colorPrimitives.accent[500],
  sage: colorPrimitives.sage[500],
  sage100: colorPrimitives.sage[100],
  sindoor: colorPrimitives.sindoor[500],
  amber: colorPrimitives.amber[500],
  canvas: resolveSemantic(colorSemantic.surface.canvas),
  raised: resolveSemantic(colorSemantic.surface.raised),
  sunken: resolveSemantic(colorSemantic.surface.sunken),
  inverse: resolveSemantic(colorSemantic.surface.inverse),
  ink: resolveSemantic(colorSemantic.text.primary),
  muted: resolveSemantic(colorSemantic.text.secondary),
  tertiary: resolveSemantic(colorSemantic.text.tertiary),
  hairline: resolveSemantic(colorSemantic.border.subtle),
  borderDefault: resolveSemantic(colorSemantic.border.default),
} as const;
