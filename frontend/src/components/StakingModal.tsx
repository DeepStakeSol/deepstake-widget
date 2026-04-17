"use client";

import { Flex, Text } from "@radix-ui/themes";
import { useStakingModal } from "../context/StakingModalContext";
import { getExplorerTxUrl } from "../utils/config";

export function StakingModal() {
  const { isShowing, isTransactionShowing, successData, hideSuccessModal } = useStakingModal();

  if (!isShowing && !isTransactionShowing && !successData) {
    return null;
  }

  const handleSuccessClose = () => {
    if (successData?.onClose) {
      successData.onClose();
    }
    hideSuccessModal();
  };

  return (
    <>
      {/* Staking Loading Modal */}
      {isShowing && (
        <>
          <div className="staking-overlay" />
          <div
            className="staking-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="staking-dialog-title"
            aria-describedby="staking-dialog-description"
          >
            <Flex direction="column" align="center" style={{ position: "relative", height: "100%" }}>
              <div style={{ width: "300px", margin: "70px auto 0" }}>
                <Flex
                  id="staking-dialog-title"
                  className="staking-dialog-title"
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  Staking your SOL...
                </Flex>

                <img
                  src="/images/staking_sol_logo.png"
                  alt="staking logo"
                  width={130}
                  height={117}
                  style={{ marginTop: "30px", display: "block", marginLeft: "auto", marginRight: "auto" }}
                />

                <div
                  id="staking-dialog-description"
                  className="staking-dialog-description"
                  style={{
                    marginTop: "30px",
                    width: "200px",
                    marginLeft: "auto",
                    marginRight: "auto",
                    textAlign: "center",
                  }}
                >
                  <Text
                    size="2"
                    color="gray"
                    style={{
                      fontSize: "13px",
                      fontWeight: 400,
                    }}
                  >
                    Please wait while we process your stake transaction...
                  </Text>
                </div>
              </div>
            </Flex>
          </div>
        </>
      )}

      {/* Transaction Loading Modal (Unstake/Withdraw) */}
      {isTransactionShowing && (
        <>
          <div className="transaction-overlay" />
          <div
            className="transaction-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="transaction-dialog-title"
          >
            <Flex direction="column" align="center" style={{ position: "relative", height: "100%" }}>
              <div style={{ width: "300px", margin: "70px auto 0" }}>
                <Flex
                  id="transaction-dialog-title"
                  className="transaction-dialog-title"
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  Sending transaction...
                </Flex>

                <img
                  src="/images/big_loader.png"
                  alt="loading"
                  width={130}
                  height={117}
                  style={{
                    marginTop: "30px",
                    display: "block",
                    marginLeft: "auto",
                    marginRight: "auto",
                    animation: "spin 3s linear infinite",
                  }}
                />
              </div>
            </Flex>
          </div>
        </>
      )}

      {/* Success Modal */}
      {successData && (
        <>
          <div className="success-overlay" />
          <div
            className="success-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="success-dialog-title"
            aria-describedby="success-dialog-description"
          >
            <Flex direction="column" align="center" style={{ position: "relative", height: "100%" }}>
              <div style={{ width: "300px", margin: "70px auto 0" }}>
                <Flex
                  id="success-dialog-title"
                  className="success-dialog-title"
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  {successData.title}
                </Flex>

                <img
                  src="/images/staking_sol_logo.png"
                  alt="staking logo"
                  width={130}
                  height={117}
                  style={{ marginTop: "30px", display: "block", marginLeft: "auto", marginRight: "auto" }}
                />

                <div
                  id="success-dialog-description"
                  className="success-dialog-description"
                  style={{
                    marginTop: "30px",
                    width: "200px",
                    marginLeft: "auto",
                    marginRight: "auto",
                    textAlign: "center",
                  }}
                >
                  <Text
                    size="2"
                    color="gray"
                    style={{
                      fontSize: "13px",
                      fontWeight: 400,
                    }}
                  >
                    {successData.message}
                  </Text>
                </div>

                {/* View Options */}
                {successData.signature && (
                  <Flex
                    gap="3"
                    justify="between"
                    style={{
                      marginTop: "30px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "24px",
                    }}
                  >
                    <a
                      href={getExplorerTxUrl({
                        signature: successData.signature,
                        explorer: "solana-explorer"
                      })}
                      className="sol-links"
                    >
                      Explorer
                    </a>
                    <a
                      href={getExplorerTxUrl({
                        signature: successData.signature,
                        explorer: "solscan"
                      })}
                      className="sol-links"
                    >
                      Solscan
                    </a>
                    <a
                      href={getExplorerTxUrl({
                        signature: successData.signature,
                        explorer: "solana-fm"
                      })}
                      className="sol-links"
                    >
                      Solana FM
                    </a>
                  </Flex>
                )}

                <button
                  type="button"
                  className="success-close-btn"
                  onClick={handleSuccessClose}
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
                  }}
                >
                  ✕
                </button>
              </div>
            </Flex>
          </div>
        </>
      )}

      <style>{`
        .staking-overlay,
        .success-overlay,
        .transaction-overlay {
          position: absolute;
          inset: 0;
          z-index: 100;
          background-color: #9f9facc4;
          backdrop-filter: blur(4px);
          border-radius: 20px;
        }

        .staking-modal,
        .success-modal,
        .transaction-modal {
          position: absolute;
          z-index: 101;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 400px;
          background-color: #fff;
          border: 0;
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          color: #000;
        }

        .staking-modal {
          height: 360px;
        }

        .success-modal {
          height: 410px;
        }

        .transaction-modal {
          height: 320px;
        }

        #root[data-theme="dark"] .staking-overlay,
        #root[data-theme="dark"] .success-overlay,
        #root[data-theme="dark"] .transaction-overlay {
          background-color: #0d1625db;
          backdrop-filter: blur(4px);
        }

        #root[data-theme="dark"] .staking-modal,
        #root[data-theme="dark"] .success-modal,
        #root[data-theme="dark"] .transaction-modal {
          background-color: #353844 !important;
          color: #fff !important;
        }

        #root[data-theme="dark"] .staking-dialog-title,
        #root[data-theme="dark"] .success-dialog-title,
        #root[data-theme="dark"] .transaction-dialog-title {
          color: #fff !important;
        }

        #root[data-theme="dark"] .staking-dialog-description,
        #root[data-theme="dark"] .success-dialog-description {
          color: #fff !important;
        }

        #root[data-theme="dark"] .success-close-btn {
          color: #fff !important;
        }

        #root[data-theme="dark"] .sol-links {
          color: #fff !important;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
