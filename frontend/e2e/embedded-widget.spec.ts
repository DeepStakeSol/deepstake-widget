import { expect, test, type Page } from "@playwright/test";

const localHostPattern = new RegExp("^https?://(127\\.0\\.0\\.1|localhost):3100/");
const validatorPattern = new RegExp("^https://api\\.stakewiz\\.com/validator/");
const allowedImagePattern = new RegExp("^https://.*\\.(png|jpg|jpeg|svg|webp)(\\?.*)?$", "i");

async function installNetworkMocks(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const parsed = new URL(url);

    if (localHostPattern.test(url)) {
      if (parsed.pathname === "/api/stake/get-epoch-info") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ epochInfo: { epoch: 42, slotIndex: 25, slotsInEpoch: 100 } }),
        });
        return;
      }

      if (parsed.pathname === "/api/stake/get-perf-samples") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sample: { numSlots: 10, samplePeriodSecs: 5 } }),
        });
        return;
      }

      if (parsed.pathname === "/api/trillium/rewards") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              vote_account_pubkey: "Vote111111111111111111111111111111111111111",
              identity_pubkey: "Identity111111111111111111111111111111111111",
              icon_url: "/images/sol_logo.png",
            },
          ]),
        });
        return;
      }

      await route.continue();
      return;
    }

    if (validatorPattern.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "E2E Validator",
          total_apy: 7.2,
          commission: 5,
          is_jito: false,
          vote_identity: "Vote111111111111111111111111111111111111111",
        }),
      });
      return;
    }

    if (allowedImagePattern.test(url)) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (request.resourceType() === "image") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    throw new Error("Unexpected external request: " + url);
  });
}

async function gotoHost(page: Page, path: string) {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const isStyleJsxWarning =
      text.includes("non-boolean attribute") && (text.includes("jsx") || text.includes("global"));
    if (message.type() === "error" && !isStyleJsxWarning) consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) consoleErrors.push(response.status() + " " + response.url());
  });

  await installNetworkMocks(page);
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator('[data-widget="deepstake"]')).toBeVisible();
  await expect(page.locator('[data-widget="deepstake"] .sw-container')).toBeVisible();

  return consoleErrors;
}

test("embedded widget loads from backend static route", async ({ page }) => {
  const scriptResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/w/widget.iife.js") && response.ok()
  );

  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html");
  await scriptResponse;

  await expect(page.getByRole("tab", { name: /Native/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /BlazeStake/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Vault/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Native/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("Not Connected").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("tab switching works in embedded widget", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html");

  await page.getByRole("tab", { name: /BlazeStake/ }).click();
  await expect(page.getByRole("tab", { name: /BlazeStake/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("Not Connected").first()).toBeVisible();

  await page.getByRole("tab", { name: /Vault/ }).click();
  await expect(page.getByRole("tab", { name: /Vault/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("The Vault only works in the mainnet cluster")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("widget options filter tabs", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-filtered.html");

  await expect(page.getByRole("tab", { name: /Native/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /BlazeStake/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /BlazeStake/ })).toHaveAttribute("data-state", "active");

  await page.getByRole("tab", { name: /Vault/ }).click();
  await expect(page.getByText("The Vault only works in the mainnet cluster")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("dark theme host option applies", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-dark.html");

  await expect(page.locator('[data-widget="deepstake"]')).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("tab", { name: /Native/ })).toBeVisible();
  await page.getByRole("tab", { name: /BlazeStake/ }).click();
  await expect(page.getByRole("tab", { name: /BlazeStake/ })).toHaveAttribute("data-state", "active");
  expect(consoleErrors).toEqual([]);
});
