import { Flex } from "@radix-ui/themes";
import {
  Form,
  FormField,
  FormMessage
} from "@radix-ui/react-form";
import { WalletInfo } from "./WalletInfo";
import { WalletBalance } from "./WalletBalance";
import { ValidatorInfoResponse } from "../../utils/solana/validator";

interface StakeInputSectionProps {
  isConnected: boolean;
  selectedWalletAddress?: string;
  balance: number;
  formattedStakeAmount: string;
  onInputChange: (value: string) => void;
  onSetStakeAmount: (value: string) => void;
  onSetFormattedStakeAmount: (value: string) => void;
  validatorInfo: ValidatorInfoResponse | null;
  secondsRemainToEpochEnd: number;
  stakeMode?: "default" | "vault" | "blaze";
}

export function StakeInputSection({
  isConnected,
  selectedWalletAddress,
  balance,
  formattedStakeAmount,
  onInputChange,
  onSetStakeAmount,
  onSetFormattedStakeAmount,
  validatorInfo,
  secondsRemainToEpochEnd,
  stakeMode = "default",
}: StakeInputSectionProps) {
  const styles = {
    widget: {
      display: "flex",
      gap: "12px",
      maxWidth: "600px",
      fontFamily: "sans-serif",
      margin: "20px 0",
    },
    row: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      borderRadius: "8px",
      padding: "0 30px",
    },
    logo: { width: "34px", height: "30px" },
    input: {
      flex: 1,
      padding: "6px 10px",
      border: 0,
      fontSize: "40px",
      width: "200px",
    },
    solLabel: { fontSize: "24px" },
  };

  return (
    <>
      <Flex align="center" justify="between">
        <WalletInfo
          isConnected={isConnected}
          address={selectedWalletAddress}
          balance={balance}
          onSetStakeAmount={onSetStakeAmount}
          onSetFormattedStakeAmount={onSetFormattedStakeAmount}
        />
      </Flex>

      <Form id="stakeForm" style={styles.widget}>
        <FormField
          name="stakeAmount"
          style={{
            width: "100%",
          }}
        >
          {/* First row: input + SOL + MAX */}
          <div style={styles.row} className="sw-input-container">
            <img
              src="/images/sol_logo.png"
              alt="logo"
              style={styles.logo}
            />
            <input
              placeholder="0.00"
              style={styles.input}
              name="stakeAmount"
              inputMode="decimal"
              value={formattedStakeAmount}
              onChange={(e) => onInputChange(e.target.value)}
              aria-label="Stake Amount"
            />
            <span style={styles.solLabel} className="sol-label">
              SOL
            </span>

            <FormMessage match="valueMissing">
              Please enter an amount
            </FormMessage>
            <FormMessage match="typeMismatch">
              Please enter a valid number
            </FormMessage>
          </div>
        </FormField>
      </Form>

      <Flex align="center" justify="between">
        <WalletBalance
          balance={balance}
          validatorInfo={validatorInfo}
          secondsRemainToEpochEnd={secondsRemainToEpochEnd}
          stakeMode={stakeMode}
        />
      </Flex>

      <style>{`
        .sw-input-container,
        .sw-input-container > input {
          background: #F5F5F5;
        }

        .sw-input-container {
          border: 1px solid rgb(204, 204, 204);
        }

        .sw-input-container > input:focus {
          outline: none;
          border: none;
        }

        .sw-input-container > .sol-label {
          color: #000;
        }

        #root[data-theme="dark"] .sw-input-container {
          background: #0D1625;
        }

        #root[data-theme="dark"] .sw-input-container > input,
        #root[data-theme="dark"] .sw-input-container > input:focus {
          background: #0D1625;
        }

        #root[data-theme="dark"] .sw-input-container > input {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .sw-input-container > input:focus {
          color: #fff;
        }

        #root[data-theme="dark"] .sw-input-container > input::placeholder {
          color: #9F9FAC;
          opacity: 1; /* prevents faded look in some browsers */
        }

        /* Older browsers (rarely needed today) */
        #root[data-theme="dark"] .sw-input-container > input::-webkit-input-placeholder {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .sw-input-container > input::-moz-placeholder {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .sw-input-container > input:-ms-input-placeholder {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .sw-input-container {
          border: 1px solid #0D1625;
        }

        #root[data-theme="dark"] .sw-input-container > .sol-label {
          color: #fff;
        }
      `}</style>
    </>
  );
}
