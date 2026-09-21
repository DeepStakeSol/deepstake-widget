import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(frontendDir, "dist");
const voteAccount = "Vote111111111111111111111111111111111111111";

function html(options: Record<string, unknown>, hostCss = "") {
  const escapedOptions = JSON.stringify({ telemetry: false, ...options })
    .replace(/'/g, "&apos;");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DeepStake E2E Host</title>
    ${hostCss ? `<style id="conflicting-css">${hostCss}</style>` : ""}
  </head>
  <body>
    <main>
      <h1>Host page</h1>
      <div id="root" data-widget="deepstake" data-options='${escapedOptions}'></div>
    </main>
    <script src="/api/w/widget.iife.js"></script>
  </body>
</html>`;
}

function centeredHtml(options: Record<string, unknown>) {
  const escapedOptions = JSON.stringify({ telemetry: false, ...options })
    .replace(/'/g, "&apos;");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DeepStake centered E2E Host</title>
    <style>
      html, body { margin: 0; width: 100%; }
      main { display: flex; justify-content: center; width: 100%; }
    </style>
  </head>
  <body>
    <main>
      <div id="root" data-widget="deepstake" data-options='${escapedOptions}'></div>
    </main>
    <script src="/api/w/widget.iife.js"></script>
  </body>
</html>`;
}

function multiWidgetHtml() {
  const validOptions = JSON.stringify({
    vote_account: voteAccount,
    network: "devnet",
    tabs: ["native"],
    telemetry: false,
  }).replace(/"/g, "&quot;");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>DeepStake multi-widget E2E Host</title></head>
  <body>
    <main>
      <div id="broken" data-widget="deepstake" data-options="{&quot;vote_account&quot;:&quot;${voteAccount}&quot;,}"></div>
      <div id="following" data-widget="deepstake" data-options="${validOptions}"></div>
      <div id="root" data-options="${validOptions}"></div>
    </main>
    <script src="/api/w/widget.iife.js"></script>
  </body>
</html>`;
}

export default async function globalSetup() {
  execFileSync("npm", ["run", "build"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_BACKEND_URL: "",
      DISABLE_BACKEND_PREFIX: "false",
      IMAGE_URL_PREFIX: "",
      VITE_NEXT_PUBLIC_NETWORK_ENV: "",
      VITE_TELEMETRY_ENDPOINT: "https://deepstake.info/api/telemetry",
      VITE_USE_LEGACY_VALIDATOR_PROFILE: "false",
    },
  });

  fs.writeFileSync(
    path.join(distDir, "e2e-host-all.html"),
    html({ vote_account: voteAccount, theme: "light", network: "devnet", tabs: ["native", "blaze", "vault"] })
  );
  fs.writeFileSync(
    path.join(distDir, "e2e-host-filtered.html"),
    html({ vote_account: voteAccount, theme: "light", network: "devnet", tabs: ["blaze", "vault"] })
  );
  fs.writeFileSync(
    path.join(distDir, "e2e-host-dark.html"),
    html({ vote_account: voteAccount, theme: "dark", network: "devnet", tabs: ["native", "blaze", "vault"] })
  );
  fs.writeFileSync(
    path.join(distDir, "e2e-host-default-theme.html"),
    html({ vote_account: voteAccount, network: "devnet", tabs: ["native"] })
  );
  fs.writeFileSync(
    path.join(distDir, "e2e-host-vault-only.html"),
    html({ vote_account: voteAccount, network: "devnet", tabs: ["vault"] })
  );
  fs.writeFileSync(
    path.join(distDir, "e2e-host-telemetry.html"),
    html({
      vote_account: voteAccount,
      theme: "light",
      network: "devnet",
      tabs: ["native", "blaze", "vault"],
      telemetry: true,
    })
  );

  fs.writeFileSync(
    path.join(distDir, "e2e-host-mainnet-centered.html"),
    centeredHtml({
      vote_account: voteAccount,
      theme: "light",
      network: "mainnet",
      tabs: ["blaze", "vault"],
    })
  );

  fs.writeFileSync(
    path.join(distDir, "e2e-host-overrides.html"),
    html({
      vote_account: voteAccount,
      theme: "light",
      network: "devnet",
      tabs: ["native"],
      validator_name: "Host Validator",
      validator_description: "Identity supplied by the host page.",
      validator_logo_url: "/images/sol_logo.png",
    })
  );
  fs.writeFileSync(
    path.join(distDir, "e2e-host-conflicting-css.html"),
    html(
      {
        vote_account: voteAccount,
        theme: "light",
        network: "devnet",
        tabs: ["native", "blaze"],
      },
      `
        section { background: #ffffff; padding: 24px; border: 1px solid #dddddd; border-radius: 8px; }
        button { font-family: "Comic Sans MS", cursive; }
        h1, h2, h3 { color: hotpink; }
        input { border: 2px dashed red; }
      `,
    )
  );

  fs.writeFileSync(
    path.join(distDir, "e2e-host-default-network.html"),
    html({ vote_account: voteAccount, theme: "light", tabs: ["native"], telemetry: true })
  );

  fs.writeFileSync(
    path.join(distDir, "e2e-host-conflicting-css-dark.html"),
    html(
      { vote_account: voteAccount, theme: "dark", network: "devnet", tabs: ["native"] },
      `input { border: 2px dashed red; appearance: none; width: 120px; height: 80px; }`,
    )
  );

  fs.writeFileSync(
    path.join(distDir, "e2e-host-multiple.html"),
    multiWidgetHtml()
  );
}
