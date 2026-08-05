// GenLayer client setup for the EPL '27 market + AI-call contracts on Bradbury.
//
// Reads use a plain client (no wallet). Writes run in the browser via the wallet
// the user picked in RainbowKit — genlayer-js signs through THAT wallet's
// provider (from connector.getProvider()), with RPC proxied via /api/rpc.

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function proxyEndpoint(): string {
  if (typeof window !== "undefined") return `${window.location.origin}/api/rpc`;
  return "/api/rpc";
}

/** Read-only client — no wallet needed (pools, match info, AI predictions). */
export function getReadClient() {
  return createClient({ chain: testnetBradbury, endpoint: proxyEndpoint() } as never);
}

/** Browser write client — the chosen wallet signs; RPC via our proxy. */
export function getWriteClient(address: string, provider?: Eip1193Provider) {
  return createClient({
    chain: testnetBradbury,
    account: address as `0x${string}`,
    endpoint: proxyEndpoint(),
    ...(provider ? { provider } : {}),
  } as never);
}

/**
 * genlayer-js signs via the wallet's provider. With several extensions
 * installed, confirm the chosen provider actually holds the address before
 * signing (per-origin authorization; error 4100 otherwise). This is the guard
 * that makes multi-wallet setups sign with the RIGHT account.
 */
export async function ensureWalletAuthorized(
  address: string,
  provider?: Eip1193Provider
): Promise<void> {
  const eth = provider ?? (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) throw new Error("No wallet found in this browser.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const ok = accounts?.some((a) => a.toLowerCase() === address.toLowerCase());
  if (!ok) {
    throw new Error(
      `The selected wallet is not connected as ${address.slice(0, 6)}…${address.slice(-4)}. ` +
      "Switch to that account in your wallet and try again."
    );
  }
}
