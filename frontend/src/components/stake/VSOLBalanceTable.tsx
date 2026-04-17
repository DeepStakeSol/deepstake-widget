import { useEffect } from "react";
import './table.css'

interface VSOLBalanceTableProps {
  vSOLBalance: number;
  isLoading: boolean;
  validatorName?: string;
}

export function VSOLBalanceTable({
  vSOLBalance,
  isLoading,
  validatorName,
}: VSOLBalanceTableProps) {

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      #stake-table-container table {
        width: 100%;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

    return (
      <>

      <div className="stake-screen">
        <div className="stake-container">
          <div className="stake-header">
            <div className="stake-icon">
              <div className="img"></div>
            </div>
            <h2 className="stake-title">Your balance:</h2>
          </div>

          <>
      <div className="balance-container">
        <div className="balance-content">
          <span className="balance-value">
            {isLoading ? (
              <>
                updating...
                <div className="spinner" />
              </>
            ) : (
              vSOLBalance
            )}
          </span>
          <span className="balance-label">vSOL</span>
        </div>
      </div>
      </>

          <div className="stake-empty">
            {validatorName && (
              <p className="delegated-text">Delegated on <strong>{validatorName}</strong> Validator.</p>
            )}
            <div className="unstake-info">
              <p>To unstake it, sell them through your wallet or DEX.</p>
              <a href="https://jup.ag" target="_blank" rel="noopener noreferrer" className="jupiter-btn">Jupiter</a>
            </div>
          </div>
        </div>
      </div>


      <style jsx>{`
        .stake-screen {
          min-height: 244px;
          padding: 0;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
        }

        .stake-container {
          width: 100%;
          max-width: 720px;
          display: flex;
          flex-direction: column;
        }

        .stake-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .stake-icon .img {
          width: 24px;
          height: 24px;
          opacity: 0.7;
          background-size: contain;
          background-image: url(/images/coins.png);
        }

        .stake-title {
          font-size: 15px;
          font-weight: 400;
          margin: 0;
          color: #000;
        }

        .stake-empty {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.6;
        }

        .stake-empty p {
          margin: 0 0 27px 0;
        }

        .delegated-text {
          color: #000;
          padding: 0 30px;
        }

        .unstake-info {
          background: #fff;
          border-radius: 10px;
          padding: 20px 30px 40px 30px;
        }

        .unstake-info p {
          margin: 0 0 10px 0;
          color: #555;
        }

        .jupiter-btn {
          display: inline-block;
          background: #E5E4E4;
          color: #000;
          text-decoration: none;
          padding: 0 16px;
          border-radius: 10px;
          font-weight: 500;
          transition: opacity 0.2s ease;
          height: 24px;
          width: 100px;
          text-align: center;
        }

        .jupiter-btn:hover {
          opacity: 0.8;
        }

        #root[data-theme="dark"] .delegated-text {
          color: #fff;
        }

        #root[data-theme="dark"] .unstake-info {
          background: #9F9FAC1A;
        }

        #root[data-theme="dark"] .unstake-info p {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .jupiter-btn {
          background: #5A5A62;
          color: #9F9FAC;
        }

        /* Balance container */
        .balance-container {
          position: relative;
          background: transparent;
          padding: 0 30px;
          margin-bottom: 5px;
        }

        .balance-content {
          display: flex;
          align-items: baseline;
          gap: 12px;
          padding: 4px 0;
        }

        .balance-value {
          font-size: 40px;
          font-weight: 400;
          color: #222;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .balance-label {
          font-size: 24px;
          color: #222;
        }

        #root[data-theme="dark"] .balance-value {
          color: #fff;
        }

        #root[data-theme="dark"] .balance-label {
          color: #fff;
        }

        .spinner {
          float: right;
          width: 9px;
          height: 9px;
          border: 1px solid #ccc;
          border-top-color: #fc0101ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        #root[data-theme="dark"] .stake-title {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .stake-icon .img {
          background-size: contain;
          background-image: url(/images/coins_dk.png);
        }
      `}</style>

    </>
 );
}
