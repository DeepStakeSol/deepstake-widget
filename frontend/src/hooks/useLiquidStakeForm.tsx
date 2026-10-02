'use client'

import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { SelectedWalletAccountContext } from '../context/SelectedWalletAccountContext'
import { useNetwork } from '../context/NetworkContext'
import { fetchSolBalance, invalidateSolBalanceCache } from '../utils/api'
import { PRIORITY_FEE_BUFFER_LAMPORTS } from '../utils/constants'
import {
  formatLamports,
  LAMPORT_DECIMALS,
  parseSolToLamports,
  solNumberToLamports,
} from '../utils/lamports'
import { useIsWalletConnected } from './useIsWalletConnected'

// Reserve for the network and priority fee. A real deposit costs about 5,000
// lamports (J1 mainnet gate), so this leaves the wallet SOL for later fees too.
export const FEE_RESERVE_LAMPORTS = PRIORITY_FEE_BUFFER_LAMPORTS
// Fallback rent for a 165-byte SPL token account (the JSOL ATA) when the live
// value is unknown. This is the pre-2026 rent and above the current one
// (1,488,440), so the fallback over-reserves rather than fails.
export const TOKEN_ACCOUNT_RENT_LAMPORTS = BigInt(2_039_280)

export interface UseLiquidStakeFormOptions {
  // From Manage `ataExists`: rent is reserved only when the ATA is confirmed
  // missing (`false`); `null`/`undefined` (unknown) reserves nothing extra.
  ataExists?: boolean | null
  // Live ATA rent from `/jpool/pool`; null/undefined uses the fallback.
  ataRentLamports?: bigint | null
}

// Normalizes typed input to digits and one dot with at most 9 decimals.
export function normalizeSolInput(value: string): string {
  let clean = value.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const firstDot = clean.indexOf('.')
  if (firstDot !== -1) {
    clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '')
  }
  if (clean.startsWith('.')) clean = '0' + clean

  const [integer = '', decimals] = clean.split('.')
  const normalizedInteger = integer === '0' ? '0' : integer.replace(/^0+/, '') || '0'
  if (decimals === undefined) return integer ? normalizedInteger : ''
  return `${normalizedInteger}.${decimals.slice(0, LAMPORT_DECIMALS)}`
}

// Stake form for liquid-staking deposits (JPool): no stake accounts, no stake
// account rent, exact lamports. Mirrors the `useStakeForm` surface where it
// can so the shared input components keep working.
export function useLiquidStakeForm({ ataExists, ataRentLamports }: UseLiquidStakeFormOptions = {}) {
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext)
  const { network } = useNetwork()
  const isConnected = useIsWalletConnected()
  const walletAddress = selectedWalletAccount?.address

  const [balance, setBalance] = useState(0)
  const [balanceLamports, setBalanceLamports] = useState<bigint | null>(null)
  const [stakeAmount, setStakeAmountState] = useState('')
  // Drops balance responses for a wallet or network that is no longer shown.
  const requestKey = useRef('')

  const loadBalance = useCallback(
    async (refresh: boolean) => {
      if (!walletAddress) return
      const key = `${network}:${walletAddress}`
      requestKey.current = key
      if (refresh) invalidateSolBalanceCache(walletAddress, network)
      try {
        const sol = await fetchSolBalance(walletAddress, network)
        if (requestKey.current !== key) return
        setBalance(sol)
        setBalanceLamports(solNumberToLamports(sol))
      } catch (error) {
        if (requestKey.current === key) console.error('Failed to fetch SOL balance:', error)
      }
    },
    [walletAddress, network]
  )

  useEffect(() => {
    setBalance(0)
    setBalanceLamports(null)
    if (!walletAddress) {
      requestKey.current = ''
      return
    }
    void loadBalance(false)
  }, [walletAddress, loadBalance])

  const reserveLamports =
    FEE_RESERVE_LAMPORTS +
    (ataExists === false ? (ataRentLamports ?? TOKEN_ACCOUNT_RENT_LAMPORTS) : BigInt(0))
  const zero = BigInt(0)
  const maxStakeLamports =
    balanceLamports !== null && balanceLamports > reserveLamports
      ? balanceLamports - reserveLamports
      : zero

  const stakeLamports = parseSolToLamports(stakeAmount)
  const hasAmount = stakeLamports !== null && stakeLamports > zero
  // Unknown until the balance has loaded, so the button does not flash red.
  const inSufficientBalance =
    hasAmount && balanceLamports !== null && stakeLamports > maxStakeLamports

  const handleInputChange = useCallback((value: string) => {
    setStakeAmountState(normalizeSolInput(value))
  }, [])

  const setLamports = useCallback((lamports: bigint) => {
    setStakeAmountState(lamports > BigInt(0) ? formatLamports(lamports) : '')
  }, [])

  const setMax = useCallback(() => setLamports(maxStakeLamports), [setLamports, maxStakeLamports])

  const setHalf = useCallback(() => {
    const half = (balanceLamports ?? BigInt(0)) / BigInt(2)
    setLamports(half < maxStakeLamports ? half : maxStakeLamports)
  }, [setLamports, balanceLamports, maxStakeLamports])

  const refreshBalance = useCallback(() => loadBalance(true), [loadBalance])

  const resetFormAndRefreshBalance = useCallback(() => {
    setStakeAmountState('')
    void loadBalance(true)
  }, [loadBalance])

  return {
    selectedWalletAccount,
    network,
    isConnected,
    // SOL as a number, for the shared balance display components
    balance,
    balanceLamports,
    stakeAmount,
    // Same value as `stakeAmount`; kept for the shared input components.
    formattedStakeAmount: stakeAmount,
    handleInputChange,
    setHalf,
    setMax,
    stakeLamports: hasAmount ? stakeLamports : null,
    reserveLamports,
    maxStakeLamports,
    inSufficientBalance,
    refreshBalance,
    resetFormAndRefreshBalance,
  }
}
