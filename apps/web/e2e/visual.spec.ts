import { expect, test } from "@playwright/test";

const visualViewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

for (const viewport of visualViewports) {
  test(`visual baseline ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("main.app-shell")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`launcher-${viewport.width}x${viewport.height}.png`, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      scale: "css"
    });
  });
}
