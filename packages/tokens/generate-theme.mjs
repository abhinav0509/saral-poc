// Generates theme.css (a Tailwind v4 @theme block) from tokens.data.mjs.
// Run via `node generate-theme.mjs` (the package `build` script) to write the
// file; the drift test imports generateThemeCss() and compares to the committed
// theme.css so the two can never silently diverge.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  colorPrimitives,
  colorSemantic,
  radius,
  fontFamily,
  fontSize,
  duration,
  easing,
  shadow,
} from "./tokens.data.mjs";

function semanticRef(value) {
  if (typeof value === "string") return value;
  const [group, shade] = value;
  return `var(--color-${group}-${shade})`;
}

export function generateThemeCss() {
  const lines = [];
  const push = (s = "") => lines.push(s);

  push("/* ============================================================");
  push("   SARAL · DESIGN TOKENS  (generated — do not edit by hand)");
  push("   Source: packages/tokens/tokens.data.mjs");
  push("   Regenerate: pnpm --filter @saral/tokens build");
  push("   ============================================================ */");
  push("");
  push("@theme {");

  // ---------- COLOR · PRIMITIVES ----------
  push("  /* ---------- COLOR · PRIMITIVES ---------- */");
  for (const [group, ramp] of Object.entries(colorPrimitives)) {
    for (const [shade, hex] of Object.entries(ramp)) {
      push(`  --color-${group}-${shade}: ${hex};`);
    }
    push("");
  }

  // ---------- COLOR · SEMANTIC ALIASES ----------
  push("  /* ---------- COLOR · SEMANTIC ALIASES ---------- */");
  for (const [group, entries] of Object.entries(colorSemantic)) {
    for (const [key, value] of Object.entries(entries)) {
      push(`  --color-${group}-${key}: ${semanticRef(value)};`);
    }
    push("");
  }

  // ---------- RADIUS ----------
  push("  /* ---------- RADIUS ---------- */");
  for (const [key, value] of Object.entries(radius)) {
    push(`  --radius-${key}: ${value};`);
  }
  push("");

  // ---------- FONTS ----------
  push("  /* ---------- FONTS ---------- */");
  for (const [key, value] of Object.entries(fontFamily)) {
    push(`  --font-${key}: ${value};`);
  }
  push("");

  // ---------- TYPE ROLES ----------
  push("  /* ---------- TYPE ROLES ---------- */");
  for (const [role, spec] of Object.entries(fontSize)) {
    push(`  --text-${role}: ${spec.size};`);
  }
  push("");
  for (const [role, spec] of Object.entries(fontSize)) {
    push(`  --text-${role}--line-height: ${spec.lineHeight};`);
  }
  push("");
  for (const [role, spec] of Object.entries(fontSize)) {
    if (spec.letterSpacing) {
      push(`  --text-${role}--letter-spacing: ${spec.letterSpacing};`);
    }
  }
  push("");

  // ---------- MOTION ----------
  push("  /* ---------- MOTION ---------- */");
  for (const [key, value] of Object.entries(duration)) {
    push(`  --duration-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(easing)) {
    push(`  --ease-${key}: ${value};`);
  }
  push("");

  // ---------- ELEVATION ----------
  push("  /* ---------- ELEVATION ---------- */");
  for (const [key, value] of Object.entries(shadow)) {
    push(`  --shadow-${key}: ${value};`);
  }

  push("}");
  push("");
  return lines.join("\n");
}

// Write the file when invoked directly (not when imported by the test).
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const out = new URL("./theme.css", import.meta.url);
  writeFileSync(out, generateThemeCss());
  console.log("[tokens] wrote theme.css");
}
