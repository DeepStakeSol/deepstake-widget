import { VaultManageResponse } from "../../utils/api";

interface Props {
  data: VaultManageResponse | null;
  isLoading: boolean;
}

function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatVsol(raw: string): string {
  const n = Number(raw) / 1e9;
  return n.toFixed(9).replace(/\.?0+$/, "") || "0";
}

export function VaultBindingBlock({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <>
        <div className="vb-screen">
          <div className="vb-container">
            <div className="vb-header">
              <div className="vb-icon" />
              <h2 className="vb-title">Vault:</h2>
            </div>
            <div className="vb-loading">
              updating...
              <div className="vb-spinner" />
            </div>
          </div>
        </div>
        <VbStyles />
      </>
    );
  }

  if (!data) return null;

  const { uiStatus, binding, balance, stakebot } = data;
  const vsolFormatted = formatVsol(balance.vsol);
  const voteKeyShort = binding.validatorVoteKey
    ? truncateAddress(binding.validatorVoteKey)
    : null;

  return (
    <>
      <div className="vb-screen">
        <div className="vb-container">
          <div className="vb-header">
            <div className="vb-icon" />
            <h2 className="vb-title">Vault:</h2>
          </div>

          {uiStatus === "ready" && (
            <div className="vb-rows">
              <div className="vb-row">
                <span className="vb-label">Validator</span>
                <span className="vb-value vb-mono" title={binding.validatorVoteKey}>
                  {voteKeyShort}
                </span>
              </div>
              <div className="vb-row">
                <span className="vb-label">vSOL Balance</span>
                <span className="vb-value vb-mono">{vsolFormatted} vSOL</span>
              </div>
              <div className="vb-row">
                <span className="vb-label">Stake Generated</span>
                <span className="vb-value vb-mono">{stakebot.generatedStake} SOL</span>
              </div>
            </div>
          )}

          {uiStatus === "updating" && (
            <>
              <p className="vb-info-msg">
                The data is updated every few hours, wait until the Vault stakebot does its job.
              </p>
              <div className="vb-rows">
                <div className="vb-row">
                  <span className="vb-label">Validator</span>
                  <span className="vb-value vb-mono" title={binding.validatorVoteKey}>
                    {voteKeyShort}
                  </span>
                </div>
                <div className="vb-row">
                  <span className="vb-label">vSOL Balance</span>
                  <span className="vb-value vb-mono">{vsolFormatted} vSOL</span>
                </div>
                <div className="vb-row">
                  <span className="vb-label">Stake Generated</span>
                  <span className="vb-value vb-pending">
                    pending <div className="vb-spinner" />
                  </span>
                </div>
              </div>
            </>
          )}

          {uiStatus === "low_balance" && (
            <>
              <p className="vb-warn-msg">
                This wallet has stake strength of less than 1 vSOL. 
                You still get rewards from holding vSOL, but you don't help the validator because it don't get stake from you.
              </p>
              <div className="vb-rows">
                <div className="vb-row">
                  <span className="vb-label">vSOL Balance</span>
                  <span className="vb-value vb-mono">{vsolFormatted} vSOL</span>
                </div>
                {binding.hasBinding && voteKeyShort && (
                  <div className="vb-row">
                    <span className="vb-label">Validator</span>
                    <span className="vb-value vb-mono" title={binding.validatorVoteKey}>
                      {voteKeyShort}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {uiStatus === "no_binding" && (
            <div className="vb-rows">
              <div className="vb-row">
                <span className="vb-label">vSOL Balance</span>
                <span className="vb-value vb-mono">{vsolFormatted} vSOL</span>
              </div>
              <div className="vb-row">
                <span className="vb-label">Validator binding</span>
                <span className="vb-value vb-muted">Not configured</span>
              </div>
            </div>
          )}

          {uiStatus === "error" && (
            <p className="vb-warn-msg">Failed to load Vault data. Please try again later.</p>
          )}
        </div>
      </div>
      <VbStyles />
    </>
  );
}

function VbStyles() {
  return (
    <style jsx>{`
      .vb-screen {
        padding: 0;
        box-sizing: border-box;
        display: flex;
        justify-content: center;
        margin-top: 8px;
      }

      .vb-container {
        width: 100%;
        max-width: 720px;
        display: flex;
        flex-direction: column;
      }

      .vb-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .vb-icon {
        width: 24px;
        height: 24px;
        opacity: 0.7;
        background-size: contain;
        background-image: url(/images/coins.png);
        flex-shrink: 0;
      }

      #root[data-theme="dark"] .vb-icon {
        background-image: url(/images/coins_dk.png);
      }

      .vb-title {
        font-size: 15px;
        font-weight: 400;
        margin: 0;
        color: #000;
      }

      #root[data-theme="dark"] .vb-title {
        color: #9f9fac;
      }

      .vb-loading {
        font-size: 14px;
        color: #888;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 36px;
      }

      .vb-spinner {
        width: 9px;
        height: 9px;
        border: 1px solid #ccc;
        border-top-color: #fc0101;
        border-radius: 50%;
        animation: vb-spin 0.8s linear infinite;
        flex-shrink: 0;
      }

      @keyframes vb-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .vb-info-msg {
        font-size: 11px;
        color: #555;
        margin: 0 0 10px 36px;
        line-height: 1.4;
        padding: 6px 10px;
        background: #e8f4fd;
        border-left: 3px solid #3b9edd;
        border-radius: 4px;
      }

      #root[data-theme="dark"] .vb-info-msg {
        color: #9f9fac;
        background: #1a2a3a;
        border-left-color: #3b9edd;
      }

      .vb-warn-msg {
        font-size: 11px;
        color: #7a5c00;
        margin: 0 0 10px 36px;
        line-height: 1.4;
        padding: 6px 10px;
        background: #fff8e1;
        border-left: 3px solid #f4b400;
        border-radius: 4px;
      }

      #root[data-theme="dark"] .vb-warn-msg {
        color: #c8a800;
        background: #2a2200;
        border-left-color: #f4b400;
      }

      .vb-rows {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0 36px;
      }

      .vb-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 6px 0;
        border-bottom: 1px solid #f0f0f0;
      }

      .vb-row:last-child {
        border-bottom: none;
      }

      #root[data-theme="dark"] .vb-row {
        border-bottom-color: #2a2a2a;
      }

      .vb-label {
        font-size: 12px;
        color: #888;
        flex-shrink: 0;
      }

      #root[data-theme="dark"] .vb-label {
        color: #9f9fac;
      }

      .vb-value {
        font-size: 13px;
        color: #222;
        text-align: right;
      }

      #root[data-theme="dark"] .vb-value {
        color: #fff;
      }

      .vb-mono {
        font-family: monospace;
      }

      .vb-muted {
        color: #aaa;
        font-style: italic;
      }

      #root[data-theme="dark"] .vb-muted {
        color: #666;
      }

      .vb-pending {
        font-size: 12px;
        color: #888;
        display: flex;
        align-items: center;
        gap: 6px;
        font-style: italic;
      }
    `}</style>
  );
}
