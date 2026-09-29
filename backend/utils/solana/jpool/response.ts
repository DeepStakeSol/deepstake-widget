import { NextResponse } from "next/server";

import {
  JPOOL_ERROR_MESSAGES,
  JpoolRouteError,
  type JpoolErrorCode
} from "./errors";

export function jpoolErrorResponse(
  error: unknown,
  logLabel: string,
  fallbackCode: JpoolErrorCode = "JPOOL_GENERATE_FAILED"
) {
  if (error instanceof JpoolRouteError) {
    // TEMP(JPOOL-TMP-04): unmapped simulation failures keep their raw details
    // so real JPool error shapes can be collected and mapped later.
    const unmapped = error.code === "JPOOL_SIMULATION_FAILED";
    if (error.status >= 500 || unmapped) {
      console.error(logLabel, error.code, JSON.stringify(error.details ?? null));
    }
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(unmapped && error.details !== undefined
          ? { details: error.details }
          : {})
      },
      { status: error.status }
    );
  }
  console.error(logLabel, error);
  return NextResponse.json(
    { error: JPOOL_ERROR_MESSAGES[fallbackCode], code: fallbackCode },
    { status: 500 }
  );
}
