import { NextResponse } from "next/server";

import { getRedisClient } from "@/utils/redis";
import {
  parseTelemetryRequest,
  recordWidgetMount,
  TelemetryRequestError,
  type TelemetryRedisClient
} from "@/utils/telemetry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const event = await parseTelemetryRequest(request);
    const client = (await getRedisClient()) as TelemetryRedisClient;
    await recordWidgetMount(client, event);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof TelemetryRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Telemetry storage unavailable" },
      { status: 503 }
    );
  }
}
