import { Connection } from "@solana/web3.js";

const GH_API = "https://api.github.com/repos/SolanaVault/stakebot-data/contents";
const GH_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "deepstake-widget",
};

export async function getStakebotStake(wallet: string, connection: Connection) {
  const { epoch } = await connection.getEpochInfo();

  const ghRes = await fetch(`${GH_API}/${epoch}`, { headers: GH_HEADERS });
  if (!ghRes.ok) return { found: false, epoch };

  const files: Array<{ name: string; download_url: string }> = await ghRes.json();
  const jsonFiles = files
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => b.name.localeCompare(a.name));

  if (!jsonFiles.length) return { found: false, epoch };
  const latestFile = jsonFiles[0];

  const dataRes = await fetch(latestFile.download_url);
  if (!dataRes.ok) return { found: false, epoch, sourceFile: latestFile.name };

  const data: Record<string, number> = await dataRes.json();
  const entry = data[wallet];
  if (entry == null) return { found: false, epoch, sourceFile: latestFile.name };

  return {
    found: true,
    generatedStake: (entry / 1e9).toString(),
    epoch,
    sourceFile: latestFile.name,
  };
}
