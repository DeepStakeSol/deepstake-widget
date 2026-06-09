import { act, renderHook, waitFor } from "@testing-library/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  confirmTransactionMock,
  createRpcConnectionMock,
  fetchStakeAccountsMock,
  generateKeyPairSignerMock,
  generateStakeTransactionMock,
  getBase64EncodedWireTransactionMock,
  invalidateStakeAccountsCacheMock,
  modifyAndSignTransactionsMock,
  partiallySignTransactionMock,
  sendMock,
  useWalletAccountTransactionSignerMock,
} = vi.hoisted(() => {
  const sendMock = vi.fn();
  const modifyAndSignTransactionsMock = vi.fn();

  return {
    confirmTransactionMock: vi.fn(),
    createRpcConnectionMock: vi.fn(() => ({
      sendTransaction: vi.fn(() => ({ send: sendMock })),
    })),
    fetchStakeAccountsMock: vi.fn(),
    generateKeyPairSignerMock: vi.fn(),
    generateStakeTransactionMock: vi.fn(),
    getBase64EncodedWireTransactionMock: vi.fn(),
    invalidateStakeAccountsCacheMock: vi.fn(),
    modifyAndSignTransactionsMock,
    partiallySignTransactionMock: vi.fn(),
    sendMock,
    useWalletAccountTransactionSignerMock: vi.fn(() => ({
      modifyAndSignTransactions: modifyAndSignTransactionsMock,
    })),
  };
});

vi.mock("@solana/react", () => ({
  useWalletAccountTransactionSigner: useWalletAccountTransactionSignerMock,
}));

vi.mock("@solana/kit", () => ({
  address: vi.fn((value: string) => value),
  generateKeyPairSigner: generateKeyPairSignerMock,
  getBase58Decoder: vi.fn(),
  getBase64Encoder: vi.fn(() => ({ encode: vi.fn((value: string) => "bytes:" + value) })),
  getBase64EncodedWireTransaction: getBase64EncodedWireTransactionMock,
  getTransactionDecoder: vi.fn(() => ({ decode: vi.fn((value: string) => "decoded:" + value) })),
  partiallySignTransaction: partiallySignTransactionMock,
}));

vi.mock("../utils/config", () => ({
  getCurrentChain: vi.fn(() => "solana:devnet"),
  getValidatorAddress: vi.fn(() => "vote-address"),
}));

vi.mock("../options", () => ({
  useOptions: vi.fn(() => ({ vote_account: "vote-address" })),
}));

vi.mock("../utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock,
}));

vi.mock("../utils/api", () => ({
  confirmTransaction: confirmTransactionMock,
  fetchStakeAccounts: fetchStakeAccountsMock,
  generateStakeTransaction: generateStakeTransactionMock,
}));

vi.mock("../utils/stakeAccountsCache", () => ({
  invalidateStakeAccountsCache: invalidateStakeAccountsCacheMock,
}));

import { useStakeTransaction } from "./useStakeTransaction";

const account = { address: "wallet-address" } as UiWalletAccount;
const refreshedAccounts = [{ address: "stake-account" }] as never[];

function renderStakeTransaction(overrides = {}) {
  return renderHook(() =>
    useStakeTransaction({
      network: "devnet",
      account,
      stakeAmount: "1.5",
      inSufficientBalance: false,
      onSuccess: vi.fn(),
      onDataLoaded: vi.fn(),
      ...overrides,
    })
  );
}

