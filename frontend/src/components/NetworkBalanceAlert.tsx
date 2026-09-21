"use client";

import { useCallback, useEffect, useContext, useState } from "react";
import { Flex, Button } from "@radix-ui/themes";
import { checkOtherNetworkBalances, NetworkBalanceInfo } from "../utils/solana/balance";
import { useNetwork } from "../context/NetworkContext";
import { SelectedWalletAccountContext } from "../context/SelectedWalletAccountContext";
import { useBalanceCheck } from "../context/BalanceCheckContext";
import { hideOtherNetworkAlert, isOtherNetworkAlertHidden } from "../utils/networkAlertPreference";

export function NetworkBalanceAlert() {
  const { network } = useNetwork();
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const { triggerCheck, setTriggerCheck } = useBalanceCheck();
  const [showAlert, setShowAlert] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [networkBalanceInfo, setNetworkBalanceInfo] = useState<NetworkBalanceInfo | null>(null);

  const dismissAlert = useCallback(() => {
    if (dontShowAgain) hideOtherNetworkAlert();
    setShowAlert(false);
  }, [dontShowAgain]);

  useEffect(() => {
    if (!showAlert) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissAlert();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAlert, dismissAlert]);

  useEffect(() => {
    let isCancelled = false;

    const checkBalance = async () => {
      if (!selectedWalletAccount || !triggerCheck) return;
      if (isOtherNetworkAlertHidden()) {
        setTriggerCheck(false);
        return;
      }

      try {
        const otherBalance = await checkOtherNetworkBalances(
          selectedWalletAccount.address,
          network
        );

        if (!isCancelled && otherBalance) {
          setNetworkBalanceInfo(otherBalance);
          setShowAlert(true);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("[NetworkBalanceAlert] Balance check failed:", error);
        }
      } finally {
        if (!isCancelled) {
          setTriggerCheck(false);
        }
      }
    };

    if (triggerCheck && selectedWalletAccount) {
      checkBalance();
    }

    return () => {
      isCancelled = true;
    };
  }, [triggerCheck, selectedWalletAccount, network, setTriggerCheck]);

  if (!networkBalanceInfo) {
    return null;
  }

  return (
    <>
      <style>{`
        [data-widget="deepstake"] .alert-overlay {
          position: absolute;
          inset: 0;
          z-index: 100;
          background-color: #9f9facc4;
          backdrop-filter: blur(4px);
          border-radius: 20px;
        }
        [data-widget="deepstake"] .alert-modal {
          position: absolute;
          z-index: 101;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 400px;
          min-height: 320px;
          padding-bottom: 20px;
          background-color: #fff;
          border: 0;
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          color: #000;
        }
        [data-widget="deepstake"] .alert-close-btn {
          position: absolute;
          top: 15px;
          right: 15px;
          background: transparent;
          border: none;
          color: #000;
          font-size: 28px;
          font-weight: 100;
          cursor: pointer;
          line-height: 1;
          padding: 4px 8px;
          border-radius: 4px;
        }
        [data-widget="deepstake"] .alert-preference {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 18px;
          color: inherit;
          font-size: 13px;
          cursor: pointer;
        }
        [data-widget="deepstake"] .alert-preference input[type="checkbox"] {
          appearance: auto !important;
          display: inline-block !important;
          width: 16px !important;
          height: 16px !important;
          min-width: 16px !important;
          margin: 0 !important;
          padding: 0 !important;
          opacity: 1 !important;
          border: 1px solid #646772 !important;
          border-radius: 3px !important;
          accent-color: #5a5a62;
          cursor: pointer;
        }
        [data-widget="deepstake"][data-theme="dark"] .alert-overlay {
          background-color: #0d1625db;
          backdrop-filter: blur(4px);
        }
        [data-widget="deepstake"][data-theme="dark"] .alert-modal {
          background-color: #353844 !important;
          color: #fff !important;
        }
        [data-widget="deepstake"][data-theme="dark"] .alert-close-btn {
          color: #fff !important;
        }
        [data-widget="deepstake"][data-theme="dark"] .alert-title {
          color: #fff !important;
        }
        [data-widget="deepstake"][data-theme="dark"] .alert-description {
          color: #fff !important;
        }
        [data-widget="deepstake"][data-theme="dark"] .button-close2 {
          background: #D9D9D9 !important;
          color: #000 !important;
        }
      `}</style>

      {showAlert && (
        <>
          <div
            className="alert-overlay"
            onClick={dismissAlert}
            role="presentation"
            aria-hidden="true"
          />
          <div
            className="alert-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="balance-alert-title"
            aria-describedby="balance-alert-description"
          >
            <button
              type="button"
              aria-label="Close"
              className="alert-close-btn"
              onClick={dismissAlert}
            >
              ✕
            </button>

            <Flex direction="column" align="center" style={{ position: "relative", height: "100%" }}>
              <div style={{ width: "300px", margin: "70px auto 0" }}>
                <Flex
                  id="balance-alert-title"
                  className="alert-title"
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                    textAlign: "center",
                  }}
                >
                  Balance Found on Another Network
                </Flex>

                <Flex id="balance-alert-description" className="alert-description" style={{ marginTop: "30px", color: "#000", textAlign: "center", fontSize: "13px" }}>
                  Your wallet has <strong>{networkBalanceInfo.balanceInSOL.toFixed(4)} SOL</strong> on{" "}
                  <strong style={{ textTransform: "capitalize" }}>{networkBalanceInfo.network}</strong> 
                  <br/>
                  You&apos;re currently connected to {network}, but you have funds on {networkBalanceInfo.network}.
                </Flex>

                <label className="alert-preference">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(event) => setDontShowAgain(event.target.checked)}
                  />
                  Don't show this again
                </label>

                <Button
                  size="3"
                  aria-label="Dismiss balance alert"
                  onClick={dismissAlert}
                  className="button-close2"
                  style={{
                    display: "block",
                    width: "90%",
                    height: "40px",
                    marginLeft: "auto",
                    marginRight: "auto",
                    marginTop: "20px",
                    background: "rgb(90 90 98)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontWeight: "500",
                  }}
                >
                  Got it
                </Button>
              </div>
            </Flex>
          </div>
        </>
      )}
    </>
  );
}
