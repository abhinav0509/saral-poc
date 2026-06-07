import { test, expect } from "@playwright/test";

// WRITE test — gated so it never inserts into a real clinic's queue.
// Seed a throwaway clinic (e.g. code "qatest") and run:
//   TEST_CLINIC_CODE=qatest pnpm --filter @saral/patient-web e2e
const code = process.env.TEST_CLINIC_CODE;

test.describe("patient self-check-in (write)", () => {
  test.skip(!code, "set TEST_CLINIC_CODE to a throwaway clinic to run the write E2E");

  test("fills the form and lands on the live visit page", async ({ page }) => {
    await page.goto(`/walkin/${code}`);

    await page.getByPlaceholder("e.g. Riya Sharma").fill("E2E Test Patient");
    await page.getByPlaceholder("34").fill("30");
    await page.getByRole("button", { name: "Female" }).click();
    await page.getByPlaceholder("10-digit mobile").fill("9000000000");

    // SlotPicker auto-selects the next free slot, so the CTA becomes "Get my token".
    const cta = page.getByRole("button", { name: /Get my token/i });
    await expect(cta).toBeEnabled();
    await cta.click();

    // On success the form redirects to the live visit page.
    await expect(page).toHaveURL(/\/v\//, { timeout: 15_000 });
  });
});