function clickEvent() {
  return { preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;
}

describe("useStakeTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateKeyPairSignerMock.mockResolvedValue({ address: "new-stake-account", keyPair: "keypair" });
    generateStakeTransactionMock.mockResolvedValue("server-wire-tx");
    modifyAndSignTransactionsMock.mockResolvedValue(["wallet-signed-tx"]);
    partiallySignTransactionMock.mockResolvedValue("fully-signed-tx");
    getBase64EncodedWireTransactionMock.mockReturnValue("wire-tx");
    sendMock.mockResolvedValue("signature");
    confirmTransactionMock.mockResolvedValue(undefined);
    fetchStakeAccountsMock.mockResolvedValue(refreshedAccounts);
    useWalletAccountTransactionSignerMock.mockReturnValue({
      modifyAndSignTransactions: modifyAndSignTransactionsMock,
    });
  });

  it("returns button labels and disabled states", () => {
    const emptyAmount = renderStakeTransaction({ stakeAmount: "" });
    expect(emptyAmount.result.current.buttonLabel).toBe("Enter stake amount");
    expect(emptyAmount.result.current.disableStakeButton).toBe(true);

    expect(renderStakeTransaction({ inSufficientBalance: true }).result.current.buttonLabel).toBe(
      "Insufficient Balance"
    );
    expect(renderStakeTransaction().result.current.buttonLabel).toBe("Stake");
  });

  it("does nothing when amount or signer is missing", async () => {
    const noAmount = renderStakeTransaction({ stakeAmount: "" });
    await act(async () => noAmount.result.current.handleSubmit(clickEvent()));

    useWalletAccountTransactionSignerMock.mockReturnValue(
      undefined as unknown as { modifyAndSignTransactions: typeof modifyAndSignTransactionsMock }
    );
    const noSigner = renderStakeTransaction();
    await act(async () => noSigner.result.current.handleSubmit(clickEvent()));

    expect(generateStakeTransactionMock).not.toHaveBeenCalled();
  });

  it("runs the successful stake transaction flow", async () => {
    const onDataLoaded = vi.fn();
    const { result } = renderStakeTransaction({ onDataLoaded });

    await act(async () => result.current.handleSubmit(clickEvent()));

    expect(generateStakeTransactionMock).toHaveBeenCalledWith("devnet", {
      newAccountAddress: "new-stake-account",
      stakeLamports: 1_500_000_000,
      stakerAddress: "wallet-address",
      voteAccount: "vote-address",
    });
    expect(modifyAndSignTransactionsMock).toHaveBeenCalledWith(["decoded:bytes:server-wire-tx"]);
    expect(partiallySignTransactionMock).toHaveBeenCalledWith(["keypair"], "wallet-signed-tx");
    expect(createRpcConnectionMock).toHaveBeenCalledWith("devnet");
    expect(sendMock).toHaveBeenCalled();
    expect(confirmTransactionMock).toHaveBeenCalledWith("devnet", {
      txid: "signature",
      targetCommitment: "processed",
      timeout: 30000,
      interval: 1000,
    });
    expect(result.current.lastSignature).toBe("signature");
    expect(result.current.lastStakeAccount).toBe("new-stake-account");
    expect(invalidateStakeAccountsCacheMock).toHaveBeenCalledWith("wallet-address", "devnet");
    await waitFor(() => expect(onDataLoaded).toHaveBeenCalledWith(refreshedAccounts));
  });

  it("stores errors and still refreshes stake accounts", async () => {
    const onDataLoaded = vi.fn();
    const error = new Error("sign failed");
    generateStakeTransactionMock.mockRejectedValue(error);
    const { result } = renderStakeTransaction({ onDataLoaded });

    await act(async () => result.current.handleSubmit(clickEvent()));

    expect(result.current.error).toBe(error);
    expect(result.current.lastStakeAccount).toBeUndefined();
    expect(invalidateStakeAccountsCacheMock).toHaveBeenCalledWith("wallet-address", "devnet");
    await waitFor(() => expect(onDataLoaded).toHaveBeenCalledWith(refreshedAccounts));
  });

  it("closes the success modal state", async () => {
    const onSuccess = vi.fn();
    const { result } = renderStakeTransaction({ onSuccess });

    await act(async () => result.current.handleSubmit(clickEvent()));
    act(() => result.current.handleCloseModal());

    expect(result.current.lastSignature).toBeUndefined();
    expect(result.current.lastStakeAccount).toBeUndefined();
    expect(onSuccess).toHaveBeenCalled();
  });
});
