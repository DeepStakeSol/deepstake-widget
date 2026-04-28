export const STAKE_POOL_ADDRESS =
  "Fu9BYC6tWBo1KMKaP3CFoKfRhqv9akmy3DuYwnCyWiyC";

// devnet
// export const STAKE_POOL_ADDRESS =
//   "DPoo15wWDqpPJJtS2MUZ49aRxqz5ZaaJCJP4z8bLuib";

export const VSOL_MINT = "vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export const BSOL_MINT = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";

const BLAZESTAKE_POOL_MAINNET = "stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi";
const BLAZESTAKE_POOL_DEVNET = "azFVdHtAJN8BX3sbGAYkXvtdjdrT5U6rj9rovvUFos9";

export function getBlazeStakePoolAddress(network: string | null): string {
  return network === "mainnet" ? BLAZESTAKE_POOL_MAINNET : BLAZESTAKE_POOL_DEVNET;
}

export function getBlazeUpdatePoolUrl(network: string | null): string {
  return network === "mainnet"
    ? "https://stake.solblaze.org/api/v1/update_pool?network=mainnet"
    : "https://stake.solblaze.org/api/v1/update_pool?network=devnet";
}
