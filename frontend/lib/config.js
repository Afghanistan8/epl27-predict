/* lib/config.js — Bradbury testnet + EPL '27 Supabase config */

// EPL '27 Predict uses its OWN dedicated Supabase project (separate from WC).
// Project ref: lhcazntvrolghupdsheh
export const SUPABASE_URL = 'https://lhcazntvrolghupdsheh.supabase.co';

// ⚠️ PASTE THE EPL PROJECT'S *PUBLISHABLE* KEY HERE (starts with sb_publishable_).
// Supabase dashboard → project lhcazntvrolghupdsheh → Settings → API keys →
// "Publishable" (the renamed anon key). This is safe to ship in the browser;
// RLS restricts it to public reads. The secret key stays server-side only.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RNO7e-1QW8bt4Xrfwrp2rA_cWSVm_8I';

// GenLayer Bradbury testnet — DO NOT CHANGE
export const STUDIONET = {
  chainId: '0x107d',
  chainIdDecimal: 4221,
  chainName: 'GenLayer Bradbury',
  rpcUrls: ['https://rpc-bradbury.genlayer.com'],
  blockExplorerUrls: ['https://explorer-bradbury.genlayer.com'],
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
};

export const MIN_STAKE_GEN = 2;

// Secure mirror API (Vercel cron project). Writes to Supabase are no longer
// done from the browser — they go through these endpoints, which verify the
// claim against the contract (or a wallet signature) before writing. This is
// what stops anyone forging leaderboard / prediction rows with the public key.
export const MIRROR_API_BASE = 'https://epl27-predict-cron.vercel.app';
