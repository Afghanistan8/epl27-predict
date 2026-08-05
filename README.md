# EPL '27 Predict

**A decentralized, pari-mutuel prediction market for the 2026/27 English Premier League, built on [GenLayer](https://genlayer.com) Bradbury testnet.**

---

## What it is

EPL '27 Predict lets anyone stake GEN test tokens on the outcome of every Premier League match this season — home win, draw, or away win. Each match gets its own Intelligent Contract that, after the final whistle, **reads the score directly from BBC Sport via LLM consensus** and pays out winners automatically. No human resolver, no oracle, no admin keys.

50 contracts are already deployed for matchdays 1–5 (21 Aug – 20 Sep 2026), with the rest of the 380-match season to follow matchday by matchday.

---

## Why the EPL is a better fit for this than the World Cup

The GenLayer team reviewed my WC '26 build and praised the oracle-free pari-mutuel design. Their feedback pointed to exactly the things EPL fixes:

- **Home/away is native** — every EPL match has a real home side at their own ground, so the home/draw/away model works perfectly, not as a compromise.
- **All 380 fixtures are published upfront** — released on 19 Jun 2026, never change. No knockout-bracket unknowns.
- **A full season** — 38 matchdays of rolling contract deployments means the architecture can be tested and improved across every matchday.

---

## Why GenLayer

### 1. The contract reads the web

In `prediction_market.py`, the contract fetches the BBC Sport scoreboard during resolution:

```python
web_data = gl.nondet.web.render(resolution_url, mode="text")
```

No oracle. No off-chain pusher. The BBC Sport page itself is the source of truth — scraped by the validators at resolution time.

### 2. AI consensus on ambiguous data

The score is extracted by an LLM, with multiple validators reaching the same structured JSON or it does not finalize:

```python
result_json = gl.eq_principle.strict_eq(get_match_result)
```

Objective fact (final score of a match) → strict equivalence is the right call here.

### 3. AI Call: validators predict before kickoff

Beyond resolving results, a separate `AIPredictor` contract uses the **non-comparative** equivalence principle to reach consensus on a *predicted* outcome before the match. The leader LLM produces a pick; validators judge whether it is defensible — without each re-running the forecast. That pick is stored on-chain and shown in the frontend next to the crowd's pari-mutuel pools.

```python
raw = gl.eq_principle.prompt_non_comparative(
    gather_evidence,
    task="...",
    criteria="...",
)
```

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
                                  |   (football-data.org → Supabase)
              +-------------------+
              |
       Cron endpoints (Vercel + cron-job.org)
       /api/resolve-matches  — every 10 min
       /api/predict-matches  — every 30 min (AI Call)
       /api/standings        — every 3 hours
       /api/live-scores      — every 5 min
```

### Components

- **`prediction_market.py`** — Intelligent Contract, one per match. Pari-mutuel pools, BBC Sport resolution via LLM consensus, claim/refund paths.
- **`ai_predictor.py`** — Single Intelligent Contract for the whole season. Stores GenLayer's own predicted pick per fixture before kickoff.
- **`deploy.js`** — Deploys market contracts matchday by matchday, resumable via checkpoint. `--matchday N` flag for targeted runs.
- **`generate_fixtures.py`** — Pulls live fixture data from football-data.org and writes `fixtures.json`.
- **`fixtures.json`** — All 50 matchday 1–5 fixtures (real 2026/27 teams, kickoff times from football-data.org).
- **`frontend/`** — Vanilla HTML/CSS/JS, no build step. Match list, match detail, AI Call badge, live PL table, My Picks, Leaderboard.
- **`cron/api/live-scores.js`** — Pulls live scores from football-data.org, mirrors to Supabase, broadcasts via Ably.
- **`cron/api/resolve-matches.js`** — Submits `resolve()` calls after matches end; polls LLM consensus in later ticks.
- **`cron/api/predict-matches.js`** — Submits `predict()` to AIPredictor ~1 day before kickoff; polls for finalized picks.
- **`cron/api/standings.js`** — Pulls the live PL table from football-data.org, mirrors to Supabase.
- **Supabase** — Read-mirror of on-chain state. Frontend reads Supabase for sub-second loads; contracts remain the source of truth.

---

## Market contract

```python
submit_prediction(pick)   # payable; min 2 GEN; pick in {home, draw, away}
resolve()                 # triggers LLM consensus on BBC Sport
claim()                   # pari-mutuel payout to winning predictors
refund()                  # refund path when winning pool is 0% or 100%
mark_postponed()          # admin-only escape hatch
```

### Payout formula

```
payout = stake × (total_pool / winning_pool)
```

No house cut. No rake. Winners split the whole pool pro-rata.

### Read views

```python
get_match_info()           -> {team1, team2, game_date, status, result, final_score, admin}
get_pools()                -> {home, draw, away, total}
get_my_prediction(user)    -> {has_predicted, pick, stake, claimed}
expected_payout(user)      -> u256
```

### Refund edge cases

- **0% of the pool** picked correctly → refund everyone
- **100% of the pool** picked correctly → refund everyone

No balance is ever stuck in the contract.

---

## AI Call contract

```python
predict(match_id, home, away, date)   # admin/cron only; idempotent per fixture
reset(match_id)                       # admin: clear a prediction to re-run
set_source(url)                       # admin: update the evidence source
```

### Read views

```python
get_prediction(match_id)   -> {has_prediction, match_id, home, away, date, pick, confidence, reason}
has_prediction(match_id)   -> bool
get_source()               -> str
```

**Deployed at:** `0xa9d1dfA3cC8F9B566F823D2d6e7bCaA45aAE2Be2` (Bradbury)

---

## Network

- **GenLayer Bradbury testnet** (chain ID 4221)
- RPC: `https://rpc-bradbury.genlayer.com`
- Explorer: [explorer-bradbury.genlayer.com](https://explorer-bradbury.genlayer.com)
- Faucet: [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation)

50 market contracts deployed for MD1–5. All non-upgradeable.

---

## Running locally

```powershell
# 1. Install deps
npm install

# 2. Set env vars
Copy-Item .env.example .env
# Fill in PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY,
# FOOTBALL_DATA_API_KEY, CRON_SECRET, ABLY_API_KEY

# 3. Generate fixtures (pulls live from football-data.org)
python generate_fixtures.py

# 4. Deploy market contracts (resumable; ~2 min per contract on Bradbury)
node deploy.js --matchday 1   # one matchday at a time
node deploy.js                 # or all at once

# 5. Deploy AI Call contract (one-time)
node deploy-ai.js

# 6. Frontend (vanilla JS, no build step)
cd frontend
python -m http.server 8080

# 7. Cron endpoints (Vercel)
cd cron
vercel deploy --prod
```

Required env vars:

```
PRIVATE_KEY              # deploy + resolve + predict wallet (must be AIPredictor admin)
AI_PREDICTOR_ADDRESS     # deployed AIPredictor address
SUPABASE_URL             # EPL Supabase project URL
SUPABASE_SERVICE_KEY     # sb_secret_… (cron writes)
FOOTBALL_DATA_API_KEY    # live scores + standings (free at football-data.org)
ABLY_API_KEY             # real-time score broadcast
CRON_SECRET              # bearer token for cron-job.org pings
```

Frontend (`frontend/lib/config.js`) also needs the Supabase **publishable** key (`sb_publishable_…`) — the read-only key safe to ship in the browser.

---

## Schema

Run `schema.sql` once in the Supabase SQL editor to create all tables (`matches`, `pools`, `users`, `predictions`, `resolutions_log`, `standings`, `ai_predictions`) with correct RLS policies.

---

## Built with

- **GenLayer** — Intelligent Contracts (Python), LLM consensus, web rendering
- **genlayer-js** — TypeScript SDK for deploys and reads
- **Vercel** — frontend hosting + serverless cron endpoints
- **Supabase** — Postgres read-mirror for fast frontend
- **cron-job.org** — sub-daily cron pings (Vercel free tier only runs daily)
- **Ably** — real-time score broadcasts
- **football-data.org** — fixtures, live scores, standings API
- **Vanilla HTML/CSS/JS** — no framework, no build step on the frontend
- **OKX Wallet / MetaMask** — EIP-1193 wallet integration

---

## Season roadmap

- [x] MD1–5 (50 contracts) deployed on Bradbury
- [x] AI Call contract deployed; one prediction verified end-to-end
- [x] Live scores cron + Supabase mirror
- [x] Resolution cron with two-phase LLM polling + retry
- [x] Auto-predict cron (~1 day before kickoff)
- [x] Live PL table tab (football-data.org → Supabase)
- [x] Frontend: match list, AI Call badge, Table tab, My Picks, Leaderboard
- [ ] MD6+ contracts (rolling deployment each matchday)
- [ ] Real-time score updates via Ably in the frontend
- [ ] Multi-source cross-check on resolution (BBC + ESPN)

---

Built by [@Afghanistan8](https://github.com/Afghanistan8) ([@Asuzu_a](https://twitter.com/Asuzu_a)).
