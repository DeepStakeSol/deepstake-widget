import { NextResponse } from "next/server";

import { getHealthReport } from "@/utils/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health
// 503 only when mainnet transactions cannot work (RPC unset or unreachable).
// A Redis failure reports "degraded" with 200.
export async function GET() {
  const report = await getHealthReport();
  const rpcDown =
    !report.checks.rpc_mainnet.ok || !report.checks.config.rpc_mainnet;
  return NextResponse.json(report, {
    status: rpcDown ? 503 : 200,
    headers: { "Cache-Control": "no-store" }
  });
}
