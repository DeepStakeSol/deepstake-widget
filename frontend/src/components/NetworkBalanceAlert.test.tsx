import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UiWalletAccount } from '@wallet-standard/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectedWalletAccountContext } from '../context/SelectedWalletAccountContext';
import { HIDE_OTHER_NETWORK_ALERT_KEY } from '../utils/networkAlertPreference';
import { checkOtherNetworkBalances } from '../utils/solana/balance';
import { NetworkBalanceAlert } from './NetworkBalanceAlert';

const balanceState = vi.hoisted(() => ({
  triggerCheck: true,
  setTriggerCheck: vi.fn(),
}));
vi.mock('../context/NetworkContext', () => ({
  useNetwork: () => ({ network: 'devnet' }),
}));
vi.mock('../context/BalanceCheckContext', () => ({
  useBalanceCheck: () => balanceState,
}));
vi.mock('../utils/solana/balance', () => ({
  checkOtherNetworkBalances: vi.fn(),
}));

const wallet = { address: 'WalletAddress' } as UiWalletAccount;
const setSelectedWalletAccount = vi.fn();

function renderAlert() {
  return render(
    <SelectedWalletAccountContext.Provider value={[wallet, setSelectedWalletAccount]}>
      <NetworkBalanceAlert />
    </SelectedWalletAccountContext.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  balanceState.triggerCheck = true;
  balanceState.setTriggerCheck.mockClear();
  vi.mocked(checkOtherNetworkBalances).mockResolvedValue({ network: 'mainnet', balanceInSOL: 2 });
});
afterEach(() => vi.mocked(checkOtherNetworkBalances).mockReset());

describe('other-network alert', () => {
  it.each(['button', 'close', 'overlay', 'escape'])(
    'persists the checked preference on %s dismissal',
    async (method) => {
      const { container } = renderAlert();
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: "Don't show this again" }));
      if (method === 'button') fireEvent.click(screen.getByRole('button', { name: 'Dismiss balance alert' }));
      if (method === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      if (method === 'overlay') fireEvent.click(container.querySelector('.alert-overlay')!);
      if (method === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(localStorage.getItem(HIDE_OTHER_NETWORK_ALERT_KEY)).toBe('1');
    },
  );

  it('keeps the alert enabled when the checkbox is left clear', async () => {
    renderAlert();
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss balance alert' }));
    expect(localStorage.getItem(HIDE_OTHER_NETWORK_ALERT_KEY)).toBeNull();
  });

  it('skips the balance request when the preference is stored', async () => {
    localStorage.setItem(HIDE_OTHER_NETWORK_ALERT_KEY, '1');
    renderAlert();
    await waitFor(() => expect(balanceState.setTriggerCheck).toHaveBeenCalledWith(false));
    expect(checkOtherNetworkBalances).not.toHaveBeenCalled();
  });
});
