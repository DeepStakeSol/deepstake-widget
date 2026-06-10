import "@fontsource/outfit/500.css";
import { cssImageUrl } from '../../utils/imageUrl'


export function NoWalletTable() {
  

  return (
    <>

      <div className="wallet-screen">
        <div className="wallet-content">
          <div className="wallet-icon">
            <div className="img"></div>
          </div>

          <h1 className="wallet-title">Wallet not connected</h1>

          <p className="wallet-description">
            Your stake accounts will be displayed here
            <br/>
            when you connect your wallet.
          </p>
        </div>
      </div>

      <style>{`
        /* Full screen wrapper */
        [data-widget="deepstake"] .wallet-screen {
          display: flex;
          align-items: center;        /* vertical center */
          justify-content: center;    /* horizontal center */
          min-height: 244px;
          padding: 24px;
          box-sizing: border-box;
        }

        /* Centered content block */
        [data-widget="deepstake"] .wallet-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 480px;
        }

        /* Icon */
        [data-widget="deepstake"] .wallet-icon {
          margin-bottom: 32px;
          opacity: 0.4;
        }

        [data-widget="deepstake"] .wallet-icon .img {
          width: 96px;
          height: 96px;
          background-size: contain;
          background-image: ${cssImageUrl("/images/table_no_wallet.png")};
        }

        /* Title */
        [data-widget="deepstake"] .wallet-title {
          font-family: 'Outfit', sans-serif;
          font-size: 14px;
          font-weight: 500;
          margin: 0 0 16px 0;
          color: #111;
        }

        /* Description */
        [data-widget="deepstake"] .wallet-description {
          font-family: 'Outfit', sans-serif;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.5;
          color: #9F9FAC;
          margin: 0;
        }

        [data-widget="deepstake"][data-theme="dark"] .wallet-icon .img {
          background-size: contain;
          background-image: ${cssImageUrl("/images/table_no_wallet_dk.png")};
        }

        [data-widget="deepstake"][data-theme="dark"] .wallet-title {
          color: #fff;
        }
      `}</style>

    </>
  );
}
