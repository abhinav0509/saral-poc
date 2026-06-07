import { defineConfig, devices } from "@playwright/test";

/**
 * Patient-web E2E. Runs against PLAYWRIGHT_BASE_URL (a Vercel preview/prod URL)
 * or a local `next dev`. Read-only smoke tests run anywhere; the self-check-in
 * write test is gated behind TEST_CLINIC_CODE so it never touches a real clinic.
 *   Local:  PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter @saral/patient-web e2e
 *   CI:     PLAYWRIGHT_BASE_URL=<preview-url> pnpm --filter @saral/patient-web e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://saral-poc.vercel.app",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
