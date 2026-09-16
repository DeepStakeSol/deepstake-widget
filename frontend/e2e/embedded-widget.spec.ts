import { expect, test, type Page } from "@playwright/test";

const localHostPattern = new RegExp("^https?://(127\\.0\\.0\\.1|localhost):3100/");
const allowedImagePattern = new RegExp("^https://.*\\.(png|jpg|jpeg|svg|webp)(\\?.*)?$", "i");
const e2eWalletAddress = "So11111111111111111111111111111111111111112";

type MockScenario = {
  epochStatus?: number;
  perfStatus?: number;
  validatorStatus?: number;
  balanceNetwork?: "mainnet" | "devnet";
};

type GotoOptions = {
  mock?: MockScenario;
  wallet?: boolean;
  allowedConsoleErrors?: RegExp[];
  allowedFailedResponses?: RegExp[];
};

function isAllowed(value: string, patterns: RegExp[] = []) {
  return patterns.some((pattern) => pattern.test(value));
}

async function fulfillJson(route: Parameters<Parameters<Page["route"]>[1]>[0], status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installNetworkMocks(page: Page, scenario: MockScenario = {}) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const parsed = new URL(url);

    if (localHostPattern.test(url)) {
      if (parsed.pathname === "/api/stake/get-epoch-info") {
        await fulfillJson(
          route,
          scenario.epochStatus ?? 200,
          scenario.epochStatus ? { error: "epoch unavailable" } : { epochInfo: { epoch: 42, slotIndex: 25, slotsInEpoch: 100 } }
        );
        return;
      }

      if (parsed.pathname === "/api/stake/get-perf-samples") {
        await fulfillJson(
          route,
          scenario.perfStatus ?? 200,
          scenario.perfStatus ? { error: "perf unavailable" } : { sample: { numSlots: 10, samplePeriodSecs: 5 } }
        );
        return;
      }

      if (parsed.pathname === "/api/balance") {
        await fulfillJson(route, 200, {
          solBalance:
            parsed.searchParams.get("network") === (scenario.balanceNetwork ?? "devnet") ? 4.25 : 0,
        });
        return;
      }

      if (parsed.pathname === "/api/stake/fetch") {
        await fulfillJson(route, 200, { stakeAccounts: [] });
        return;
      }
      if (parsed.pathname === "/api/stake/minimum") {
        await fulfillJson(route, 200, {
          network: parsed.searchParams.get("network"),
          minimumStakeLamports: 1_002_282_880,
          minimumStakeSol: 1.00228288,
          minimumDelegation: 1_000_000_000,
          rentExemptReserve: 2_282_880,
        });
        return;
      }

      if (parsed.pathname === "/api/vbalance") {
        await fulfillJson(route, 200, { lst: "255806200913" });
        return;
      }

      if (parsed.pathname === "/api/blaze/manage/applied-stakes") {
        await fulfillJson(route, 200, {
          appliedStakes: [
            {
              voteAcc: "Vote111111111111111111111111111111111111111",
              amount: 218.49,
            },
          ],
        });
        return;
      }

      if (parsed.pathname === "/api/blaze/manage/vault") {
        await fulfillJson(route, 200, {
          wallet: e2eWalletAddress,
          binding: {
            hasBinding: true,
            validatorVoteKey: "Vote111111111111111111111111111111111111111",
          },
          balance: { vsol: "80000000" },
          stakebot: {
            found: true,
            generatedStake: "255806200913.43082",
            epoch: 42,
          },
          uiStatus: "ready",
        });
        return;
      }

      if (parsed.pathname === "/api/validator/logo") {
        await fulfillJson(route, 200, {
          network: parsed.searchParams.get("network"),
          voteAccount: parsed.searchParams.get("voteAccount"),
          logoUrl: "/images/sol_logo.png",
          status: "fresh",
          field: {
            source: "trillium",
            observedAt: "2026-07-14T10:00:00.000Z",
            stale: false,
          },
        });
        return;
      }

      if (parsed.pathname === "/api/validator/profile") {
        const status = scenario.validatorStatus ?? 200;
        await fulfillJson(
          route,
          status,
          status >= 400
            ? { error: "validator profile unavailable" }
            : {
                network: parsed.searchParams.get("network"),
                voteAccount: parsed.searchParams.get("voteAccount"),
                name: "E2E Validator",
                description: "E2E validator description",
                logoUrl: null,
                estimatedApyPercent: 7.2,
                commissionPercent: 5,
                mevCommissionPercent: null,
                mevEnabled: false,
                status: "fresh",
                fields: Object.fromEntries(
                  [
                    "name",
                    "description",
                    "logoUrl",
                    "estimatedApyPercent",
                    "commissionPercent",
                    "mevCommissionPercent",
                    "mevEnabled",
                  ].map((field) => [
                    field,
                    {
                      source: "e2e",
                      observedAt: "2026-07-14T10:00:00.000Z",
                      stale: false,
                    },
                  ])
                ),
              }
        );
        return;
      }

      await route.continue();
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

async function installE2EWallet(page: Page) {
  await page.addInitScript((address) => {
    const standardConnect = "standard:connect";
    const standardDisconnect = "standard:disconnect";
    const standardEvents = "standard:events";
    const solanaSignTransaction = "solana:signTransaction";
    const account = Object.freeze({
      address,
      publicKey: new Uint8Array(32),
      chains: ["solana:devnet", "solana:mainnet"],
      features: ["solana:signTransaction"],
      label: "E2E Account",
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    });
    let accounts: readonly typeof account[] = [];
    const listeners = new Set<() => void>();
    const emitChange = () => listeners.forEach((listener) => listener());
    const wallet = {
      version: "1.0.0",
      name: "E2E Wallet",
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
      chains: ["solana:devnet", "solana:mainnet"],
      get accounts() {
        return accounts;
      },
      features: {
        [standardConnect]: {
          version: "1.0.0",
          connect: async () => {
            accounts = [account];
            emitChange();
            return { accounts };
          },
        },
        [standardDisconnect]: {
          version: "1.0.0",
          disconnect: async () => {
            accounts = [];
            emitChange();
          },
        },
        [standardEvents]: {
          version: "1.0.0",
          on: (event: string, listener: () => void) => {
            if (event !== "change") return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        [solanaSignTransaction]: {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: async (...inputs: { transaction: Uint8Array }[]) =>
            inputs.map((input) => ({ signedTransaction: input.transaction })),
        },
      },
    };
    const register = (api: { register: (wallet: typeof wallet) => void }) => api.register(wallet);
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
    window.addEventListener("wallet-standard:app-ready", ((event: CustomEvent) => register(event.detail)) as EventListener);
  }, e2eWalletAddress);
}

async function gotoHost(page: Page, path: string, options: GotoOptions = {}) {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const isStyleJsxWarning =
      text.includes("non-boolean attribute") && (text.includes("jsx") || text.includes("global"));
    if (message.type() === "error" && !isStyleJsxWarning && !isAllowed(text, options.allowedConsoleErrors)) {
      consoleErrors.push(text);
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    const failedResponse = response.status() + " " + response.url();
    if (response.status() >= 400 && !isAllowed(failedResponse, options.allowedFailedResponses)) {
      consoleErrors.push(failedResponse);
    }
  });

  if (options.wallet) await installE2EWallet(page);
  await installNetworkMocks(page, options.mock);
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator('[data-widget="deepstake"]').first()).toBeVisible();
  await expect(page.locator('[data-widget="deepstake"] .sw-container').first()).toBeVisible();

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

test("an invalid config does not prevent later widgets from mounting", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-multiple.html", {
    allowedConsoleErrors: [/^\[DeepStake widget\] invalid config/],
  });

  await expect(page.getByRole("alert")).toHaveText(
    "DeepStake widget: invalid configuration, check data-options",
  );
  await expect(page.getByRole("tab", { name: /Native/ })).toHaveCount(2);
  await expect(page.locator("#root")).toHaveAttribute("data-widget", "deepstake");
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

test("validator identity options override backend profile data", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-overrides.html");

  await expect(page.getByText("Host Validator")).toBeVisible();
  await expect(page.getByText("Identity supplied by the host page.")).toBeVisible();
  await expect(page.getByText("E2E Validator")).toHaveCount(0);
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

test("embedded widget fits a mobile host viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html");

  const widgetBox = await page.locator('[data-widget="deepstake"] .sw-container').boundingBox();
  expect(widgetBox?.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole("tab", { name: /Native/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("validator API failure still leaves disconnected staking form usable", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html", {
    mock: { validatorStatus: 500 },
    allowedConsoleErrors: [/Failed to fetch validator profile:/, /HTTP error 500/, /Failed to load resource: the server responded with a status of 500/],
    allowedFailedResponses: [new RegExp("500 http://127\\.0\\.0\\.1:3100/api/validator/profile")],
  });

  await expect(page.getByRole("tab", { name: /Native/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("Epoch 42")).toBeVisible();
  await expect(page.getByLabel("Stake Amount")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("epoch API failure still renders disconnected staking controls", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html", {
    mock: { epochStatus: 500 },
    allowedConsoleErrors: [new RegExp("Failed to fetch epoch/perf data:"), new RegExp("HTTP error 500 when fetching /api/stake/get-epoch-info"), /Failed to load resource: the server responded with a status of 500/],
    allowedFailedResponses: [new RegExp("500 http://127\\.0\\.0\\.1:3100/api/stake/get-epoch-info")],
  });

  await expect(page.getByRole("tab", { name: /Native/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByLabel("Stake Amount")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("stake amount input sanitizes disconnected user input", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html");
  const input = page.getByLabel("Stake Amount");

  await input.fill("abc.1.23456789 SOL");

  await expect(input).toHaveValue("0.123456");
  await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});


test("connects a mocked wallet and loads connected wallet data", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html", { wallet: true });

  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await expect(page.getByRole("dialog", { name: "Select a wallet to connect" })).toBeVisible();
  await page.getByRole("button", { name: "Connect with E2E Wallet" }).click();

  await expect(page.getByRole("dialog", { name: "Select a wallet to connect" })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  await expect(page.getByText("Not Connected")).toHaveCount(0);
  await expect(page.getByText("So11...1112")).toBeVisible();
  await expect(page.locator('[data-widget="deepstake"]')).toContainText("Balance: 4.25 SOL");
  await page.getByRole("tab", { name: "Manage" }).click();
  await expect(page.getByText("You don't have any stake accounts yet.")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("disconnects a mocked wallet back to disconnected empty state", async ({ page }) => {
  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-all.html", { wallet: true });

  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await page.getByRole("button", { name: "Connect with E2E Wallet" }).click();
  await expect(page.getByText("So11...1112")).toBeVisible();

  await page.locator(".disconnect-logo").click();

  await expect(page.getByText("Not Connected").first()).toBeVisible();
  await page.getByRole("tab", { name: "Manage" }).click();
  await expect(page.getByText("Wallet not connected")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("Blaze and Vault Manage keep the widget centered and width-stable", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });

  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-mainnet-centered.html", {
    wallet: true,
    mock: { balanceNetwork: "mainnet" },
  });

  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await page.getByRole("button", { name: "Connect with E2E Wallet" }).click();
  await expect(page.getByText("So11...1112")).toBeVisible();

  const widget = page.locator('[data-widget="deepstake"]');
  const measure = () =>
    widget.evaluate((root) => {
      const container = root.querySelector<HTMLElement>(".sw-container");
      if (!container) throw new Error("Widget container not found");

      const rootBox = root.getBoundingClientRect();
      const containerBox = container.getBoundingClientRect();
      return {
        root: {
          x: rootBox.x,
          width: rootBox.width,
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
        },
        container: {
          x: containerBox.x,
          width: containerBox.width,
          clientWidth: container.clientWidth,
          scrollWidth: container.scrollWidth,
        },
      };
    });

  const expectStableGeometry = (
    before: Awaited<ReturnType<typeof measure>>,
    after: Awaited<ReturnType<typeof measure>>,
  ) => {
    expect(before.root.width).toBeCloseTo(640, 0);
    expect(Math.abs(after.root.x - before.root.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.root.width - before.root.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.container.x - before.container.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.container.width - before.container.width)).toBeLessThanOrEqual(1);
    expect(after.root.scrollWidth).toBe(after.root.clientWidth);
    expect(after.container.scrollWidth).toBe(after.container.clientWidth);
  };

  for (const provider of [/BlazeStake/, /Vault/]) {
    const providerTab = page.getByRole("tab", { name: provider });
    await providerTab.click();
    await expect(providerTab).toHaveAttribute("data-state", "active");

    await page.locator('[role="tab"]:visible').filter({ hasText: "Your stake" }).click();
    const before = await measure();

    await page.locator('[role="tab"]:visible').filter({ hasText: "Manage" }).click();
    await expect(page.locator(".manage-wrap:visible")).toBeVisible();
    const after = await measure();
    expectStableGeometry(before, after);

    if (provider.source === "Vault") {
      const tooltipTrigger = page.locator(".q-mark-icon:visible");
      await expect(tooltipTrigger).toBeVisible();
      await tooltipTrigger.hover();
      expectStableGeometry(before, await measure());
    }
  }

  expect(consoleErrors).toEqual([]);
});

test("validator information remains left-aligned inside the centered widget", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });

  const consoleErrors = await gotoHost(page, "/api/w/e2e-host-mainnet-centered.html");
  const validatorCard = page.locator(".vi-validator-card");
  const validatorContent = page.locator(".vi-content");

  await expect(validatorCard).toBeVisible();
  await expect(validatorContent).toHaveCSS("text-align", "start");

  const cardBox = await validatorCard.boundingBox();
  const contentBox = await validatorContent.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(contentBox!.x).toBeGreaterThan(cardBox!.x);

  expect(consoleErrors).toEqual([]);
});
