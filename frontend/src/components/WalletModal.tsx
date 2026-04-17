"use client";

import { useState, useContext, useEffect } from "react";
import {
  useWallets,
  useConnect,
  UiWallet,
  UiWalletAccount
} from "@wallet-standard/react";
import { SelectedWalletAccountContext } from "../context/SelectedWalletAccountContext";
import { Button, Flex, Text, Card, Link } from "@radix-ui/themes";
import { StandardConnect, StandardDisconnect } from "@wallet-standard/core";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { useBalanceCheck } from "../context/BalanceCheckContext";
import { useStakingModal } from "../context/StakingModalContext";

/** Utility function to compare wallet accounts */
function uiWalletAccountsAreSame(
  account1: UiWalletAccount,
  account2: UiWalletAccount
): boolean {
  return account1.address === account2.address;
}

export function WalletModal() {
  const { isWalletShowing, hideWalletModal } = useStakingModal();
  const [, setSelectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const { setTriggerCheck } = useBalanceCheck();

  // Inject styles on mount and cleanup on unmount
  useEffect(() => {
    const cleanup = injectWalletConnectStyles();
    return cleanup;
  }, []);

  const handleAccountSelect = (account: UiWalletAccount | undefined) => {
    if (account) {
      setSelectedWalletAccount(account);
      hideWalletModal();

      // Trigger balance check on other networks
      setTriggerCheck(true);
    }
  };

  if (!isWalletShowing) {
    return null;
  }

  return (
    <>
      <div
        className="wallet-overlay"
        style={{
          position: "absolute",
          inset: "0px",
          zIndex: "50",
          backgroundColor: "#9f9facc4",
          backdropFilter: "blur(4px)",
          borderRadius: "20px",
        }}
        role="presentation"
        aria-hidden="true"
        onClick={hideWalletModal}
        onKeyDown={(e) => {
          if (e.key === "Escape") hideWalletModal();
        }}
      />
      <div
        className="wallet-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          zIndex: "51",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "rgb(253 251 251)",
          borderWidth: "0",
          borderRadius: "20px",
          padding: "0",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          width: "400px",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-dialog-title"
        aria-describedby="wallet-dialog-description"
      >
        {/* Close Button */}
        <button
          type="button"
          className="wallet-close-btn"
          onClick={() => hideWalletModal()}
          aria-label="Close wallet dialog"
          style={{
            position: "absolute",
            top: "15px",
            right: "15px",
            background: "transparent",
            border: "none",
            color: "#000",
            fontSize: "28px",
            fontWeight: 100,
            cursor: "pointer",
            lineHeight: 1,
            padding: "4px 8px",
            borderRadius: "4px",
            zIndex: 10,
          }}
        >
          ✕
        </button>

        {/* Content Container */}
        <div
          style={{
            marginTop: "60px",
            marginLeft: "30px",
            marginRight: "30px",
          }}
        >
          {/* Header */}
          <Flex
            id="wallet-dialog-title"
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              color: "#000"
            }}
          >
            Select a wallet to connect
          </Flex>

          {/* Wallet Options */}
          <Card
            style={{
              background: "transparent",
              padding: "0px",
              border: "none",
              boxShadow: "none",
              marginTop: "30px",
              marginBottom: "30px",
            }}
          >
            <ConnectWalletDialog onAccountSelect={handleAccountSelect} />
          </Card>

          {/* Footer */}
          <Flex direction="column" gap="3" style={{ marginBottom: "30px" }}>
            <Text id="wallet-dialog-description" size="2" style={{ color: "#000", fontSize: "12px" }}>
              New to Solana?{" "}
              <Link
                href="https://docs.solana.com/wallet-guide"
                target="_blank"
                style={{ color: "#000", cursor: "pointer", fontWeight: "bold" }}
              >
                Learn about wallets
                <ExternalLinkIcon
                  style={{
                    display: "inline",
                    marginLeft: "4px",
                    verticalAlign: "middle"
                  }}
                />
              </Link>
            </Text>
          </Flex>
        </div>
      </div>
    </>
  );
}

/** Dialog Displaying Wallet Options */
interface ConnectWalletDialogProps {
  onAccountSelect: (account: UiWalletAccount | undefined) => void;
}

