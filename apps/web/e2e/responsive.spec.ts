import { expect, test } from "@playwright/test";

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

async function waitForLauncher(page: import("@playwright/test").Page) {
  await expect(page.locator("main.app-shell")).toHaveAttribute("data-ready", "true");
}

for (const viewport of viewports) {
  test(`launcher fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await waitForLauncher(page);
    await expect(page.getByRole("link", { name: "B20 Launcher home" })).toBeVisible();
    await expect(page.getByRole("region", { name: "What B20 Launcher is for" })).toBeVisible();
    await expect(page.getByText("Launch a B20 asset or stablecoin on Base.", { exact: true })).toBeVisible();
    await expect(page.getByText("New issuance", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start a new launch and clear the current draft" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Identity", exact: true })).toBeVisible();
    await expect(page.getByText("© 2026 Md. Rakib · made with love and passion.", { exact: true })).toBeVisible();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    if (viewport.width < 1280) {
      const preview = page.getByRole("button", { name: "Preview" });
      await expect(preview).toBeVisible();
      await preview.click();
      await expect(page.getByRole("dialog", { name: "Token preview" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Token preview" })).not.toBeVisible();
      await expect(preview).toBeFocused();
    }
  });
}

test("all launch steps and stablecoin controls remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForLauncher(page);
  await page.getByRole("button", { name: "Stablecoin" }).click();
  await expect(page.getByText("B20 Stablecoin", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Economics/ }).click();
  await expect(page.getByRole("heading", { name: "Economics", exact: true })).toBeVisible();
  await expect(page.getByText("ISO currency code", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Control/ }).click();
  await expect(page.getByRole("heading", { name: "Control", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Review/ }).click();
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
});

test("logo above one megabyte is rejected before upload", async ({ page }) => {
  await page.goto("/");
  await waitForLauncher(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "too-large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(1_000_001)
  });
  await expect(page.getByText("Logo must be 1 MB or smaller.")).toBeVisible();
});

test("new issuances mint 50 percent by default until manually overridden", async ({ page }) => {
  await page.goto("/");
  await waitForLauncher(page);
  await page.getByRole("button", { name: /Economics/ }).click();
  const maximumSupply = page.getByRole("textbox", { name: /^Maximum supply/ });
  const initialMint = page.getByRole("textbox", { name: /^Initial mint/ });

  await expect(maximumSupply).toHaveValue("1000000000");
  await expect(initialMint).toHaveValue("500000000");
  await maximumSupply.fill("2000000000");
  await expect(initialMint).toHaveValue("1000000000");
  await initialMint.fill("125000000");
  await maximumSupply.fill("3000000000");
  await expect(initialMint).toHaveValue("125000000");
});

test("legacy drafts migrate without losing issuer input", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("b20-forge-launch-draft-v1", JSON.stringify({ name: "Migrated Treasury", symbol: "MTY", stageToken: "should-not-persist", attributedData: "0xdead" }));
  });
  await page.goto("/");
  await waitForLauncher(page);
  await expect(page.getByLabel("Token name")).toHaveValue("Migrated Treasury");
  await expect(page.getByLabel("Symbol")).toHaveValue("MTY");
  const keys = await page.evaluate(() => ({
    current: localStorage.getItem("b20-launcher-launch-draft-v5"),
    legacy: localStorage.getItem("b20-forge-launch-draft-v1")
  }));
  expect(keys.current).toContain("Migrated Treasury");
  expect(keys.current).not.toMatch(/should-not-persist|dead/);
  expect(keys.legacy).toBeNull();
});

test("previous untouched defaults migrate to the new one billion supply", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "b20-launcher-launch-draft-v4",
      JSON.stringify({ supplyCap: "1000000", mintAmount: "500000", name: "Existing Draft" })
    );
  });
  await page.goto("/");
  await waitForLauncher(page);
  await page.getByRole("button", { name: /Economics/ }).click();
  await expect(page.getByRole("textbox", { name: /^Maximum supply/ })).toHaveValue("1000000000");
  await expect(page.getByRole("textbox", { name: /^Initial mint/ })).toHaveValue("500000000");
});

test("a manually edited legacy allocation is preserved", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "b20-launcher-launch-draft-v4",
      JSON.stringify({ supplyCap: "1000000", mintAmount: "125000", name: "Custom Allocation" })
    );
  });
  await page.goto("/");
  await waitForLauncher(page);
  await page.getByRole("button", { name: /Economics/ }).click();
  await expect(page.getByRole("textbox", { name: /^Maximum supply/ })).toHaveValue("1000000");
  await expect(page.getByRole("textbox", { name: /^Initial mint/ })).toHaveValue("125000");
});

test("starter identity examples are placeholders rather than saved values", async ({ page }) => {
  await page.goto("/");
  await waitForLauncher(page);
  await expect(page.getByLabel("Token name")).toHaveValue("");
  await expect(page.getByLabel("Token name")).toHaveAttribute("placeholder", "e.g. Northstar Credit");
  await expect(page.getByLabel("Symbol")).toHaveValue("");
  await expect(page.getByLabel("Project website")).toHaveValue("");
});

test("wallet chooser is accessible and restores focus on desktop and phone", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await waitForLauncher(page);

    const trigger = page.getByRole("button", { name: "Connect Wallet" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Choose wallet" });
    await expect(dialog).toBeVisible();
    await expect(page.getByText("No browser wallet detected")).toBeVisible();

    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyLocked: document.body.classList.contains("wallet-dialog-open")
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.bodyLocked).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});

test("an EIP-6963 wallet can connect and disconnect from the header control", async ({ page }) => {
  await page.addInitScript(() => {
    const accounts = ["0xdE709F2102306220921060314715629080e2fB77"];
    let authorized = false;
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const provider = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return authorized ? accounts : [];
        if (method === "eth_requestAccounts") {
          authorized = true;
          return accounts;
        }
        if (method === "wallet_revokePermissions") {
          authorized = false;
          return null;
        }
        if (method === "eth_chainId") return "0x2105";
        if (method === "wallet_switchEthereumChain") return null;
        return null;
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const current = listeners.get(event) ?? new Set();
        current.add(listener);
        listeners.set(event, current);
      },
      removeListener: (event: string, listener: (...args: unknown[]) => void) => listeners.get(event)?.delete(listener)
    };
    const detail = Object.freeze({
      info: {
        uuid: "350670db-19fa-4704-a166-e52e178b59d2",
        name: "Test Wallet",
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%237a1f2b'/></svg>",
        rdns: "com.b20launcher.testwallet"
      },
      provider
    });
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  });

  await page.goto("/");
  await waitForLauncher(page);
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  const walletOption = page.getByRole("button", { name: /Test Wallet Browser extension/ });
  await expect(walletOption).toBeVisible();
  await expect(walletOption.locator("img")).toBeVisible();
  await walletOption.click();

  await expect(page.getByText("0xde70...fb77", { exact: true })).toBeVisible();
  const disconnect = page.getByRole("button", { name: "Disconnect wallet" });
  await expect(disconnect).toBeVisible();
  await disconnect.click();
  await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
});

test("same-origin server routes expose health, manifest, validation, and x402 mode", async ({ request }) => {
  const health = await request.get("/health");
  expect(health.ok()).toBe(true);
  expect((await health.json()).chainId).toBe(8453);

  const manifest = await request.get("/api/agents/manifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).capabilities[1].path).toBe("/x402/b20/build");

  const missingLogo = await request.post("/api/metadata/prepare", {
    multipart: { name: "Route test", symbol: "ROUTE", variant: "asset" }
  });
  expect(missingLogo.status()).toBe(400);
  expect((await missingLogo.json()).error).toBe("A token logo is required.");

  const x402 = await request.post("/x402/b20/build", { data: {} });
  expect(x402.status()).toBe(400);
  expect(x402.headers()["x-b20-x402-mode"]).toBe("disabled-local-development");
});

test("security headers and nonce CSP are present", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
  expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
  expect(response.headers()["content-security-policy"]).toMatch(/script-src[^;]*nonce-/);
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("sensitive launch material never enters browser storage", async ({ page }) => {
  await page.goto("/");
  await waitForLauncher(page);
  const values = await page.evaluate(() => Object.entries(localStorage).map(([key, value]) => `${key}:${value}`));
  expect(values.join("\n")).not.toMatch(/stageToken|attributedData|unsigned|privateKey|secret/i);
});

test("reset confirmation is keyboard-safe", async ({ page }) => {
  await page.goto("/");
  await waitForLauncher(page);
  const trigger = page.getByRole("button", { name: "Start a new launch and clear the current draft" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Start a new launch?" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep draft" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("mobile action bar reserves content space and supports focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForLauncher(page);
  await page.getByRole("button", { name: /Economics/ }).click();
  const input = page.getByRole("textbox", { name: /^Maximum supply/ });
  await input.focus();
  await expect(input).toBeFocused();
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const focused = document.activeElement?.getBoundingClientRect();
    return { focusedBottom: focused?.bottom ?? 0, top: focused?.top ?? 0, scrollY: window.scrollY, height: window.innerHeight };
  });
  expect(metrics.focusedBottom).toBeLessThanOrEqual(metrics.height);
});
