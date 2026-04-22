import { VaultManageResponse } from "../../utils/api";
import { ValidatorInfoResponse } from "../../utils/solana/validator";

interface Props {
  data: VaultManageResponse | null;
  isLoading: boolean;
  validatorInfo?: ValidatorInfoResponse | null;
}

function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function VaultBindingBlock({ data, isLoading, validatorInfo }: Props) {
  if (isLoading) {
    return (
      <>
        <div className="vb-wrap">
          <div className="vb-row">
            <div className="vb-cell-left">
              <div className="vb-cell-top vb-not-staked">NOT DIRECT STAKED TO ANY VALIDATOR</div>
              <div className="vb-cell-bottom">
                <span className="vb-bal-label">Your balance:</span>
                <br />
                <span className="vb-bal-value vb-loading-text">
                  updating... <span className="vb-spinner" />
                </span>
              </div>
            </div>
            <div className="vb-cell-right" />
          </div>
        </div>
        <VbStyles />
      </>
    );
  }

  if (!data) return null;

  const { uiStatus, binding, balance, stakebot } = data;

  const vsolFormatted = (Number(balance.vsol) / 1e9).toFixed(6) + " vSOL";

  const isDirectStaked = uiStatus === "ready";

  let validatorDisplay: string | null = null;
  if (isDirectStaked && binding.validatorVoteKey) {
    if (
      validatorInfo?.vote_identity === binding.validatorVoteKey &&
      validatorInfo?.name
    ) {
      validatorDisplay = validatorInfo.name;
    } else {
      validatorDisplay = truncateAddress(binding.validatorVoteKey);
    }
  }

  return (
    <>
      <div className="vb-wrap">
        <div className="vb-row">
          <div className="vb-cell-left">
            <div className="vb-cell-top">
              {isDirectStaked && validatorDisplay ? (
                <span
                  className="vb-validator"
                  title={binding.validatorVoteKey}
                >
                  {validatorDisplay}
                </span>
              ) : (
                <span className="vb-not-staked">
                  NOT DIRECT STAKED TO ANY VALIDATOR
                </span>
              )}
            </div>
            <div className="vb-cell-bottom">
              <span className="vb-bal-label">Your balance:</span>
              <br />
              <span className="vb-bal-value">{vsolFormatted}</span>
            </div>
          </div>

          <div className="vb-cell-right">
            {uiStatus === "ready" && (
              <span className="vb-stake-amount">
                {stakebot.generatedStake} SOL
              </span>
            )}
            {uiStatus === "updating" && (
              <span className="vb-msg-info">
                The data is updated every few hours, wait until the Vault stakebot does its job.
              </span>
            )}
            {uiStatus === "low_balance" && (
              <span className="vb-msg-warn">
                This wallet has stake strength of less than 1 vSOL. You still get rewards from holding vSOL, but you don't help the validator because it doesn't get stake from you.
              </span>
            )}
            {uiStatus === "no_binding" && (
              <span className="vb-muted">—</span>
            )}
            {uiStatus === "error" && (
              <span className="vb-msg-warn">
                Failed to load Vault data. Please try again later.
              </span>
            )}
          </div>
        </div>
      </div>
      <VbStyles />
    </>
  );
}

function VbStyles() {
  return (
    <style jsx>{`
      .vb-wrap {
        width: 100%;
        box-sizing: border-box;
        padding: 0 30px;
        margin-top: 4px;
      }

      .vb-row {
        display: flex;
        overflow: hidden;
        min-height: 80px;
      }

      /* Left cell: split top/bottom */
      .vb-cell-left {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .vb-cell-top {
        flex: 1;
        padding: 10px 14px 6px 0;
        display: flex;
        align-items: center;
      }

      .vb-cell-bottom {
        flex: 1;
        padding: 8px 14px 10px 0;
      }

      /* Right cell */
      .vb-cell-right {
        flex: 1;
        padding: 12px 14px;
        display: flex;
        align-items: center;
      }

      /* Validator name */
      .vb-validator {
        font-size: 13px;
        font-weight: 600;
        color: #111;
        font-family: monospace;
        word-break: break-all;
      }

      #root[data-theme="dark"] .vb-validator {
        color: #fff;
      }

      /* NOT DIRECT STAKED label */
      .vb-not-staked {
        font-size: 13px;
        font-weight: 400;
        color: #aaa;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      #root[data-theme="dark"] .vb-not-staked {
        color: #9F9FAC;
      }

      /* Balance label + value */
      .vb-bal-label {
        font-size: 13px;
        color: #888;
      }

      #root[data-theme="dark"] .vb-bal-label {
        color: #9f9fac;
      }

      .vb-bal-value {
        font-size: 14px;
        font-weight: 600;
        color: #111;
        font-family: monospace;
      }

      #root[data-theme="dark"] .vb-bal-value {
        color: #fff;
      }

      /* Staked amount */
      .vb-stake-amount {
        font-size: 18px;
        font-weight: 400;
        color: #111;
        font-family: monospace;
      }

      #root[data-theme="dark"] .vb-stake-amount {
        color: #fff;
      }

      /* Info message (blue, updating) */
      .vb-msg-info {
        font-size: 11px;
        color: #1a6fa8;
        line-height: 1.5;
      }

      #root[data-theme="dark"] .vb-msg-info {
        color: #6ab8f0;
      }

      /* Warning message (yellow, low balance) */
      .vb-msg-warn {
        font-size: 13px;
        line-height: 1.5;
      }

      /* Muted dash */
      .vb-muted {
        color: #ccc;
        font-size: 18px;
      }

      #root[data-theme="dark"] .vb-muted {
        color: #555;
      }

      /* Loading */
      .vb-loading-text {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #888;
      }

      .vb-spinner {
        display: inline-block;
        width: 8px;
        height: 8px;
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
    `}</style>
  );
}
