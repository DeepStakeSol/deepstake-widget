export const HIDE_OTHER_NETWORK_ALERT_KEY = 'deepstake:hide-other-network-alert';

export function isOtherNetworkAlertHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_OTHER_NETWORK_ALERT_KEY) === '1';
  } catch {
    return false;
  }
}

export function hideOtherNetworkAlert(): void {
  try {
    localStorage.setItem(HIDE_OTHER_NETWORK_ALERT_KEY, '1');
  } catch {
    // Private browsing may deny storage. Keep the current session usable.
  }
}
