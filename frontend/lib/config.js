/* lib/config.js — Bradbury testnet config
 *
 * PASTE YOUR EXISTING KEYS INTO THE TWO LINES BELOW.
 * Open your old lib/config.js, copy the values for SUPABASE_URL and
 * SUPABASE_PUBLISHABLE_KEY, paste them here, replacing the YOUR_... placeholders.
 */

export const SUPABASE_URL = 'https://zqyoglethlfsatqeqskp.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9P6Ksmnph9F9_NR2rgebog_ost_pOwP';

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
