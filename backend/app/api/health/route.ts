import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "deepstake-backend",
      timestamp: new Date().toISOString()
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
