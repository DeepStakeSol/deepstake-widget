import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(frontendDir, "dist");
const voteAccount = "Vote111111111111111111111111111111111111111";

function html(options: Record<string, unknown>) {
  const escapedOptions = JSON.stringify(options).replace(/'/g, "&apos;");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DeepStake E2E Host</title>
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

export default async function globalSetup() {
  execFileSync("npm", ["run", "build"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_BACKEND_URL: "",
      DISABLE_BACKEND_PREFIX: "false",
      IMAGE_URL_PREFIX: "",
      VITE_NEXT_PUBLIC_NETWORK_ENV: "devnet",
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
}
