import { useEffect } from "react";
import './table.css'

interface AppliedStake {
  voteAcc: string;
  amount: number;
}

interface BSOLBalanceTableProps {
  bSOLBalance: number;
  isLoading: boolean;
  validatorName?: string;
  appliedStakes?: AppliedStake[];
  isAppliedStakesLoading?: boolean;
}

function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function BSOLBalanceTable2({
  bSOLBalance,
  isLoading,
  validatorName,
  appliedStakes = [],
  isAppliedStakesLoading = false,
}: BSOLBalanceTableProps) {

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

  const isLoadingData = isLoading || isAppliedStakesLoading;

  const appliedStakesSum = appliedStakes.reduce((sum, stake) => sum + stake.amount, 0);
  const pendingDifference = bSOLBalance - appliedStakesSum;
  const showPendingRow = pendingDifference > 0.000000001;

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
          {isLoadingData ? (
            <div className="balance-container">
              <div className="balance-content">
                <span className="balance-value">
                  updating...
                  <div className="spinner" />
                </span>
                <span className="balance-label">bSOL</span>
              </div>
            </div>
          ) : (
            <div className="stakes-table-container">
              {appliedStakes.length > 0 ? (
                <table className="stakes-table">
                  <thead>
                    <tr>
                      <th className="stakes-table-header">Validator</th>
                      <th className="stakes-table-header stakes-table-header-right">Stake</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appliedStakes.map((stake, index) => (
                      <tr key={stake.voteAcc} className={index % 2 === 0 ? "stakes-table-row-even" : "stakes-table-row-odd"}>
                        <td className="stakes-table-cell" title={stake.voteAcc}>
                          {truncateAddress(stake.voteAcc, 6)}
                        </td>
                        <td className="stakes-table-cell stakes-table-cell-right">
                          {stake.amount.toFixed(9).replace(/\.?0+$/, '')}
                        </td>
                      </tr>
                    ))}
                    {showPendingRow && (
                      <tr className={appliedStakes.length % 2 === 0 ? "stakes-table-row-even" : "stakes-table-row-odd"}>
                        <td className="stakes-table-cell other-pendings">Other pending stakes*</td>
                        <td className="stakes-table-cell stakes-table-cell-right other-pendings">
                          {pendingDifference.toFixed(9).replace(/\.?0+$/, '')}
                        </td>
                      </tr>
                    )}
                    <tr className="stakes-table-total">
                      <td className="stakes-table-cell stakes-table-total-label">Total</td>
                      <td className="stakes-table-cell stakes-table-cell-right stakes-table-total-value">
                        {bSOLBalance.toFixed(9).replace(/\.?0+$/, '')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="balance-container">
                  <div className="balance-content">
                    <span className="balance-value">
                      {bSOLBalance}
                    </span>
                    <span className="balance-label">bSOL</span>
                  </div>
                </div>
              )}
            </div>
          )}
          </>

          <div className="stake-empty">
            {validatorName && appliedStakes.length === 0 && (
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
        /* Page wrapper */
        .stake-screen {
          min-height: 244px;
          padding: 0;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
        }

        /* Content container */
        .stake-container {
          width: 100%;
          max-width: 720px;
          display: flex;
          flex-direction: column;
        }

        /* Header (icon + title) */
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

        /* Empty state text */
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

        /* spinner */
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

        /* Stakes table styles */
        .stakes-table-container {
          padding: 0 30px;
          margin-bottom: 5px;
        }

        .stakes-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          margin-bottom: 24px;
        }

        .stakes-table-header {
          text-align: left;
          padding: 10px 12px;
          font-weight: 700;
          color: #000;
          border-bottom: none;
          font-size: 13px;
        }

        .stakes-table-header-right {
          text-align: right;
        }

        /* .stakes-table-row-even {
          background: #f9f9f9;
        }

        .stakes-table-row-odd {
          background: #fff;
        } */

        .stakes-table-row-even:hover,
        .stakes-table-row-odd:hover {
          background: #f0f0f0;
        }

        .stakes-table-cell {
          padding: 12px 12px 0;
          color: #222;
          /*border-bottom: 1px solid #e8e8e8;*/
        }

        .stakes-table-cell-right {
          text-align: right;
          font-family: monospace;
          font-size: 12px;
        }

        /* .stakes-table-total {
          background: #e8e8e8 !important;
          font-weight: 600;
        } */

        .stakes-table-total:hover {
          background: #e8e8e8 !important;
        }

        .stakes-table-total-label {
          padding: 12px;
          color: #222;
          font-weight: 600;
          font-size: 14px;
        }

        .stakes-table-total-value {
          padding: 12px;
          color: #222;
          font-weight: 600;
          font-size: 14px;
        }

        #root[data-theme="dark"] .stakes-table-header {
          color: #fff;
          border-bottom: none;
        }

        /* #root[data-theme="dark"] .stakes-table-row-even {
          background: #1a1a1a;
        }

        #root[data-theme="dark"] .stakes-table-row-odd {
          background: #222;
        } */

        #root[data-theme="dark"] .stakes-table-row-even:hover,
        #root[data-theme="dark"] .stakes-table-row-odd:hover {
          background: #2a2a2a;
        }

        #root[data-theme="dark"] .stakes-table-cell {
          color: #fff;
          /*border-bottom-color: #626674;*/
        }

        /* #root[data-theme="dark"] .stakes-table-total {
          background: #2a2a2a !important;
        } */

        #root[data-theme="dark"] .stakes-table-total:hover {
          background: #2a2a2a !important;
        }

        #root[data-theme="dark"] .stakes-table-total-label,
        #root[data-theme="dark"] .stakes-table-total-value {
          color: #fff;
        }

        .stakes-table-cell.other-pendings,
        #root[data-theme="dark"] .stakes-table-cell.other-pendings {
          font-style: italic;
          color: orange;
        }
      `}</style>

    </>
 );
}
