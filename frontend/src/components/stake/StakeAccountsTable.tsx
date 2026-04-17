import { Table, Text, Flex, Button } from "@radix-ui/themes";
import { shortenAddress } from "../../utils/solana/address";
import { ChevronUpIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { GetStakeAccountResponse } from "../../utils/solana/stake/get-stake-accounts";
import { useEffect } from "react";
import './table.css'
import { UnstakeButton } from "./UnstakeButton";
import { WithdrawButton } from "./WithdrawButton";
import { UiWalletAccount } from "@wallet-standard/react";

interface StakeAccountsTableProps {
  network: string;
  stakeAccounts: GetStakeAccountResponse[];
  selectedRow: GetStakeAccountResponse | null;
  onSelectRow: (row: GetStakeAccountResponse) => void;
  currentEpoch: number;

  account: UiWalletAccount;
  onSuccess: () => void;
}

const ROWS_PER_PAGE = 3;

export function StakeAccountsTable({ stakeAccounts, selectedRow, onSelectRow, currentEpoch, account, onSuccess, network }: StakeAccountsTableProps) {
  const [pageIndex, setPageIndex] = useState(1);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const pageCount = Math.ceil(stakeAccounts.length / ROWS_PER_PAGE);

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!stakeAccounts.length) {
    return (
      <Text
        size="2"
        color="gray"
        style={{ textAlign: "center", padding: "1rem" }}
      >
        Stake accounts not found
      </Text>
    );
  }

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

  const startIndex = (pageIndex - 1) * ROWS_PER_PAGE;
  const endIndex = startIndex + ROWS_PER_PAGE;
  const currentAccounts = stakeAccounts
    .sort((a, b) => b.solBalance - a.solBalance)
    .slice(startIndex, endIndex);

  const normalizedEpoch = (ep: number) => {
    return ep >= 1844600n ? 0 : ep
  }

  const epochStatus = (deactivatedEpoch: number, activatedEpoch: number) => {
    deactivatedEpoch = normalizedEpoch(deactivatedEpoch);
    if (deactivatedEpoch === 0) {
      return activatedEpoch === currentEpoch ? "activating" : "active";
    }
    if (deactivatedEpoch > 0 && deactivatedEpoch === currentEpoch ) {
      return "pending deactivation";
    }
    return "deactivated";
  }

  const notReadyForUnstake = (epochStatus: string) => {
    return epochStatus !== "active" && epochStatus !== "activating";
  }

  return (
    <>
   <Flex
  id="stake-table-container"
  direction="column"
  gap="1"
  style={{
    fontSize: "11.5px",
    color: "#222",
    lineHeight: "1.1",
    width: "100%",
  }}
> 
  <div className="stake-header">
    <div className="stake-icon">
      <div className="img"></div>
    </div>
    <h2 className="stake-title">Your stake accounts:</h2>
  </div>

  <Table.Root
    variant="surface"
    className="stake-table"
    style={{
      width: "100%", 
      overflow: "hidden",
      fontSize: "13px",
      lineHeight: "1.1",
    }}
  >
    <Table.Header>
      <Table.Row
        className="table-header"
      >
        <Table.ColumnHeaderCell
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            padding: "6px 8px",
            width: "3%",
          }}
        >
          
        </Table.ColumnHeaderCell>

        <Table.ColumnHeaderCell
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            padding: "6px 8px",
            width: "25%",
          }}
        >
          Validator
        </Table.ColumnHeaderCell>

        <Table.ColumnHeaderCell
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            padding: "6px 8px",
            width: "15%",
          }}
        >
          Stake
        </Table.ColumnHeaderCell>

        <Table.ColumnHeaderCell
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            padding: "6px 8px",
            width: "25%",
          }}
        >
          Address
        </Table.ColumnHeaderCell>

        <Table.ColumnHeaderCell
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            padding: "6px 8px",
            width: "32%",
          }}
        >
          Activation Epoch
        </Table.ColumnHeaderCell>

        
      </Table.Row>
    </Table.Header>

    <Table.Body>
      {currentAccounts.map((account) => (
        <Table.Row
          key={account.address}
          style={{
            fontWeight: 300,
            //color: epochColor(account.deactivationEpoch),
            //backgroundColor: selectedRow?.address === account.address ? 'lightblue' : 'white',
            cursor: "pointer",
          }}
          onClick={() => onSelectRow(account)}
          className={`table-row cursor-pointer ${
            selectedRow?.address === account.address ? 'bg-blue-100' : ''
          }`}
        >
          <Table.Cell style={{ textAlign: "center", padding: "4px 6px" }}>
            <input
              type="radio"
              name="stake-row"
              checked={selectedRow?.address === account.address}
              onChange={() => onSelectRow(account)}
            />
          </Table.Cell>

          <Table.Cell style={{ textAlign: "center", padding: "4px 6px" }}>
            {shortenAddress(account.voter)}
          </Table.Cell>

          <Table.Cell
            style={{
              textAlign: "center",
              padding: "4px 6px",
            }}
          >
            {account.solBalance.toFixed(2)} SOL
          </Table.Cell>

          <Table.Cell
            style={{
              textAlign: "center",
              padding: "4px 6px",
            }}
          >
            {shortenAddress(account.address)}
            <div
              className="vi-copy-btn"
              onClick={() => handleCopyAddress(account.address)}
              title={copiedAddress === account.address ? "Copied!" : "Copy address"}
            ></div>
          </Table.Cell>

          <Table.Cell
            style={{
              textAlign: "center",
              padding: "4px 6px",
              lineHeight: "1.7",
              fontSize: "13px",
            }}
          >
            {account.activationEpoch} 
            <div 
              style={{
                display: "inline-block",
                width: "70px",
                textAlign: "center",
                padding: "2px 6px",
                borderRadius: "10px",
                marginLeft: "5px",
                fontSize: "10px",
              }}
              className="epoch-status"
            >
              {epochStatus(account.deactivationEpoch, account.activationEpoch)}
            </div>
          </Table.Cell>

        </Table.Row>
      ))}
    </Table.Body>
  </Table.Root>

  {/* Pagination Controls */}
  <Flex
    gap="2"
    justify="between"
    align="center"
    style={{
      marginTop: "8px",
      fontSize: "11.5px",
      color: "#555",
      width: "100%", 
    }}
  >
    {/* <Text size="1" color="gray">
      Page {currentPage} of {totalPages}
    </Text> */}
    <Flex gap="1" style={{ textAlign: "center" }}>
     
      { pageIndex > 1 && (
        <Button
        
        onClick={() => setPageIndex((p) => p - 1)}
        className="pg-button"
        style={{
          cursor: "pointer",
          padding: "2px 6px",
          fontSize: "11.5px",
          fontWeight: 600,
          border: "0",
        }}
      >
        show prev 
        <ChevronUpIcon />
      </Button>
      )}

      { pageIndex < pageCount && (
        <Button
        
        onClick={() => setPageIndex((p) => p + 1)}
        className="pg-button"
        style={{
          cursor: "pointer",
          padding: "2px 6px",
          fontSize: "11.5px",
          fontWeight: 600,
          border: "0",
        }}
      >
        show next
        <ChevronDownIcon />
      </Button>
      )}

    </Flex>
  </Flex>
