import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("launcher has no serious or critical axe violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("main.app-shell")).toHaveAttribute("data-ready", "true");
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
});

test("primary controls meet the 44px touch target minimum", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("main.app-shell")).toHaveAttribute("data-ready", "true");
  const sizes = await page.locator("button.primary, .wallet-pill, .step").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(sizes.filter((size) => size.width > 0 && size.height > 0).every((size) => size.width >= 44 && size.height >= 44)).toBe(true);
});
