import type { Connection } from "@solana/web3.js";

const GH_API =
  "https://api.github.com/repos/SolanaVault/stakebot-data/contents";
const GH_RAW =
  "https://raw.githubusercontent.com/SolanaVault/stakebot-data/main";
const GH_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "deepstake-widget"
};

type StakebotFile = {
  name: string;
  download_url: string;
};

type StakebotLookupResult = {
  amountLamports: number;
};

function getBotStatsSortValue(fileName: string): number {
  const match = fileName.match(/^bot-stats-(\d+)\.json$/);
  return match ? Number(match[1]) : -1;
}

async function getLatestStakebotFile(
  epoch: number
): Promise<StakebotFile | null> {
  const latestRes = await fetch(`${GH_RAW}/${epoch}/epoch-stats-latest.txt`, {
    headers: GH_HEADERS
  });

  if (latestRes.ok) {
    const latestFileName = (await latestRes.text()).trim();
    if (latestFileName.endsWith(".json")) {
      return {
        name: latestFileName,
        download_url: `${GH_RAW}/${epoch}/${latestFileName}`
      };
    }
  }

  const ghRes = await fetch(`${GH_API}/${epoch}`, { headers: GH_HEADERS });
  if (!ghRes.ok) {
    return null;
  }

  const files = (await ghRes.json()) as StakebotFile[];
  const jsonFiles = files
    .filter((file) => /^bot-stats-\d+\.json$/.test(file.name))
    .sort(
      (a, b) => getBotStatsSortValue(b.name) - getBotStatsSortValue(a.name)
    );

  return jsonFiles[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function amountFromUnknown(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function findFlatStakebotAmount(
  wallet: string,
  data: Record<string, unknown>
): StakebotLookupResult | null {
  const amount = amountFromUnknown(data[wallet]);
  return amount === null ? null : { amountLamports: amount };
}

function findStructuredStakebotAmount(
  wallet: string,
  data: Record<string, unknown>
): StakebotLookupResult | null {
  const directedStakeTargets = data.directedStakeTargets;
  if (!Array.isArray(directedStakeTargets)) {
    return null;
  }

  let amountLamports = 0;
  for (const target of directedStakeTargets) {
    if (!isRecord(target) || !Array.isArray(target.wallets)) {
      continue;
    }

    for (const walletEntry of target.wallets) {
      if (!isRecord(walletEntry)) {
        continue;
      }

      const walletAddress = walletEntry.address ?? walletEntry.adress;
      if (walletAddress !== wallet) {
        continue;
      }

      const amount = amountFromUnknown(walletEntry.amount);
      if (amount !== null) {
        amountLamports += amount;
      }
    }
  }

  return amountLamports > 0 ? { amountLamports } : null;
}

function findStakebotAmount(
  wallet: string,
  data: unknown
): StakebotLookupResult | null {
  if (!isRecord(data)) {
    return null;
  }

  return (
    findFlatStakebotAmount(wallet, data) ??
    findStructuredStakebotAmount(wallet, data)
  );
}

export async function getStakebotStake(wallet: string, connection: Connection) {
  const { epoch } = await connection.getEpochInfo();

  const latestFile = await getLatestStakebotFile(epoch);
  if (!latestFile) {
    return { found: false, epoch };
  }

  const dataRes = await fetch(latestFile.download_url);
  if (!dataRes.ok) {
    return {
      found: false,
      epoch,
      sourceFile: latestFile.name,
      sourceUrl: latestFile.download_url
    };
  }

  const data = (await dataRes.json()) as unknown;
  const stakebotAmount = findStakebotAmount(wallet, data);
  if (!stakebotAmount) {
    return {
      found: false,
      epoch,
      sourceFile: latestFile.name,
      sourceUrl: latestFile.download_url
    };
  }

  const generatedStake = (stakebotAmount.amountLamports / 1e9).toString();

  return {
    found: true,
    generatedStake,
    epoch,
    sourceFile: latestFile.name,
    sourceUrl: latestFile.download_url
  };
}
