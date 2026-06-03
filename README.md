# WC Predict — Deploy Script

Deploys 72 `PredictionMarket` contracts (one per group-stage match) to GenLayer studionet and indexes them in Supabase.

## Files you need in this folder

```
wc-predict-deploy/
├── deploy.js              ← main script (this repo)
├── package.json           ← npm deps  (this repo)
├── .env.example           ← env template (this repo)
├── .env                   ← YOU create this (gitignored)
├── fixtures.json          ← from earlier — 72 World Cup matches
└── prediction_market.py   ← from earlier — the contract source
```

## Setup (one time)

### 1. Install dependencies

```bash
cd wc-predict-deploy
npm install
```

Takes ~30 seconds.

### 2. Set up `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in the three values:

- **`PRIVATE_KEY`**: Export from MetaMask (Account 1, the one with 100 GEN). See `.env.example` for steps.
- **`SUPABASE_URL`**: Your Supabase project URL (looks like `https://xxx.supabase.co`)
- **`SUPABASE_SERVICE_KEY`**: The Secret key from your Supabase API Keys page (starts with `sb_secret_`)

⚠️ **Security warning:** Never commit `.env` to git. Never share your private key.

### 3. Verify the source files are in place

Make sure `fixtures.json` (72 matches) and `prediction_market.py` (the contract) are in this folder.

## Run

```bash
npm run deploy
```

Or directly: `node deploy.js`

### What you'll see

```
Loaded 72 fixtures and contract source

Deploying from: 0x4184bc5E5444F250767E8D33A49817A9B4FB0df3
Consensus contract initialized

→ [1/72] wc2026_g_A01 Mexico vs South Africa (2026-06-11)
  tx: 0xabc...
  ✓ 0xdef...

→ [2/72] wc2026_g_A02 South Korea vs Czechia (2026-06-11)
  ...
```

### Expected runtime

Each deploy: ~30–60 seconds (deterministic, no LLM consensus needed for `__init__`).

Total: **35–70 minutes** for all 72 contracts. Leave it running.

### If something fails midway

The script saves progress to `deploy_checkpoint.json` after every successful deploy. Just re-run `npm run deploy` and it picks up where it left off.

### After completion

- Every match has a row in Supabase `matches` table with its contract address
- Every match has a row in Supabase `pools` table with zero pools (ready for predictions)
- `deploy_checkpoint.json` contains the full mapping locally too

## Troubleshooting

- **"Module not found: genlayer-js/chains"**: Wrong package version. Try `npm install genlayer-js@latest`.
- **"Invalid private key"**: Make sure `PRIVATE_KEY` starts with `0x` and is exactly 66 chars total.
- **"insufficient balance"**: Account 1 doesn't have enough GEN. Check MetaMask, claim from faucet if needed.
- **Deploys hang at "tx: 0x..."**: Network slow or stuck. The 10-minute retry should handle most cases. If a single deploy times out, the script logs it as failed and moves on — re-run to retry.
- **"contract_address not in receipt"**: SDK return shape differs from expected. Run script with `node --inspect` and check what fields the receipt has. Tell me the receipt shape and I'll fix the extractor.
