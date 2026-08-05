/* Shared config for EPL '27 Predict.
 *
 * The Supabase publishable key is public by design (RLS-restricted, rate
 * limited) — the same key the vanilla frontend shipped with, safe to embed.
 */

export const SUPABASE_URL = "https://lhcazntvrolghupdsheh.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RNO7e-1QW8bt4Xrfwrp2rA_cWSVm_8I";

// GenLayer Bradbury testnet.
export const BRADBURY = {
  chainIdHex: "0x107d",
  chainIdDecimal: 4221,
  chainName: "GenLayer Bradbury",
  rpcUrl: "https://rpc-bradbury.genlayer.com",
  explorerUrl: "https://explorer-bradbury.genlayer.com",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
};

export const MIN_STAKE_GEN = 2;

// The AI Call contract (one instance, keyed by match_id). Public read target.
export const AI_PREDICTOR_ADDRESS =
  "0xa9d1dfA3cC8F9B566F823D2d6e7bCaA45aAE2Be2" as `0x${string}`;
