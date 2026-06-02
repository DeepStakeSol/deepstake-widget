import { ValidatorInfoResponse } from "../../utils/solana/validator";
import { cssImageUrl } from "../../utils/imageUrl";

interface WalletBalanceProps {
  balance: number;
  validatorInfo: ValidatorInfoResponse | null;
  secondsRemainToEpochEnd: number;
  stakeMode?: "default" | "vault" | "blaze";
}

export function WalletBalance({ balance, validatorInfo, secondsRemainToEpochEnd, stakeMode }: WalletBalanceProps) {

  const isJito = validatorInfo?.is_jito;
  let commissionMEV = 0;
  if (isJito && validatorInfo?.jito_commission_bps > 0) {
    commissionMEV = validatorInfo?.jito_commission_bps / 100;
  }

  const timeLeftString = Math.round(secondsRemainToEpochEnd / 86400);

  return (
    <div
      style={{
        marginBottom: "38px",
      }}
    >
      <div className="binfo-container">
        <div className="binfo-left">
          Balance: <span>{balance.toFixed(2)} SOL</span>
        </div>

        <div className="binfo-right">
          <div className="binfo-row">
            <span className="binfo-key">APY :</span>
            <span className="binfo-value">{validatorInfo?.total_apy}%</span>
          </div>
          <div className="binfo-row">
            <span className="binfo-key">
              Fee / Commission :
              <div className="q-mark-icon binfo-tooltip-icon" data-tooltip={`You will receive ${100 - (validatorInfo?.commission || 0)}% of the inflation commissions`}></div>
            </span>
            <span className="binfo-value">{validatorInfo?.commission}%</span>
          </div>
          { isJito && (
            <div className="binfo-row">
              <span className="binfo-key">
                MEV Commission :
                <div className="q-mark-icon binfo-tooltip-icon" data-tooltip={`You will receive ${100 - commissionMEV}% of the MEV commissions`}></div>
              </span>
              <span className="binfo-value">{commissionMEV}%</span>
            </div>
          )}
          
          <div className="binfo-row">
            <span className="binfo-key">Unlock period :</span>
            { stakeMode !== "default" ? (
              <span className="binfo-value">instantly</span>
            ) : (
              <span className="binfo-value">&#x2248; {timeLeftString} days</span>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        [data-widget="deepstake"] .q-mark-icon {
          display: inline-block;
          width: 13px;
          height: 13px;
          margin-left: 5px;
          background-image: ${cssImageUrl("/images/q_mark.png")};
          background-size: contain;
          position: relative;
          cursor: help;
        }

        [data-widget="deepstake"] .q-mark-icon:hover::after {
          content: attr(data-tooltip);
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          margin-left: 8px;
          width: 100px;
          height: 38px;
          background: #E5E4E4;
          color: #000;
          font-size: 10px;
          font-weight: 400;
          border-radius: 6px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          z-index: 1000;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          line-height: 1.1;
        }

        [data-widget="deepstake"] .binfo-tooltip-icon:hover::after {
          left: auto;
          right: 100%;
          top: auto;
          bottom: 100%;
          transform: none;
          margin-left: 0;
          margin-right: 8px;
          margin-bottom: 6px;
          width: 132px;
          height: auto;
          min-height: 38px;
        }

        [data-widget="deepstake"][data-theme="dark"] .q-mark-icon {
          background-image: ${cssImageUrl("/images/q_mark_dk.png")};
        }

        [data-widget="deepstake"][data-theme="dark"] .q-mark-icon:hover::after {
          background: #090F19;
          color: #9F9FAC;
        }

        [data-widget="deepstake"] .binfo-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }

        [data-widget="deepstake"] .binfo-left {
          font-size: 15px;
          font-weight: 400;
          padding-left: 30px;
        }

        [data-widget="deepstake"] .binfo-left > span {
          color: #9F9FAC;
          font-weight: 500;
        }

        [data-widget="deepstake"][data-theme="dark"] .binfo-left > span {
          color: #fff;
        }

        [data-widget="deepstake"] .binfo-right {
          display: flex;
          flex-direction: column;
          min-width: 220px;
          color: #9F9FAC;
          font-size: 13px;
          line-height: 18px;
        }

        [data-widget="deepstake"] .binfo-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        [data-widget="deepstake"] .binfo-key {
          text-align: left;
        }

        [data-widget="deepstake"] .binfo-value {
          text-align: right;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
