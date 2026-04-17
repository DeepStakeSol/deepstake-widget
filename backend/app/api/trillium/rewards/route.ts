import { type NextRequest, NextResponse } from "next/server";

const TRILLIUM_API_URL = "https://api.trillium.so/validator_rewards";

interface TrilliumRewardItem {
  identity_pubkey: string;
  icon_url: string;
  vote_account_pubkey?: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const validatorIdentity = searchParams.get("validatorIdentity");

    if (!validatorIdentity) {
      return NextResponse.json(
        { error: "validatorIdentity parameter is required" },
        { status: 400 }
      );
    }

    const url = `${TRILLIUM_API_URL}/${validatorIdentity}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(
        `Trillium API error! status: ${response.status}, identity: ${validatorIdentity}`
      );
      // Return empty array for non-existent validators instead of error
      if (response.status === 404) {
        return NextResponse.json([]);
      }
      return NextResponse.json(
        { error: `Trillium API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data: TrilliumRewardItem[] = await response.json();

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Unexpected response format from Trillium API" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Trillium rewards fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Trillium rewards data" },
      { status: 500 }
    );
  }
}
