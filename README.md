# WC '26 Predict

**An AI-resolved, fully on-chain prediction market for the 2026 FIFA World Cup, built on [GenLayer](https://genlayer.com) Bradbury testnet.**

🔗 Live: [predictwc.xyz](https://predictwc.xyz)

---

## What it is

WC '26 Predict lets anyone make pari-mutuel predictions (Home / Draw / Away) on every match of the 2026 FIFA World Cup using $GEN test tokens. Each match has its own Intelligent Contract that, after the final whistle, **scrapes BBC Sport directly via LLM consensus** to determine the result and pay out winners — no human resolver, no centralized oracle, no admin keys needed.

72 group-stage contracts are already deployed on GenLayer Bradbury testnet, one per match, accepting predictions ahead of the June 11 2026 kickoff.

---

## Why GenLayer

This project uses two flagship features of GenLayer that no traditional smart contract platform can offer:

### 1. Web rendering inside the contract

In `prediction_market.py`, the contract reads the live BBC Sport scoreboard during execution:

```python
web_data = gl.nondet.web.render(resolution_url, mode="text")
```

The contract literally browses the web at resolution time — no oracle service, no off-chain pusher, no centralized backend. The BBC Sport page itself **is** the source of truth.

### 2. LLM-based consensus for ambiguous data

Match results are extracted by an LLM, with multiple validators running the same prompt in parallel and only agreeing if they reach the same JSON output:

```python
result_json = gl.eq_principle.strict_eq(get_match_result)
```

The validators independently parse the BBC Sport HTML, identify the right match, extract the 90-minute regulation score, and return structured JSON. If they disagree, no result is finalized. The strict equivalence principle guarantees deterministic outcomes from non-deterministic inputs — the unique innovation GenLayer enables.

### What this replaces

| Traditional approach | This project |
|---|---|
| Chainlink + paid feed for sports scores | Free, direct from BBC Sport |
| Custom backend pushing results | No backend, contract self-resolves |
| Manual admin clicks to resolve | Fully autonomous via cron |
| Single trusted oracle | Multiple validators reach consensus |

---

## Architecture

```
Frontend (vanilla JS)  --read-->  Supabase (mirror of on-chain state)
        |                                  ^
        +--write via wallet--> GenLayer    |
                              Contracts    |
                                  ^        |
                                  |        |
                       resolve()  |   live-scores cron
                                  |   (football-data.org)
              +-------------------+
              |
       Resolution cron (every 10 min)
       Phase A: poll pending resolutions
       Phase B: submit new resolve() calls
```

### Components

- **`prediction_market.py`** — Intelligent Contract. One instance per match. Holds the pari-mutuel pools, accepts predictions, calls BBC Sport via LLM consensus to resolve.
- **`deploy.js`** — Deploys 72 contracts in sequence, one per group-stage fixture, with resume-on-crash via checkpoint file.
- **`fixtures.json`** — All 72 group-stage matches with kickoff times, including playoff winners.
- **`frontend/`** — Vanilla HTML/CSS/JS frontend with wallet integration (OKX, MetaMask, any EIP-1193 provider), live pool reads, prediction submission, My Picks, and Leaderboard.
- **`cron/api/live-scores.js`** — Vercel endpoint polling football-data.org for live scores. Mirrors to Supabase and broadcasts via Ably for real-time UI.
- **`cron/api/resolve-matches.js`** — Vercel endpoint calling `resolve()` on contracts after their match ends. Two-phase: Phase A polls in-flight LLM consensus, Phase B submits new resolutions.
- **Supabase** — read-mirror of on-chain state. Frontend reads from Supabase for sub-second loads; contracts remain the source of truth.

---

## Contract methods

```python
submit_prediction(pick)   # payable; min 2 GEN; pick in {home, draw, away}
resolve()                 # triggers LLM consensus on BBC Sport
claim()                   # pari-mutuel payout to winning predictors
refund()                  # refund path when winning pool is 0% or 100%
mark_postponed()          # admin-only escape hatch
```

### Read views

```python
get_match_info() -> {team1, team2, game_date, status, result, final_score, admin}
get_pools() -> {home, draw, away, total}
get_my_prediction(user) -> {has_predicted, pick, stake, claimed}
expected_payout(user) -> u256
```

### Refund edge cases (Option X)

If after resolution:
- **0% of the pool** picked correctly → refund everyone
- **100% of the pool** picked correctly → refund everyone

This prevents the contract from holding unclaimable balance.

---

## Network

- **GenLayer Bradbury testnet** (chain ID 4221)
- RPC: `https://rpc-bradbury.genlayer.com`
- Explorer: [explorer-bradbury.genlayer.com](https://explorer-bradbury.genlayer.com)
- Faucet: [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation)

72 contracts live, all deployed from a single admin wallet. Contracts are non-upgradeable.

---

## Running locally

```bash
# 1. Deploy contracts (one-time, ~5 hours for 72 matches on Bradbury)
cp .env.example .env   # fill in PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
npm install
node deploy.js

# 2. Frontend (vanilla JS, no build step)
cd frontend
npx serve

# 3. Cron endpoints (Vercel)
cd cron
npm install
vercel deploy --prod
```

Required env vars:

```
PRIVATE_KEY                 # deploy + resolve wallet
SUPABASE_URL                # your Supabase project URL
SUPABASE_SERVICE_KEY        # for cron writes
FOOTBALL_DATA_API_KEY       # live-scores cron (free at football-data.org)
ABLY_API_KEY                # real-time score broadcast (optional)
CRON_SECRET                 # bearer token for cron-job.org pings
```

---

## Built with

- **GenLayer** — intelligent contracts (Python), LLM consensus, web rendering
- **genlayer-js** — TypeScript SDK for contract deploys and reads
- **Vercel** — frontend + serverless cron endpoints
- **Supabase** — Postgres read-mirror for fast frontend
- **cron-job.org** — minute-level cron pings (Vercel free tier limits)
- **Ably** — real-time score broadcasts
- **football-data.org** — free live score API
- **Vanilla HTML/CSS/JS** — no framework, no build step on the frontend
- **OKX Wallet / MetaMask** — EIP-1193 wallet integration

---

## Roadmap

- [x] 72 group-stage contracts deployed on Bradbury
- [x] Live scores cron + Supabase mirror
- [x] Resolution cron with two-phase LLM polling
- [x] Frontend with predictions, My Picks, Leaderboard
- [x] Custom domain at [predictwc.xyz](https://predictwc.xyz)
- [ ] Knockout-round bracket population (auto-populates after June 27)
- [ ] Real-time score updates via Ably (cron broadcasts already exist)
- [ ] Tournament-end leaderboard rewards

---

Built by [@Afghanistan8](https://github.com/Afghanistan8) ([@Asuzu_a](https://twitter.com/Asuzu_a)).
