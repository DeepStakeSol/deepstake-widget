import { type NextRequest, NextResponse } from "next/server";
import { ValidatorStakingError } from "@/utils/errors";

/**
 * Get the stake accounts for a wallet address and optionally filtered by vote account
 * @param request - The request object
 * @returns The stake accounts associated with the wallet address
 * Endpoint: /api/stake?owner=<address>&vote=<address>
 */

interface ValidatorApiResponse {
  vote_account?: string;
  name?: string | null;
  avatar_url?: string;
}

export async function GET(request: NextRequest) {
  try {
        const searchParams = request.nextUrl.searchParams;
        const identity = searchParams.get("validatorAddress")
        const network = searchParams.get("network");
    
        const token = process.env.VALIDATORS_APP_TOKEN;

        if (!token) {
          throw new Error(`Validators APP token must not be empty`);
        }

        const url = `https://www.validators.app/api/v1/validators/${network}/${identity}.json`;
        console.info("[actionCreateStep1] Fetching validator infos. Calling endpoint:", url);

        const headers = new Headers();
        headers.append("Token", token);

        const response = await fetch(url, {
          method: "GET",
          headers: headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const apiData = await response.json();

        if (apiData.length > 0) {
          return NextResponse.json({ apiData });
        }

        return NextResponse.json(
          { error: "Failed to fetch perfomance samples" },
          { status: 500 }
        );
  } catch (error) {
    console.error("perfomance samples fetch error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch perfomance samples" },
      { status: 500 }
    );
  }
}
