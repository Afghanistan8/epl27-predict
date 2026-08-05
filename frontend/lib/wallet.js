/* lib/wallet.js
 *
 * Wallet integration (works with OKX, MetaMask, or anything that injects an EVM provider).
 *   - connect / disconnect
 *   - detect & switch to studionet
 *   - emit address change events
 *   - persist last connected address for reconnect on reload
 */

import { STUDIONET } from './config.js';

/* ---------- provider discovery (EIP-6963) ---------- */

// Wallets announce themselves per EIP-6963. We collect them (deduped by rdns)
// so the user can pick which one to use instead of us guessing.
const announced = [];
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event.detail;
    if (!detail?.provider) return;
    const rdns = detail.info?.rdns;
    const dup = announced.some((a) => (rdns ? a.info?.rdns === rdns : a.provider === detail.provider));
    if (!dup) announced.push(detail);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/* The wallet the user actually chose. All reads/writes use this exact provider
 * so a multi-wallet setup never sends a tx from the wrong account. */
let activeProvider = null;

// Returns the list of discovered wallets: [{ info: {name, icon, rdns}, provider }]
export function getDiscoveredWallets() {
  return announced.slice();
}

// Fallback provider when EIP-6963 found nothing (single legacy injected wallet).
function legacyProvider() {
  if (typeof window === 'undefined') return null;
  if (window.okxwallet) return window.okxwallet;
  if (window.ethereum?.providers?.length) {
    return window.ethereum.providers.find((p) => p.isMetaMask) || window.ethereum.providers[0];
  }
  return window.ethereum || null;
}

// The provider to use for the current session (chosen > legacy fallback).
export function getActiveProvider() {
  return activeProvider || legacyProvider();
}

export function hasMetaMask() {
  return announced.length > 0 || legacyProvider() !== null;
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
  if (state.address) localStorage.setItem('epl-last-address', state.address);
  else localStorage.removeItem('epl-last-address');
  subs.forEach((cb) => cb(state));
}

export function getState() { return state; }

/* ---------- connect / disconnect ---------- */

// Connect using a specific discovered wallet (from the chooser). Pass the
// EIP-6963 `detail` object, or nothing to use the legacy single-wallet path.
export async function connect(detail) {
  const provider = detail?.provider || getActiveProvider();
  if (!provider) {
    throw new Error('No wallet detected. Install MetaMask, OKX, or another wallet and refresh.');
  }
  activeProvider = provider;
  if (detail?.info?.rdns) localStorage.setItem('epl-wallet-rdns', detail.info.rdns);
  attachListeners(provider);

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const chainId = await provider.request({ method: 'eth_chainId' });
  setState({ address: accounts[0]?.toLowerCase() ?? null, chainId });

  if ((chainId || '').toLowerCase() !== STUDIONET.chainId.toLowerCase()) {
    await switchToStudionet().catch((e) => console.warn('network switch declined:', e.message));
  }
  return state;
}

export function disconnect() {
  activeProvider = null;
  localStorage.removeItem('epl-wallet-rdns');
  setState({ address: null, chainId: null });
}

/* ---------- studionet switching ---------- */

export async function switchToStudionet() {
  const provider = getActiveProvider();
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

let listenersAttachedTo = null;
function attachListeners(provider) {
  if (!provider?.on || listenersAttachedTo === provider) return;
  listenersAttachedTo = provider;
  provider.on('accountsChanged', (accounts) => {
    setState({ address: accounts[0]?.toLowerCase() ?? null });
  });
  provider.on('chainChanged', (chainId) => {
    setState({ chainId });
  });
}

/* ---------- silent reconnect on page load ---------- */

export async function trySilentReconnect() {
  const stored = localStorage.getItem('epl-last-address');
  if (!stored) return;

  // Prefer the same wallet the user chose last time (by rdns).
  const rdns = localStorage.getItem('epl-wallet-rdns');
  const chosen = rdns ? announced.find((a) => a.info?.rdns === rdns) : null;
  const provider = chosen?.provider || getActiveProvider();
  if (!provider) return;

  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (accounts?.[0]) {
      activeProvider = provider;
      attachListeners(provider);
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
