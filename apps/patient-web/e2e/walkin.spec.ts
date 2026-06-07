import { test, expect } from "@playwright/test";

// Read-only smoke tests — safe against any environment (no writes).

test("walk-in page renders a known clinic + the check-in form", async ({ page }) => {
  await page.goto("/walkin/drmehta");
  await expect(page.getByText("Dr. Mehta's Clinic")).toBeVisible();
  await expect(page.getByPlaceholder("e.g. Riya Sharma")).toBeVisible();
});

test("an unknown clinic code shows the not-found page", async ({ page }) => {
  await page.goto("/walkin/__no_such_clinic__");
  await expect(page.getByText(/Clinic not found/i)).toBeVisible();
});
