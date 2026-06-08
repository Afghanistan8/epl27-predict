/* lib/wallet.js
 *
 * Wallet integration (works with OKX, MetaMask, or anything that injects an EVM provider).
 *   - connect / disconnect
 *   - detect & switch to studionet
 *   - emit address change events
 *   - persist last connected address for reconnect on reload
 */

import { STUDIONET } from './config.js';

/* ---------- provider selection ---------- */

function getProvider() {
  if (typeof window === 'undefined') return null;
  // OKX exposes itself on a dedicated global — prefer it to avoid window.ethereum conflicts.
  if (window.okxwallet) return window.okxwallet;
  return window.ethereum || null;
}

export function hasMetaMask() {
  return getProvider() !== null;
}

/* ---------- internal state + subscribers ---------- */

let state = {
  address: null,
  chainId: null,
  isStudionet: false,
};

const subs = new Set();

export function subscribe(cb) {
  subs.add(cb);
  cb(state);
  return () => subs.delete(cb);
}

function setState(patch) {
  state = { ...state, ...patch };
  state.isStudionet =
    (state.chainId || '').toLowerCase() === STUDIONET.chainId.toLowerCase();
  if (state.address) localStorage.setItem('wc-last-address', state.address);
  else localStorage.removeItem('wc-last-address');
  subs.forEach((cb) => cb(state));
}

export function getState() { return state; }

/* ---------- connect / disconnect ---------- */

export async function connect() {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No wallet detected. Install OKX Wallet or MetaMask and refresh.');
  }
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const chainId = await provider.request({ method: 'eth_chainId' });
  setState({ address: accounts[0]?.toLowerCase() ?? null, chainId });

  if ((chainId || '').toLowerCase() !== STUDIONET.chainId.toLowerCase()) {
    await switchToStudionet().catch((e) => console.warn('network switch declined:', e.message));
  }
  return state;
}

export function disconnect() {
  setState({ address: null, chainId: null });
}

/* ---------- studionet switching ---------- */

export async function switchToStudionet() {
  const provider = getProvider();
  if (!provider) throw new Error('No wallet available.');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET.chainId }],
    });
  } catch (err) {
    if (err.code === 4902 || /Unrecognized chain/i.test(err?.message ?? '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: STUDIONET.chainId,
          chainName: STUDIONET.chainName,
          rpcUrls: STUDIONET.rpcUrls,
          nativeCurrency: STUDIONET.nativeCurrency,
          blockExplorerUrls: STUDIONET.blockExplorerUrls,
        }],
      });
    } else {
      throw err;
    }
  }
  const chainId = await provider.request({ method: 'eth_chainId' });
  setState({ chainId });
}

/* ---------- provider event listeners ---------- */

(function attachListeners() {
  const provider = getProvider();
  if (!provider?.on) return;
  provider.on('accountsChanged', (accounts) => {
    setState({ address: accounts[0]?.toLowerCase() ?? null });
  });
  provider.on('chainChanged', (chainId) => {
    setState({ chainId });
  });
})();

/* ---------- silent reconnect on page load ---------- */

export async function trySilentReconnect() {
  const provider = getProvider();
  if (!provider) return;
  const stored = localStorage.getItem('wc-last-address');
  if (!stored) return;
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (accounts?.[0]) {
      const chainId = await provider.request({ method: 'eth_chainId' });
      setState({ address: accounts[0].toLowerCase(), chainId });
    }
  } catch (e) {
    console.warn('silent reconnect failed:', e.message);
  }
}

/* ---------- helpers ---------- */

export function shortAddress(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}
