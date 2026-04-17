import { shortenAddress } from "../../utils/solana/address";
import { PRIORITY_FEE_BUFFER, STAKE_PROGRAM, LAMPORTS_PER_SOL, PRIORITY_FEE_BUFFER_LAMPORTS, UI_DECIMALS, UI_SCALE } from "../../utils/constants";
import { WalletDisconnectButton } from "../WalletDisconnectButton";

interface WalletInfoProps {
  isConnected: boolean;
  address?: string;
  balance: number;
  onSetStakeAmount: (newAmount: string) => void;
  onSetFormattedStakeAmount: (newAmount: string) => void;
}

const styles = {
    widget: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      background: "#fff",
      borderRadius: "12px",
      padding: "8px 16px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.1)"
    },
    logo: { height: "24px" },
    wallet_logo: { height: "20px" },
    pubkey: { fontFamily: "monospace", fontSize: "12px" },
    balance: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginLeft: "auto"
    },
    label: { fontSize: "18px", color: "#777" },
    unit: { fontSize: "14px", color: "#777" },
    amount: { fontSize: "20px", fontWeight: 600, color: "#222" },

    container: { 
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
    },
    text: { 
      flexGrow: "1",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    buttons: {
      display: "flex",
      gap: "10px"
    },
    button: {
      padding: "10px 20px",
      cursor: "pointer"
    },
    maxBtn: {
      padding: "6px 10px",
      borderRadius: "8px",
      border: "1px solid #D9D9D9",
      background: "#fff",
      color: "#000",
      fontSize: "14px",
      fontWeight: 500,
      cursor: "pointer",
    },
  };

export function WalletInfo({ isConnected, address, balance, onSetStakeAmount, onSetFormattedStakeAmount }: WalletInfoProps) {
  
  const handleMaxClick = () => {
      // calculate how much SOL can actually be staked after rent and fees
      const available = balance - STAKE_PROGRAM.STAKE_ACCOUNT_RENT - PRIORITY_FEE_BUFFER;
      const nonNegative = Math.max(available, 0);
      // truncate to 6 decimals
      const rawAmount = Math.floor(nonNegative * 1e6) / 1e6;

      // fixed 6 decimals
      const rawString = rawAmount.toFixed(6);

      // remove trailing zeros for UI
      const formatted = rawString.replace(/\.?0+$/, "");

      onSetStakeAmount(rawString);
      onSetFormattedStakeAmount(formatted);
    };

  const handleHalfClick = () => {
      const halfBalance = balance / 2;

      const available =
        halfBalance -
        STAKE_PROGRAM.STAKE_ACCOUNT_RENT -
        PRIORITY_FEE_BUFFER;

      const nonNegative = Math.max(available, 0);

      // truncate to 6 decimals
      const rawAmount = Math.floor(nonNegative * 1e6) / 1e6;

      // fixed 6 decimals
      const rawString = rawAmount.toFixed(6);

      // remove trailing zeros for UI
      const formatted = rawString.replace(/\.?0+$/, "");

      onSetStakeAmount(rawString);
      onSetFormattedStakeAmount(formatted);
    };


  return (
    <div style={styles.container}>
        {isConnected ? (
          <div style={styles.text} >
            <div style={styles.wallet_logo} className="wallet-icon w-open"></div>
            <span style={styles.pubkey} className="wallet-pubkey">
              {address && shortenAddress(address)}
            </span>
            <WalletDisconnectButton />
          </div>
        ) : (
          <div style={styles.text}>
            <div style={styles.wallet_logo} className="wallet-icon w-closed"></div>
            <span>Not Connected</span>
          </div>
        )}

      <div className="buttons">
        <button 
              type="button"
              className="max-btn"
              onClick={handleHalfClick}
            >
              Half
        </button>
        <button 
              type="button"
              className="max-btn"
              onClick={handleMaxClick}
            >
              MAX
        </button>
      </div>
      <style jsx>{`
        .wallet-icon {
          background-size: contain;
          width: 20px;
          height: 20px;
        }
        
        .wallet-pubkey {
          color: #555;
        }

        .wallet-icon.w-open {
          background-image: url(/images/wallet_open.png);
        }
        .wallet-icon.w-closed {
          background-image: url(/images/wallet_closed.png);
        }

        #root[data-theme="dark"] .wallet-icon.w-open {
          background-image: url(/images/wallet_open_dk.png);
        }
        #root[data-theme="dark"] .wallet-icon.w-closed {
          background-image: url(/images/wallet_closed_dk.png);
        }

        #root[data-theme="dark"] .wallet-pubkey {
          color: #9F9FAC;
        }

        .max-btn {
          padding: 2px 10px;
          border-radius: 8px;
          border: 1px solid #D9D9D9;
          background: #fff;
          color: #000;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .max-btn:hover {
          background: #D9D8D8;
        }

        #root[data-theme="dark"] .max-btn {
          border: 1px solid #9F9FAC;
          background: #0D1625;
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .max-btn:hover {
          background: #D9D8D8;
          color: #0D1625;
        }
      `}</style>
    </div>
  )
}
