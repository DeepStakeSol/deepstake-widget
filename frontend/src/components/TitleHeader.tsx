import  EpochProgressCircle  from "./EpochProgressCircle"
import { useNetwork } from "../context/NetworkContext";

const styles = {
    container: {
    display: "flex",
    flexDirection: "column" as 'column',
    gap: "12px",
    width: "100%",
  },

  row: {
    display: "flex",
    width: "100%",
  },

  select: {
    padding: "6px 10px",
    border: 0,
    borderRadius: "6px",

  },

  halfLeft: {
    width: "66.6667%",
    display: "flex",
    alignItems: "center",
    fontSize: "48px",
  },

  halfRight: {
    width: "33.3333%",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  icon: {
    width: "80px",
    height: "80px",
  },

  epochText: {
    display: "flex",
    flexDirection: "column" as 'column',
    lineHeight: 1.2,
  },

  epochTitle: {
    fontWeight: 500,
  },

  epochTime: {
    fontSize: "0.85rem",
    opacity: 0.7,
  },
};

type Props = {
  progress: number;
  currentEpoch: number;
  secondsRemainToEpochEnd: number;
};

export const TitleHeader = ({
 progress,
 currentEpoch,
 secondsRemainToEpochEnd,
}: Props) => {

  const { network, setNetwork } = useNetwork();

  const toHHMMSS = (totalSeconds: number) =>{
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    return hours.toString().padStart(2, '0') + "h " + 
      minutes.toString().padStart(2, '0') + "m " +
      seconds.toString().padStart(2, '0') + "s";
  }

  const timeLeftString = toHHMMSS(secondsRemainToEpochEnd);

  return (
    <div style={styles.container}>
      {/* 1st row - Network selector disabled */}
      {/* <div style={styles.row}>
        <select
          className="sw-network-select"
          style={styles.select}
          value={network}
          onChange={(e) => setNetwork(e.target.value as any)}
        >
          <option value="mainnet">Mainnet</option>
          <option value="devnet">Devnet</option>
          <option value="testnet">Testnet</option>
        </select>
      </div> */}

      {/* 2nd row */}
      <div style={styles.row}>
        {/* Left 50% */}
        <div style={styles.halfLeft} className="sw-network-header">
          Stake SOL
        </div>

        {/* Right 50% */}
        <div style={styles.halfRight}>

          <EpochProgressCircle 
            progress={progress}
          />

          <div style={styles.epochText} className="sw-network-epoch" >
            <div style={styles.epochTitle}>Epoch {currentEpoch}</div>
            <div style={styles.epochTime} className="sw-network-epoch-remain">{timeLeftString} </div>
          </div>
        </div>
      </div>
      <style jsx >{`
        #root .sw-network-select {
          color: #000000;
          background-color: #FDFDFD;
        }

        #root[data-theme="dark"] .sw-network-select {
          color: #9F9FAC;
          background-color: #9F9FAC40;
        }

        #root[data-theme="dark"] .sw-network-header {
          color: #fff;
        }

        #root[data-theme="dark"] .sw-network-epoch {
          color: #fff;
        }

        #root[data-theme="dark"] .sw-network-epoch-remain {
          color: #fff;
        }
      `}</style>
    </div>
  );
};
