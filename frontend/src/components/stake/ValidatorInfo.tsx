import { shortenAddress } from "../../utils/solana/address";
import { ValidatorProfile } from "../../utils/solana/validator";
import { useEffect, useState } from "react";
import { cssImageUrl } from "../../utils/imageUrl";

interface Props {
  validatorInfo: ValidatorProfile | null;
  voteAccount: string;
}

export function ValidatorInfo({ validatorInfo, voteAccount }: Props) {
  const logoUrl = validatorInfo?.logoUrl ?? null;
  const [copied, setCopied] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const handleCopyIdentity = async () => {
    if (!voteAccount) return;

    try {
      await navigator.clipboard.writeText(voteAccount);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="vi-validator-card">
      {logoUrl && !logoFailed ? (
        <img
          src={logoUrl}
          alt={validatorInfo?.name ? validatorInfo.name + " logo" : "Validator logo"}
          className="vi-image"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <div
          className="vi-avatar"
          role="img"
          aria-label={
            validatorInfo?.name ? validatorInfo.name + " logo" : "Validator logo"
          }
        />
      )}

      <div className="vi-content">
        <div className="vi-title">
          {validatorInfo?.name ?? "Validator"}
        </div>

        <div className="vi-subtitle">
          <span>Vote Account: {voteAccount ? shortenAddress(voteAccount) : "Not configured"}</span>
          <div
            className="vi-copy-btn"
            onClick={handleCopyIdentity}
            title={copied ? "Copied!" : "Copy validator identity"}
          ></div>
        </div>

        {validatorInfo?.description && (
          <div className="vi-description">{validatorInfo.description}</div>
        )}
      </div>
      <style>{`
        [data-widget="deepstake"] .vi-validator-card {
          color: #000000;
          background-color: #F2F1F1;
        }

        [data-widget="deepstake"] .vi-subtitle {
          color: #9F9FAC;
        }

        [data-widget="deepstake"] .vi-description {
          color: #555;
        }

        [data-widget="deepstake"][data-theme="dark"] .vi-validator-card {
          color: #9F9FAC;
          background-color: #0D1625;
        }

        [data-widget="deepstake"][data-theme="dark"]  .vi-subtitle {
          color: #9F9FAC;
        }

        [data-widget="deepstake"][data-theme="dark"]  .vi-description {
          color: #9F9FAC;
        }

        [data-widget="deepstake"] .vi-validator-card {
          display: flex;
          align-items: flex-start;
          gap: 24px;
          border-radius: 12px;
          max-width: 700px;
          margin-bottom: 30px;
        }

        [data-widget="deepstake"] .vi-image,
        [data-widget="deepstake"] .vi-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        [data-widget="deepstake"] .vi-image {
          object-fit: cover;
        }

        [data-widget="deepstake"] .vi-avatar {
          background: #D9D9D9;
        }

        [data-widget="deepstake"] .vi-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        [data-widget="deepstake"] .vi-title {
          font-size: 20px;
          font-weight: 600;
        }

        [data-widget="deepstake"] .vi-subtitle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 15px;
        }

        [data-widget="deepstake"] .vi-copy-btn {
          cursor: pointer;
          padding: 0;
          width: 14px;
          height: 14px;
          background-size: contain;
          background-image: ${cssImageUrl("/images/icon-copy.png")};
        }

        [data-widget="deepstake"][data-theme="dark"] .vi-copy-btn {
          background-size: contain;
          background-image: ${cssImageUrl("/images/icon-copy_dk.png")};
        }

        [data-widget="deepstake"] .vi-description {
          font-size: 14px;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
