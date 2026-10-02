'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@radix-ui/themes'
import { install } from '@solana/webcrypto-ed25519-polyfill'
import { StakeButtonJpool } from './StakeButtonJpool'
import { JpoolManageBlock } from './JpoolManageBlock'
import { WalletConnectButton } from '../WalletConnectButton'
import { StakeInputSection } from './StakeInputSection'
import { StakeLayout } from './StakeLayout'
import { NoWalletTable } from './NoWalletTable'
import { useLiquidStakeForm } from '../../hooks/useLiquidStakeForm'
import {
  fetchJpoolManage,
  fetchJpoolPool,
  jpoolAtaRentLamports,
  quoteJsolForPool,
  type JpoolManageResponse,
  type JpoolPoolResponse,
} from '../../utils/jpool'
import { formatLamports } from '../../utils/lamports'
import { ValidatorProfile } from '../../utils/solana/validator'

install()

interface Props {
  validatorInfo: ValidatorProfile | null
  voteAccount: string
  secondsRemainToEpochEnd: number
}

function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function StakeFormJpool({ validatorInfo, voteAccount, secondsRemainToEpochEnd }: Props) {
  const [manage, setManage] = useState<JpoolManageResponse | null>(null)
  const [manageIsLoading, setManageIsLoading] = useState(false)
  const [pool, setPool] = useState<JpoolPoolResponse | null>(null)

  const {
    selectedWalletAccount,
    network,
    isConnected,
    balance,
    formattedStakeAmount,
    handleInputChange,
    setHalf,
    setMax,
    stakeLamports,
    inSufficientBalance,
    resetFormAndRefreshBalance,
  } = useLiquidStakeForm({
    ataExists: manage?.ataExists,
    ataRentLamports: jpoolAtaRentLamports(pool),
  })

  const isMainnet = network === 'mainnet'
  const walletAddress = selectedWalletAccount?.address
  const validatorName = validatorInfo?.name || truncateAddress(voteAccount)

  const loadManage = useCallback(
    async (refresh = false) => {
      if (!walletAddress) return
      setManageIsLoading(true)
      try {
        setManage(await fetchJpoolManage(walletAddress, voteAccount, network, { refresh }))
      } catch (error) {
        console.error('Failed to load JPool manage data:', error)
      } finally {
        setManageIsLoading(false)
      }
    },
    [walletAddress, voteAccount, network]
  )

  useEffect(() => {
    setManage(null)
    if (!isMainnet || !walletAddress) return
    void loadManage()
  }, [isMainnet, walletAddress, loadManage])

  useEffect(() => {
    if (!isMainnet) return
    let cancelled = false
    fetchJpoolPool(network)
      .then((data) => {
        if (!cancelled) setPool(data)
      })
      .catch((error) => console.error('Failed to load JPool pool:', error))
    return () => {
      cancelled = true
    }
  }, [isMainnet, network])

  const quote = useMemo(
    () => (pool && stakeLamports ? quoteJsolForPool(pool, stakeLamports) : null),
    [pool, stakeLamports]
  )

  const handleManageOpen = useCallback(() => {
    if (isMainnet && isConnected) void loadManage()
  }, [isMainnet, isConnected, loadManage])

  if (!isMainnet) {
    return (
      <Card size="3" className="stake-form jpool-devnet-card" style={{ padding: '25px 50px' }}>
        <div className="jpool-devnet-empty">JPool only works in the mainnet cluster</div>
        <style>{`
          [data-widget="deepstake"] .jpool-devnet-card { background-color: #fff; }
          [data-widget="deepstake"] .jpool-devnet-empty {
            min-height: 376px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: #000;
            font-size: 16px;
            font-weight: 500;
          }
          [data-widget="deepstake"][data-theme="dark"] .jpool-devnet-card {
            background-color: #9f9fac29;
            border: 0;
          }
          [data-widget="deepstake"][data-theme="dark"] .jpool-devnet-empty { color: #9F9FAC; }
        `}</style>
      </Card>
    )
  }

  const inputHint = pool?.depositsRestricted
    ? 'Deposits to JPool are paused right now. Please try again later.'
    : quote !== null
      ? `You receive ~${formatLamports(quote, 6)} JSOL`
      : null

  return (
    <StakeLayout
      stakeChildren={
        <>
          <StakeInputSection
            isConnected={isConnected}
            selectedWalletAddress={walletAddress}
            balance={balance}
            formattedStakeAmount={formattedStakeAmount}
            onInputChange={handleInputChange}
            onSetStakeAmount={handleInputChange}
            onSetFormattedStakeAmount={handleInputChange}
            onHalf={setHalf}
            onMax={setMax}
            inputHint={inputHint}
            validatorInfo={validatorInfo}
            secondsRemainToEpochEnd={secondsRemainToEpochEnd}
            stakeMode="jpool"
          />
          {/* TEMP(JPOOL-TMP-01): softened copy until JPool confirms the attribution policy. */}
          <p className="jpool-note">
            Stake SOL through JPool and receive JSOL, a liquid staking token. Your deposit is tagged
            for {validatorName} via JPool direct staking.
          </p>
          {isConnected && selectedWalletAccount ? (
            <StakeButtonJpool
              network={network}
              account={selectedWalletAccount}
              voteAccount={voteAccount}
              stakeLamports={stakeLamports}
              inSufficientBalance={inSufficientBalance}
              depositsPaused={pool?.depositsRestricted === true}
              validatorName={validatorName}
              onManageLoaded={setManage}
              onSuccess={resetFormAndRefreshBalance}
            />
          ) : (
            <WalletConnectButton />
          )}
          <style>{`
            [data-widget="deepstake"] .jpool-note {
              margin: -24px 30px 16px;
              color: #777;
              font-size: 12px;
              line-height: 1.4;
            }
            [data-widget="deepstake"][data-theme="dark"] .jpool-note { color: #9F9FAC; }
          `}</style>
        </>
      }
      manageChildren={
        isConnected && selectedWalletAccount ? (
          <JpoolManageBlock
            data={manage}
            isLoading={manageIsLoading}
            network={network}
            validatorInfo={validatorInfo}
            widgetVoteAccount={voteAccount}
          />
        ) : (
          <>
            <NoWalletTable />
            <WalletConnectButton />
          </>
        )
      }
      onManageOpen={handleManageOpen}
    />
  )
}
