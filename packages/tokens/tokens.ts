// Typed surface over the canonical token data (tokens.data.mjs).
// Consumers (the staff app's NativeWind config, JS that needs concrete hex,
// etc.) import from here; Tailwind on the web consumes ./theme.css instead.
export {
  colorPrimitives,
  colorSemantic,
  radius,
  fontFamily,
  fontSize,
  duration,
  easing,
  shadow,
  resolveSemantic,
} from "./tokens.data.mjs";
