import { getValidatorAddress } from "../../utils/config";
import { shortenAddress } from "../../utils/solana/address";
import { ValidatorInfoResponse } from "../../utils/solana/validator";
import { useState } from "react";

interface Props {
  validatorInfo: ValidatorInfoResponse | null;
  logoUrl: string | null;
}

export function ValidatorInfo({ validatorInfo, logoUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyIdentity = async () => {
    if (!validatorInfo?.vote_identity) return;

    try {
      await navigator.clipboard.writeText(validatorInfo.vote_identity);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="vi-validator-card">
      {logoUrl ? (
        <img src={logoUrl} alt="logo" className="vi-image" />
      ) : (
        <div className="vi-avatar" />
      )}

      <div className="vi-content">
        <div className="vi-title">
          {validatorInfo?.name}
        </div>

        <div className="vi-subtitle">
          <span>Vote Account: {shortenAddress(getValidatorAddress())}</span>
          <div
            className="vi-copy-btn"
            onClick={handleCopyIdentity}
            title={copied ? "Copied!" : "Copy validator identity"}
          ></div>
        </div>

        <div className="vi-description">
          {validatorInfo?.description}
        </div>
      </div>
      <style>{`
        #root .vi-validator-card {
          color: #000000;
          background-color: #F2F1F1;
        }

        #root .vi-subtitle {
          color: #9F9FAC;
        }

        #root .vi-description {
          color: #555;
        }

        #root[data-theme="dark"] .vi-validator-card {
          color: #9F9FAC;
          background-color: #0D1625;
        }

        #root[data-theme="dark"]  .vi-subtitle {
          color: #9F9FAC;
        }

        #root[data-theme="dark"]  .vi-description {
          color: #9F9FAC;
        }

        .vi-validator-card {
          display: flex;
          align-items: flex-start;
          gap: 24px;
          border-radius: 12px;
          max-width: 700px;
          margin-bottom: 30px;
        }

        .vi-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: #ffffff;
          flex-shrink: 0;
        }

        .vi-image {
          height: 50px;
        }

        .vi-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .vi-title {
          font-size: 20px;
          font-weight: 600;
        }

        .vi-subtitle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 15px;
        }

        .vi-copy-btn {
          cursor: pointer;
          padding: 0;
          width: 14px;
          height: 14px;
          background-size: contain;
          background-image: url(/images/icon-copy.png);
        }

        #root[data-theme="dark"] .vi-copy-btn {
          background-size: contain;
          background-image: url(/images/icon-copy_dk.png);
        }

        .vi-description {
          font-size: 14px;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
