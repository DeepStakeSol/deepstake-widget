import { Table, Text, Flex, Button } from '@radix-ui/themes'
import { shortenAddress } from '../../utils/solana/address'
import { ChevronUpIcon, ChevronDownIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { GetStakeAccountResponse } from '../../utils/solana/stake/get-stake-accounts'
import { UnstakeButton } from './UnstakeButton'
import { WithdrawButton } from './WithdrawButton'
import { UiWalletAccount } from '@wallet-standard/react'
import { cssImageUrl } from '../../utils/imageUrl'

interface StakeAccountsTableProps {
  network: string
  stakeAccounts: GetStakeAccountResponse[]
  selectedRow: GetStakeAccountResponse | null
  onSelectRow: (row: GetStakeAccountResponse) => void
  currentEpoch: number

  account: UiWalletAccount
  onSuccess: () => void
}

const ROWS_PER_PAGE = 3
const U64_MAX = 18446744073709551615n

type EpochStatus = 'activating' | 'active' | 'deactivating' | 'deactivated'

export function StakeAccountsTable({
  stakeAccounts,
  selectedRow,
  onSelectRow,
  currentEpoch,
  account,
  onSuccess,
  network,
}: StakeAccountsTableProps) {
  const [pageIndex, setPageIndex] = useState(1)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const pageCount = Math.ceil(stakeAccounts.length / ROWS_PER_PAGE)

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (!stakeAccounts.length) {
    return (
      <Text size="2" color="gray" style={{ textAlign: 'center', padding: '1rem' }}>
        Stake accounts not found
      </Text>
    )
  }

  const startIndex = (pageIndex - 1) * ROWS_PER_PAGE
  const endIndex = startIndex + ROWS_PER_PAGE
  const currentAccounts = stakeAccounts
    .sort((a, b) => b.solBalance - a.solBalance)
    .slice(startIndex, endIndex)

  const normalizedEpoch = (ep: number) => {
    return BigInt(ep) >= U64_MAX ? 0 : ep
  }

  const epochStatus = (deactivatedEpoch: number, activatedEpoch: number): EpochStatus => {
    deactivatedEpoch = normalizedEpoch(deactivatedEpoch)
    if (deactivatedEpoch === 0) {
      return activatedEpoch === currentEpoch ? 'activating' : 'active'
    }
    if (deactivatedEpoch <= activatedEpoch) {
      return 'deactivated'
    }
    if (deactivatedEpoch === currentEpoch) {
      return 'deactivating'
    }
    return 'deactivated'
  }

  const canUnstake = (status: EpochStatus) => {
    return status === 'active' || status === 'activating'
  }

  const canWithdraw = (status: EpochStatus) => {
    return status === 'deactivated'
  }

  return (
    <>
      <Flex
        id="stake-table-container"
        direction="column"
        gap="1"
        style={{
          fontSize: '11.5px',
          color: '#222',
          lineHeight: '1.1',
          width: '100%',
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
            width: '100%',
            overflow: 'hidden',
            fontSize: '13px',
            lineHeight: '1.1',
          }}
        >
          <Table.Header>
            <Table.Row className="table-header">
              <Table.ColumnHeaderCell
                style={{
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  padding: '6px 8px',
                  width: '3%',
                }}
              ></Table.ColumnHeaderCell>

              <Table.ColumnHeaderCell
                style={{
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  padding: '6px 8px',
                  width: '25%',
                }}
              >
                Validator
              </Table.ColumnHeaderCell>

              <Table.ColumnHeaderCell
                style={{
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  padding: '6px 8px',
                  width: '15%',
                }}
              >
                Stake
              </Table.ColumnHeaderCell>

              <Table.ColumnHeaderCell
                style={{
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  padding: '6px 8px',
                  width: '25%',
                }}
              >
                Address
              </Table.ColumnHeaderCell>

              <Table.ColumnHeaderCell
                style={{
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  padding: '6px 8px',
                  width: '32%',
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
                  cursor: 'pointer',
                }}
                onClick={() => onSelectRow(account)}
                className={`table-row cursor-pointer ${
                  selectedRow?.address === account.address ? 'table-row-selected' : ''
                }`}
              >
                <Table.Cell style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <input
                    type="radio"
                    name="stake-row"
                    checked={selectedRow?.address === account.address}
                    onChange={() => onSelectRow(account)}
                    className="stake-row-radio"
                    aria-label={`Select stake account ${account.address}`}
                  />
                </Table.Cell>

                <Table.Cell style={{ textAlign: 'center', padding: '4px 6px' }}>
                  {shortenAddress(account.voter)}
                </Table.Cell>

                <Table.Cell
                  style={{
                    textAlign: 'center',
                    padding: '4px 6px',
                  }}
                >
                  {account.solBalance.toFixed(2)} SOL
                </Table.Cell>

                <Table.Cell
                  style={{
                    textAlign: 'center',
                    padding: '4px 6px',
                  }}
                >
                  {shortenAddress(account.address)}
                  <div
                    className="vi-copy-btn"
                    onClick={() => handleCopyAddress(account.address)}
                    title={copiedAddress === account.address ? 'Copied!' : 'Copy address'}
                  ></div>
                </Table.Cell>

                <Table.Cell
                  style={{
                    textAlign: 'center',
                    padding: '4px 6px',
                    lineHeight: '1.7',
                    fontSize: '13px',
                  }}
                >
                  {account.activationEpoch}
                  <div className="epoch-status">
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
            marginTop: '8px',
            fontSize: '11.5px',
            color: '#555',
            width: '100%',
          }}
        >
          {/* <Text size="1" color="gray">
      Page {currentPage} of {totalPages}
    </Text> */}
          <Flex gap="1" style={{ textAlign: 'center' }}>
            {pageIndex > 1 && (
              <Button
                onClick={() => setPageIndex((p) => p - 1)}
                className="pg-button"
                style={{
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  border: '0',
                }}
              >
                show prev
                <ChevronUpIcon />
              </Button>
            )}

            {pageIndex < pageCount && (
              <Button
                onClick={() => setPageIndex((p) => p + 1)}
                className="pg-button"
                style={{
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  border: '0',
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
          isDisabled={
            !selectedRow ||
            !canUnstake(epochStatus(selectedRow.deactivationEpoch, selectedRow.activationEpoch))
          }
        />
        <WithdrawButton
          network={network}
          account={account}
          onSuccess={onSuccess}
          selectedRow={selectedRow}
          isDisabled={
            !selectedRow ||
            !canWithdraw(epochStatus(selectedRow.deactivationEpoch, selectedRow.activationEpoch))
          }
        />
      </Flex>

      <style>{`
        [data-widget="deepstake"] .action-buttons-row {
          display: flex;
          justify-content: center;
          gap: 8px;
          width: 100%;
          margin-top: 20px;
        }

        [data-widget="deepstake"] .action-buttons-row button {
          width: 50%;
        }

        [data-widget="deepstake"] .stake-table {
          background-color: #fff;
        }

        [data-widget="deepstake"] .table-header {
          font-weight: 800;
        }

        [data-widget="deepstake"] .epoch-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          min-width: 80px;
          margin-left: 5px;
          padding: 2px 6px;
          border-radius: 10px;
          background-color: #E5E4E4;
          font-size: 10px;
          line-height: 1.2;
          text-align: center;
          white-space: nowrap;
        }

        [data-widget="deepstake"] .table-row-selected > td {
          background-color: #DFE7F3;
        }

        [data-widget="deepstake"] .stake-row-radio {
          appearance: none;
          display: inline-block;
          box-sizing: border-box;
          width: 14px;
          height: 14px;
          margin: 0;
          border: 1.5px solid #5A5A62;
          border-radius: 50%;
          background-color: #FFF;
          cursor: pointer;
          vertical-align: middle;
        }

        [data-widget="deepstake"] .stake-row-radio:checked {
          background-color: #5A5A62;
          box-shadow: inset 0 0 0 3px #FFF;
        }

        [data-widget="deepstake"] .stake-row-radio:focus-visible {
          outline: 2px solid #46658C;
          outline-offset: 2px;
        }

        [data-widget="deepstake"] .stake-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        [data-widget="deepstake"] .stake-icon .img {
          width: 24px;
          height: 24px;
          opacity: 0.7;
          background-size: contain;
          background-image: ${cssImageUrl('/images/coins.png')};
        }

        [data-widget="deepstake"] .stake-title {
          font-size: 15px;
          font-weight: 400;
          margin: 0;
          color: #000;
        }

        [data-widget="deepstake"] .vi-copy-btn {
          display: inline-block;
          margin-left: 5px;
          cursor: pointer;
          padding: 0;
          width: 14px;
          height: 14px;
          background-size: contain;
          background-image: ${cssImageUrl('/images/icon-copy.png')};
        }

        [data-widget="deepstake"] .pg-button {
          background: #fff;
        }

        [data-widget="deepstake"][data-theme="dark"] .epoch-status {
          background-color: #353844;
          color: #F2F1F1;
        }

        [data-widget="deepstake"][data-theme="dark"] .table-row {
          color: #9F9FAC;
        }

        [data-widget="deepstake"][data-theme="dark"] .table-row-selected > td {
          background-color: #454A59;
        }

        [data-widget="deepstake"][data-theme="dark"] .stake-row-radio {
          border-color: #D9D9D9;
          background-color: #0D1625;
        }

        [data-widget="deepstake"][data-theme="dark"] .stake-row-radio:checked {
          background-color: #D9D9D9;
          box-shadow: inset 0 0 0 3px #0D1625;
        }

        [data-widget="deepstake"][data-theme="dark"] .stake-row-radio:focus-visible {
          outline-color: #AFCBEE;
        }

        [data-widget="deepstake"][data-theme="dark"] .table-header {
          color: #fff;
        }

        [data-widget="deepstake"][data-theme="dark"] .stake-table {
          background-color: #313846;
        }

        [data-widget="deepstake"][data-theme="dark"] .stake-title {
          color: #9F9FAC;
        }

        [data-widget="deepstake"][data-theme="dark"] .stake-icon .img {
          background-size: contain;
          background-image: ${cssImageUrl('/images/coins_dk.png')};
        }

        [data-widget="deepstake"][data-theme="dark"] .vi-copy-btn {
          background-size: contain;
          background-image: ${cssImageUrl('/images/icon-copy_dk.png')};
        }

        [data-widget="deepstake"][data-theme="dark"] .pg-button {
          background-color: #9f9fac00;
          color: #D9D9D9;
        }

        [data-widget="deepstake"] .pg-button {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          vertical-align: middle;
        }

        [data-widget="deepstake"] .pg-button svg {
          vertical-align: middle;
          display: inline-block;
        }
      `}</style>
    </>
  )
}
