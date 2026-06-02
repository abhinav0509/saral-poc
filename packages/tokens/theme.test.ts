import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { generateThemeCss } from "./generate-theme.mjs";

describe("@saral/tokens", () => {
  it("theme.css is in sync with tokens.data.mjs", () => {
    // If this fails, run: pnpm --filter @saral/tokens build
    const committed = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
    expect(generateThemeCss()).toBe(committed);
  });
});
