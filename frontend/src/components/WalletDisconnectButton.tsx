"use client";
import { useContext } from "react";
import { useWallets, useDisconnect, UiWallet } from "@wallet-standard/react";
import { SelectedWalletAccountContext } from "../context/SelectedWalletAccountContext";

function WalletDisconnectButton() {
  const [selectedWalletAccount, setSelectedWalletAccount] = useContext(
    SelectedWalletAccountContext
  );
  const wallets = useWallets();
  const wallet = wallets.find((w: UiWallet) =>
    w.accounts.some((a) => a.address === selectedWalletAccount?.address)
  );
  const [_isDisconnecting, disconnect] = useDisconnect(wallet || wallets[0]);

  if (!wallet || !selectedWalletAccount) return null;

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setSelectedWalletAccount(undefined);
    } catch (error) {
      console.error("Disconnection error:", error);
    }
  };

  return (
    <>
      <div className="disconnect-logo" onClick={handleDisconnect} ></div>

      <style>{`
        .disconnect-logo {
          cursor: pointer;
          width: 20px;
          height: 20px;
          background-image: url(/images/disconnect.png);
          background-size: contain;
        }

        #root[data-theme="dark"] .disconnect-logo {
          background-image: url(/images/disconnect_dk.png);
        }
      `}</style>
    </>
  );
}

export { WalletDisconnectButton };