function ConnectWalletDialog({ onAccountSelect }: ConnectWalletDialogProps) {
  const wallets = useWallets();

  const connectableWallets = wallets
    .filter(
      (wallet: UiWallet) =>
        wallet.features.includes(StandardConnect) &&
        wallet.features.includes(StandardDisconnect)
    )
    .reduce((unique: UiWallet[], wallet: UiWallet) => {
      const exists = unique.find((w) => w.name === wallet.name);
      if (!exists) {
        unique.push(wallet);
      }
      return unique;
    }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "12px",
      }}
    >
      {connectableWallets.length === 0 ? (
        <Text size="2" color="gray" align="center">
          No compatible wallets found
        </Text>
      ) : (
        connectableWallets.map((wallet: UiWallet) => (
          <WalletConnectItem
            key={wallet.name}
            wallet={wallet}
            onAccountSelect={onAccountSelect}
          />
        ))
      )}
    </div>
  );
}

/** Individual Wallet Connection Item */
interface WalletConnectItemProps {
  wallet: UiWallet;
  onAccountSelect: (account: UiWalletAccount | undefined) => void;
}

function WalletConnectItem({
  wallet,
  onAccountSelect
}: WalletConnectItemProps) {
  const [isConnecting, connect] = useConnect(wallet);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = async () => {
    try {
      const existingAccounts = [...wallet.accounts];
      const nextAccounts = await connect();
      const newAccount = nextAccounts.find(
        (nextAccount) =>
          !existingAccounts.some((existingAccount) =>
            uiWalletAccountsAreSame(nextAccount, existingAccount)
          )
      );
      const accountToSelect = newAccount || nextAccounts[0];
      if (accountToSelect) {
        onAccountSelect(accountToSelect);
      }
    } catch (error) {
      console.error("Connection error:", error);
    }
  };

  return (
    <Button
      size="3"
      onClick={handleClick}
      disabled={isConnecting}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="wallet-connect-item"
      aria-label={`Connect with ${wallet.name}`}
      style={{
        width: "165px",
        height: "60px",
        background: isConnecting
          ? "#2C2C2C"
          : isHovered
            ? "#DADADE"
            : "rgb(233 233 233)",
        color: isConnecting ? "#999999" : "white",
        cursor: isConnecting ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 16px",
        margin: "0",
        borderRadius: "12px",
        transition: "all 0.2s ease",
        border: "none",
        boxShadow: isHovered ? "0 2px 8px rgba(0,159,209,0.15)" : "none",
        fontWeight: "500"
      }}
    >
      <Image
        src={wallet.icon}
        alt={wallet.name}
        width={32}
        height={32}
        style={{
          borderRadius: "8px",
          padding: "0px",
          background: "transparent"
        }}
      />
      <Text
        size="3"
        style={{
          flex: 1,
          textAlign: "left",
          fontWeight: "600",
          fontSize: "14px",
          color: isConnecting ? "#999999" : "#454444"
        }}
      >
        {isConnecting ? "Connecting..." : wallet.name}
      </Text>
    </Button>
  );
}

// Add global styles for animations
const styles = `
  @keyframes contentShow {
    from {
      opacity: 0;
      transform: translate(-50%, -48%) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .wallet-connect-item:hover {
    transform: translateY(-1px);
  }

  #root[data-theme="dark"] .wallet-connect-item {
    background-color: #D9D9D9 !important;
  }

  #root[data-theme="dark"] .wallet-connect-item:hover {
    background-color: #9F9FAC !important;
  }

  #root[data-theme="dark"] .wallet-modal-content {
    background-color: #353844 !important;
  }

  #root[data-theme="dark"] .wallet-close-btn {
    color: #fff !important;
  }

  #root[data-theme="dark"] #wallet-dialog-title {
    color: #fff !important;
  }

  #root[data-theme="dark"] #wallet-dialog-description {
    color: #fff !important;
  }

  #root[data-theme="dark"] #wallet-dialog-description a {
    color: #fff !important;
    font-weight: bold !important;
  }

  #root[data-theme="dark"] .wallet-overlay {
    background-color: #0d1625db !important;
    backdrop-filter: blur(4px) !important;
  }
`;

// Add style tag to document with cleanup
let styleTag: HTMLStyleElement | null = null;

export function injectWalletConnectStyles(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.textContent = styles;
    document.head.appendChild(styleTag);
  }

  // Return cleanup function
  return () => {
    if (styleTag && styleTag.parentNode) {
      styleTag.parentNode.removeChild(styleTag);
      styleTag = null;
    }
  };
}
