"use client";
import { useEffect } from "react";
import { Button } from "@radix-ui/themes";
import { useStakingModal } from "../context/StakingModalContext";

/** Main Wallet Connection Component */
function WalletConnectButton() {
  const { showWalletModal } = useStakingModal();

  // Inject styles on mount and cleanup on unmount
  useEffect(() => {
    const cleanup = injectWalletConnectStyles();
    return cleanup;
  }, []);

  return (
    <Button
      size="3"
      className="hover:bg-blue-600 transition-colors"
      aria-label="Connect Wallet"
      onClick={showWalletModal}
      style={{
        width: "100%",
        borderRadius: "12px",
        border: "none",
        background: "#5A5A62",
        color: "#fff",
        cursor: "pointer",
        alignItems: "center",
        gap: "8px",
        zIndex: 100,

        fontSize: "16px",
        fontWeight: 600,
        marginBottom: "10px",
        height: "36px",
        textAlign: "center",
      }}
    >
      Connect Wallet
    </Button>
  );
}

export { WalletConnectButton };

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