</Flex>

      <Flex className="action-buttons-row">
        <UnstakeButton
            network={network} 
            account={account}
            onSuccess={onSuccess}

            selectedRow={selectedRow}
            isDisabled={!selectedRow || notReadyForUnstake(epochStatus(selectedRow.deactivationEpoch, selectedRow.activationEpoch))}
        />
        <WithdrawButton 
            network={network}
            account={account}
            onSuccess={onSuccess}

            selectedRow={selectedRow}
            isDisabled={!selectedRow || epochStatus(selectedRow.deactivationEpoch, selectedRow.activationEpoch) !== "deactivated" }
        />
      </Flex>

      <style>{`
        .action-buttons-row {
          display: flex;
          justify-content: center;
          gap: 8px;
          width: 100%;
          margin-top: 20px;
        }

        .action-buttons-row button {
          width: 50%;
        }

        .stake-table {
          backgroud-color: #fff;
        }

        .table-header {
          font-weight: 800;
        }

        .epoch-status {
          background-color: #E5E4E4;
        }

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

        .vi-copy-btn {
          display: inline-block;
          margin-left: 5px;
          cursor: pointer;
          padding: 0;
          width: 14px;
          height: 14px;
          background-size: contain;
          background-image: url(/images/icon-copy.png);
        }

        .pg-button {
          background: #fff;
        }

        #root[data-theme="dark"] .epoch-status {
          background-color: #353844;
          color: #F2F1F1;
        }

        #root[data-theme="dark"] .table-row {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .table-header {
          color: #fff;
        }

        #root[data-theme="dark"] .stake-table {
          backgroud-color: #313846;
        }

        #root[data-theme="dark"] .stake-title {
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .stake-icon .img {
          background-size: contain;
          background-image: url(/images/coins_dk.png);
        }

        #root[data-theme="dark"] .vi-copy-btn {
          background-size: contain;
          background-image: url(/images/icon-copy_dk.png);
        }

        #root[data-theme="dark"] .pg-button {
          background-color: #9f9fac00;
          color: #D9D9D9;
        }

        .pg-button {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          vertical-align: middle;
        }

        .pg-button svg {
          vertical-align: middle;
          display: inline-block;
        }
      `}</style>
</>
  );
}
