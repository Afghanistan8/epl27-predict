// deploy.js
// Deploy 72 PredictionMarket contracts to GenLayer studionet for the 2026 World Cup group stage.
// Writes each contract address + match metadata to Supabase.
//
// Run: node deploy.js
//
// Resumable: if interrupted, re-running will skip matches already deployed
// (uses deploy_checkpoint.json as a local log).

import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import 'dotenv/config';


// ----------------------------------------------------- env
const { PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Copy .env.example to .env and fill in.');
  process.exit(1);
}

// ----------------------------------------------------- inputs
const contractCode = readFileSync('./prediction_market.py', 'utf-8');
const fixtures = JSON.parse(readFileSync('./fixtures.json', 'utf-8'));
console.log(`Loaded ${fixtures.length} fixtures and contract source\n`);

// ----------------------------------------------------- clients
const account = createAccount(PRIVATE_KEY);
console.log(`Deploying from: ${account.address}`);

const client = createClient({
  chain: studionet,
  account,
});

const sb = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

await client.initializeConsensusSmartContract();
console.log('Consensus contract initialized\n');

// ----------------------------------------------------- checkpoint
const checkpointPath = './deploy_checkpoint.json';
let deployed = {};
if (existsSync(checkpointPath)) {
  deployed = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
  console.log(`Resuming: ${Object.keys(deployed).length} already deployed\n`);
}
const saveCheckpoint = () =>
  writeFileSync(checkpointPath, JSON.stringify(deployed, null, 2));

// ----------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dateFromKickoff(kickoff_ts) {
  // YYYY-MM-DD in UTC — what the contract uses to build BBC URL
  return new Date(kickoff_ts * 1000).toISOString().slice(0, 10);
}

function extractContractAddress(receipt) {
  // Try a few shapes that have appeared in genlayer-js docs/examples
  return (
    receipt?.data?.contract_address ||
    receipt?.contract_address ||
    receipt?.contractAddress ||
    receipt?.to ||
    null
  );
}

// ----------------------------------------------------- main loop
let okCount = 0;
let skipCount = 0;
let failCount = 0;
const failures = [];

for (let i = 0; i < fixtures.length; i++) {
  const f = fixtures[i];
  const game_date = dateFromKickoff(f.kickoff_ts);
  const label = `[${i + 1}/${fixtures.length}] ${f.match_id} ${f.home} vs ${f.away} (${game_date})`;

  if (deployed[f.match_id]) {
    console.log(`✓ ${label}  →  ${deployed[f.match_id]}  (already done)`);
    skipCount++;
    continue;
  }

  console.log(`\n→ ${label}`);

  try {
    // Deploy the contract. Constructor signature: (team1, team2, game_date)
    const txHash = await client.deployContract({
      code: contractCode,
      args: [f.home, f.away, game_date],
      leaderOnly: false,
    });
    console.log(`  tx: ${txHash}`);

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      retries: 120,    // up to ~10 min
      interval: 5000,
    });

    const contractAddress = extractContractAddress(receipt);
    if (!contractAddress) {
      console.error('  receipt:', JSON.stringify(receipt, null, 2).slice(0, 500));
      throw new Error('No contract_address in receipt');
    }
    console.log(`  ✓ ${contractAddress}`);

    // Upsert match metadata to Supabase
    const { error: mErr } = await sb.from('matches').upsert({
      match_id: f.match_id,
      contract_address: contractAddress,
      home: f.home,
      away: f.away,
      kickoff_ts: f.kickoff_ts,
      stage: f.stage,
      group_letter: f.group,
      status: 'scheduled',
    });
    if (mErr) throw new Error(`supabase matches.upsert: ${mErr.message}`);

    const { error: pErr } = await sb.from('pools').upsert({
      match_id: f.match_id,
      pool_home_wei: 0,
      pool_draw_wei: 0,
      pool_away_wei: 0,
      total_wei: 0,
    });
    if (pErr) throw new Error(`supabase pools.upsert: ${pErr.message}`);

    deployed[f.match_id] = contractAddress;
    saveCheckpoint();
    okCount++;

    // Small pause between deploys (be gentle to the network)
    await sleep(2000);
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}`);
    failures.push({ match_id: f.match_id, error: err.message });
    failCount++;
  }
}

// ----------------------------------------------------- summary
console.log('\n========== DEPLOY COMPLETE ==========');
console.log(`Deployed:  ${okCount}`);
console.log(`Skipped:   ${skipCount}  (already in checkpoint)`);
console.log(`Failed:    ${failCount}`);
console.log(`Total:     ${fixtures.length}`);

if (failures.length) {
  console.log('\nFailed matches:');
  failures.forEach((f) => console.log(`  ${f.match_id}: ${f.error}`));
  console.log('\nRe-run this script to retry failed matches.');
  process.exit(1);
}

console.log('\nAll matches deployed and indexed in Supabase.');
