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
  console.log("[VaultStakebot] Reading latest marker", {
    epoch,
    url: `${GH_RAW}/${epoch}/epoch-stats-latest.txt`
  });

  const latestRes = await fetch(`${GH_RAW}/${epoch}/epoch-stats-latest.txt`, {
    headers: GH_HEADERS
  });

  console.log("[VaultStakebot] Latest marker response", {
    epoch,
    ok: latestRes.ok,
    status: latestRes.status
  });

  if (latestRes.ok) {
    const latestFileName = (await latestRes.text()).trim();
    console.log("[VaultStakebot] Latest marker content", {
      epoch,
      latestFileName
    });

    if (latestFileName.endsWith(".json")) {
      console.log("[VaultStakebot] Using marker-selected stats file", {
        epoch,
        fileName: latestFileName
      });

      return {
        name: latestFileName,
        download_url: `${GH_RAW}/${epoch}/${latestFileName}`
      };
    }

    console.log("[VaultStakebot] Latest marker did not point to JSON file", {
      epoch,
      latestFileName
    });
  }

  console.log("[VaultStakebot] Falling back to GitHub directory listing", {
    epoch,
    url: `${GH_API}/${epoch}`
  });

  const ghRes = await fetch(`${GH_API}/${epoch}`, { headers: GH_HEADERS });
  console.log("[VaultStakebot] Directory listing response", {
    epoch,
    ok: ghRes.ok,
    status: ghRes.status
  });

  if (!ghRes.ok) {
    console.log("[VaultStakebot] Directory listing unavailable", {
      epoch,
      status: ghRes.status
    });
    return null;
  }

  const files = (await ghRes.json()) as StakebotFile[];
  const jsonFiles = files
    .filter((file) => /^bot-stats-\d+\.json$/.test(file.name))
    .sort(
      (a, b) => getBotStatsSortValue(b.name) - getBotStatsSortValue(a.name)
    );

  console.log("[VaultStakebot] Directory listing parsed", {
    epoch,
    totalFiles: files.length,
    botStatsFiles: jsonFiles.map((file) => file.name),
    selectedFile: jsonFiles[0]?.name
  });

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
  console.log("[VaultStakebot] Flat schema lookup", {
    wallet,
    found: amount !== null,
    amountLamports: amount
  });
  return amount === null ? null : { amountLamports: amount };
}

function findStructuredStakebotAmount(
  wallet: string,
  data: Record<string, unknown>
): StakebotLookupResult | null {
  const directedStakeTargets = data.directedStakeTargets;
  if (!Array.isArray(directedStakeTargets)) {
    console.log("[VaultStakebot] Structured schema not present", {
      wallet,
      hasDirectedStakeTargets: false
    });
    return null;
  }

  let amountLamports = 0;
  let walletEntriesScanned = 0;
  let matchesFound = 0;
  for (const target of directedStakeTargets) {
    if (!isRecord(target) || !Array.isArray(target.wallets)) {
      continue;
    }

    for (const walletEntry of target.wallets) {
      if (!isRecord(walletEntry)) {
        continue;
      }

      walletEntriesScanned += 1;
      const walletAddress = walletEntry.address ?? walletEntry.adress;
      if (walletAddress !== wallet) {
        continue;
      }

      matchesFound += 1;
      const amount = amountFromUnknown(walletEntry.amount);
      if (amount !== null) {
        amountLamports += amount;
      }
    }
  }

  console.log("[VaultStakebot] Structured schema lookup", {
    wallet,
    targetsScanned: directedStakeTargets.length,
    walletEntriesScanned,
    matchesFound,
    amountLamports
  });

  return amountLamports > 0 ? { amountLamports } : null;
}

function findStakebotAmount(
  wallet: string,
  data: unknown
): StakebotLookupResult | null {
  if (!isRecord(data)) {
    console.log("[VaultStakebot] Stats payload is not an object", {
      wallet,
      payloadType: typeof data
    });
    return null;
  }

  console.log("[VaultStakebot] Detecting stats schema", {
    wallet,
    topLevelKeys: Object.keys(data).slice(0, 10),
    hasDirectedStakeTargets: Array.isArray(data.directedStakeTargets),
    hasFlatWalletKey: data[wallet] != null
  });

  return (
    findFlatStakebotAmount(wallet, data) ??
    findStructuredStakebotAmount(wallet, data)
  );
}

export async function getStakebotStake(wallet: string, connection: Connection) {
  console.log("[VaultStakebot] Lookup started", { wallet });

  const { epoch } = await connection.getEpochInfo();
  console.log("[VaultStakebot] Current epoch resolved", { wallet, epoch });

  const latestFile = await getLatestStakebotFile(epoch);
  if (!latestFile) {
    console.log("[VaultStakebot] No stakebot stats file found", {
      wallet,
      epoch
    });
    return { found: false, epoch };
  }

  console.log("[VaultStakebot] Fetching stats file", {
    wallet,
    epoch,
    sourceFile: latestFile.name,
    url: latestFile.download_url
  });

  const dataRes = await fetch(latestFile.download_url);
  console.log("[VaultStakebot] Stats file response", {
    wallet,
    epoch,
    sourceFile: latestFile.name,
    ok: dataRes.ok,
    status: dataRes.status
  });

  if (!dataRes.ok) {
    console.log("[VaultStakebot] Stats file unavailable", {
      wallet,
      epoch,
      sourceFile: latestFile.name,
      status: dataRes.status
    });
    return { found: false, epoch, sourceFile: latestFile.name };
  }

  const data = (await dataRes.json()) as unknown;
  const stakebotAmount = findStakebotAmount(wallet, data);
  if (!stakebotAmount) {
    console.log("[VaultStakebot] Wallet not found in stakebot stats", {
      wallet,
      epoch,
      sourceFile: latestFile.name
    });
    return { found: false, epoch, sourceFile: latestFile.name };
  }

  const generatedStake = (stakebotAmount.amountLamports / 1e9).toString();
  console.log("[VaultStakebot] Wallet found in stakebot stats", {
    wallet,
    epoch,
    sourceFile: latestFile.name,
    amountLamports: stakebotAmount.amountLamports,
    generatedStake
  });

  return {
    found: true,
    generatedStake,
    epoch,
    sourceFile: latestFile.name
  };
}
