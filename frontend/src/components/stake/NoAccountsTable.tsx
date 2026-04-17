import './table.css'


export function NoAccountsTable() {
  
  return (
    <>
      <div className="stake-screen">
        <div className="stake-container">
          <div className="stake-header">
            <div className="stake-icon">
              <div className="img"></div>
            </div>
            <h2 className="stake-title">Your stake accounts:</h2>
          </div>

          <div className="stake-empty">
            <p>You don't have any stake accounts yet.</p>
            <p>It will appear after you deposit at least 0.003 Sol.</p>
          </div>
        </div>
      </div>


      <style>{`
        /* Page wrapper */
        .stake-screen {
          min-height: 244px;
          padding: 48px 32px;
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
          margin-bottom: 24px;
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
          color: #9F9FAC;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.6;
        }

        .stake-empty p {
          margin: 0 0 6px 0;
        }

        #root[data-theme="dark"] .stake-icon .img {
          background-size: contain;
          background-image: url(/images/coins_dk.png);
        }

        #root[data-theme="dark"] .stake-title {
          color: #9F9FAC;
        }

      `}</style>

    </>
  );
}
