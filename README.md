# EPL '27 Predict

**A fully on-chain, pari-mutuel prediction market for the 2026/27 English Premier League — settled by AI consensus on [GenLayer](https://genlayer.com) Bradbury testnet, with no oracle, no backend resolver, and no admin keys touching the money.**

🔗 **Live:** [epl27-predict.vercel.app](https://epl27-predict.vercel.app)

---

## Why I built this

I built a version of this for the 2026 World Cup first. When the tournament ended I wanted to keep the idea alive, and the Premier League turned out to be a far better fit — so I ported the whole thing to the 2026/27 EPL season and rebuilt the parts that were fighting the World Cup format.

Three reasons the EPL is the right home for this design:

- **Home/away/draw is native.** Every Premier League match has a real home side playing at their own ground. The pari-mutuel `home / draw / away` model fits perfectly instead of being a compromise for neutral-venue group games.
- **The fixtures are fixed.** All 380 fixtures are published before the season and never change into a bracket. No "winner of Group C plays runner-up of Group D" unknowns to model.
- **A full season to iterate on.** 38 matchdays means I can roll out contracts in waves, watch resolution behave against real results, and improve the pipeline as the season runs.

The core belief hasn't changed since the World Cup build: **a prediction market shouldn't need a trusted oracle.** GenLayer lets the contract itself read the web and reach consensus on what happened. That's the whole thing.

---

## Responding to the WC'26 staff feedback

The GenLayer team reviewed my World Cup build and raised specific points. Here's how EPL'27 answers each, directly:

- **"home/away don't apply to a World Cup with neutral venues."** In the EPL every fixture has a real home side at their own ground, so `home / draw / away` is the *native* model, not a workaround. It's baked into the contract, the pools, and resolution.
- **"matches are hardcoded — what happens when the group phase ends? where do you fetch these from?"** All 380 fixtures are published before the season and never restructure into a bracket. I pull them from football-data.org with `generate_fixtures.py` into `fixtures.json`, then deploy per matchday. They're "hardcoded" only in the sense that each match is its own immutable contract — which is the point (one match, one market, one settlement).
- **"cross-check against multiple sources."** Done. `resolve()` now renders **both BBC Sport and ESPN** and only settles on a result the two agree on; a conflict returns `winner = -1` and leaves the match open to retry. See "How it works" below.
- **"open markets around everything before/during/after a match."** Added the **AI Call** (validators' own pre-match prediction, on-chain) and a **live league table** tab alongside the crowd's pari-mutuel pools.

I also hardened the things a reviewer would poke at: team-name normalization in the resolution prompt (so "Man Utd" and "Manchester United" resolve the same match), a public-but-grief-resistant `resolve()`, integer-division dust that's swept to the final claimant instead of being locked, a clearly-bounded admin power that can only trigger refunds, and Supabase writes that are now chain-verified server-side so nobody can forge leaderboard rows.

---

## What it does

- Anyone with test GEN can stake on the outcome of any deployed Premier League fixture — **home win, draw, or away win** — with a 2 GEN minimum.
- Every match is its own **Intelligent Contract** holding three pools (home/draw/away). Stakes go into the pool for your pick.
- After kickoff, the contract **reads the full-time score straight off BBC Sport** and resolves itself through validator consensus. Winners split the entire pot pro-rata. No rake, no house edge.
- Separately, GenLayer's validators publish their **own pre-match prediction** ("the AI Call") for each fixture, stored on-chain, shown next to the crowd's pools so you can see where the machine and the market disagree.
- A live **Premier League table** and a **leaderboard** of the sharpest predictors round it out.

Everything the money touches lives on-chain. Supabase is only a fast read-mirror so the UI loads instantly — it is never the source of truth.

---

## How it works under the hood

### 1. The contract reads the web itself

In `prediction_market.py`, resolution renders the live scoreboard *inside* the contract execution — from **two independent sources**, BBC Sport (primary) and ESPN (secondary):

```python
primary   = gl.nondet.web.render(self.resolution_url,   mode="text")  # BBC
secondary = gl.nondet.web.render(self.resolution_url_2, mode="text")  # ESPN
```

There is no oracle service, no off-chain job pushing scores in, no trusted signer. The web pages **are** the source of truth, fetched by the validators at the moment of resolution. The prompt bases the result on the primary, uses the secondary as a cross-check, and returns "not resolved" (leaving the match open) if the two clearly disagree — so a single bad read can't settle a market. Team names are normalized in the prompt ("Man Utd" = "Manchester United", "Spurs" = "Tottenham", …) so minor spelling differences between sources still match the same fixture.

### 2. AI consensus turns a messy web page into a settled result

The score is extracted by an LLM, and the result only finalizes if the validators independently agree on the same structured answer:

```python
result_json = gl.eq_principle.strict_eq(get_match_result)
```

A final score is an objective fact, so I use **strict equivalence** here — every validator must arrive at the identical `{score, winner}` JSON or nothing is written. If the match hasn't finished, `winner` comes back `-1` and the contract simply stays open to retry later.

### 3. The AI Call — validators forecasting, not just reporting

`ai_predictor.py` is a separate, single contract for the whole season. Before a match, it asks the network for a *prediction*, using the **non-comparative** equivalence principle:

```python
raw = gl.eq_principle.prompt_non_comparative(
    gather_evidence,           # returns the input the LLM reasons over
    task="...",                # "predict this fixture's outcome"
    criteria="...",            # "is this a defensible home/draw/away call?"
)
```

The leader validator produces a pick + confidence + one-line reason; the other validators judge whether that answer is defensible against fixed criteria, rather than each re-running the whole forecast. This is deliberately lighter on Bradbury's small validator set than forcing every validator to independently re-predict, and "is this call reasonable?" is the right question to reach consensus on for a subjective judgement. The pick is parsed and normalized deterministically after consensus so a stray capital letter or code fence can't revert a good prediction.

> **Note on the two equivalence principles:** resolution uses `strict_eq` (there is one correct score); the AI Call uses `prompt_non_comparative` (a prediction is a judgement). Getting this distinction right was the difference between the AI Call working and silently never storing anything.

### What this replaces

| Traditional approach | This project |
|---|---|
| Chainlink or a paid feed for sports scores | Free, read directly from BBC Sport |
| A backend service pushing results on-chain | No backend — the contract resolves itself |
| An admin clicking "resolve" | Fully autonomous, driven by cron |
| A single trusted oracle | Multiple validators reaching consensus |

---

## Architecture

```
                 ┌────────────────────────────────────────────┐
                 │  Frontend (epl27-predict.vercel.app)         │
                 │  reads mirror ▼        writes via wallet ▼    │
                 └──────────┬──────────────────────┬────────────┘
                            │                       │
                   Supabase (read-mirror)     GenLayer Bradbury
                            ▲                  ┌──────────────────┐
                            │                  │ 50 market        │
                            │                  │ contracts (MD1-5)│
        ┌───────────────────┴───────┐          │ 1 AI predictor   │
        │  Cron (epl27-predict-cron) │─writes──▶└──────────────────┘
        │  /api/resolve-matches  10m │             ▲
        │  /api/predict-matches  30m │─────────────┘
        │  /api/standings         3h │──▶ BBC Sport (league table)
        │  /api/live-scores       5m │──▶ football-data.org (live scores)
        └────────────────────────────┘
        scheduled by cron-job.org (Bearer CRON_SECRET)
```

**Trust flow:** the contracts are the source of truth. Cron writes to the contracts and mirrors public state into Supabase. The frontend reads Supabase for speed and reads the contracts directly for pools; it only ever writes through the user's own wallet.

---

## Repository layout

```
epl27-predict/
├── prediction_market.py      # per-match Intelligent Contract (pari-mutuel + BBC resolution)
├── ai_predictor.py           # single AI Call contract (pre-match predictions)
├── deploy.js                 # deploys market contracts (--matchday N, resumable checkpoint)
├── deploy-ai.js              # deploys the AI predictor (one-time)
├── generate_fixtures.py      # pulls real 2026/27 fixtures from football-data.org → fixtures.json
├── fixtures.json             # MD1–5, 50 fixtures with kickoff times + external IDs
├── schema.sql                # complete Supabase schema + RLS (single paste)
├── frontend/                 # canonical app — vanilla HTML/CSS/JS, no build step
│   ├── index.html
│   ├── app.js                # router, match list, match detail, My Picks, Leaderboard, Table
│   ├── lib/
│   │   ├── config.js         # Bradbury params + Supabase publishable key
│   │   ├── wallet.js         # EIP-6963 wallet chooser + chain guard
│   │   ├── contract.js       # genlayer-js reads/writes against markets
│   │   ├── supabase.js       # read-mirror queries
│   │   └── crests.js         # club crest mapping (football-data CDN)
│   └── style.css             # EPL purple/magenta theme, light + dark
├── web/                      # secondary Next.js + RainbowKit build of the same app
└── cron/
    ├── api/resolve-matches.js
    ├── api/predict-matches.js
    ├── api/standings.js
    ├── api/live-scores.js
    └── vercel.json
```

---

## The market contract (`prediction_market.py`)

One deployed instance per fixture. Immutable — team names and date are set in the constructor and never change.

```python
submit_prediction(pick)   # payable; min 2 GEN; pick ∈ {home, draw, away}; one per wallet
resolve()                 # reads BBC + ESPN, reaches consensus, settles the pools
claim()                   # winning predictor pulls their pari-mutuel share (last claimer sweeps dust)
refund()                  # reclaim stake when a match goes to the refund path
mark_postponed()          # admin-only, refund-only escape hatch (cannot take funds)
```

> The multi-source resolution, dust sweep, name-normalization and postponement guard described here are live: all 50 MD1–5 contracts were (re)deployed from this revision of `prediction_market.py` before the season, so the on-chain code matches this document exactly.

**Payout:**

```
payout = your_stake × (total_pool / winning_pool)
```

No cut is taken. The winning side splits the entire pot in proportion to stake.

**Read views** (used by the UI): `get_match_info()`, `get_pools()`, `get_my_prediction(user)`, `expected_payout(user)`, `get_contract_balance()`.

**Refund edge cases** — either of these routes everyone to `refund()` so nothing is ever stuck:
- **Nobody** picked the winning outcome (winning pool = 0).
- **Everybody** picked the winning outcome (winning pool = whole pot), which would otherwise be a no-op payout.

---

## The AI Call contract (`ai_predictor.py`)

A single contract for the entire season, keyed by the same `match_id` the markets use so the two line up in the UI.

```python
predict(match_id, home, away, date)   # admin/cron only, idempotent per fixture
reset(match_id)                        # admin: clear a prediction to re-run it
set_source(url)                        # admin: change the evidence source
get_prediction(match_id)               # → {has_prediction, pick, confidence, reason, ...}
has_prediction(match_id) / get_source()
```

It holds no funds and never pays out — its blast radius is zero. It exists purely to publish GenLayer's own read on each match before kickoff.

**Deployed at:** `0xa9d1dfA3cC8F9B566F823D2d6e7bCaA45aAE2Be2` (Bradbury)

---

## Data & the cron backend

Bradbury reads only reflect **finalized** state, which can lag minutes to hours, so a small cron layer keeps the mirror fresh and drives the autonomous behaviour. All four endpoints require an `Authorization: Bearer <CRON_SECRET>` header and are pinged by [cron-job.org](https://cron-job.org):

| Endpoint | Cadence | What it does |
|---|---|---|
| `/api/resolve-matches` | ~10 min | Submits `resolve()` for finished matches; polls consensus on later ticks; retries stuck ones |
| `/api/predict-matches` | ~30 min | Fires `predict()` on the AI contract ~1 day before kickoff; mirrors stored picks |
| `/api/standings` | ~3 hours | Scrapes the **BBC Sport** league table → `standings` |
| `/api/live-scores` | ~5 min | Pulls live scores from football-data.org, mirrors + broadcasts via Ably |

**On standings:** I originally pulled the table from football-data.org, but its free tier serves *stale prior-season* standings until the new season actually kicks off — it was showing relegated clubs and 38 games played. I switched `standings.js` to scrape BBC Sport directly (the same source the contracts resolve against), which carries the correct 2026/27 clubs. Crests are mapped onto the football-data CDN so badges match the rest of the app.

**Supabase** holds `matches`, `pools`, `users`, `predictions`, `resolutions_log`, `standings`, and `ai_predictions`. RLS allows public reads and the specific writes the frontend needs (mirroring your own prediction after you sign it); everything else is service-key only. `schema.sql` sets all of it up in one paste.

---

## Frontend & wallet

The canonical frontend (`frontend/`) is deliberately plain: vanilla HTML/CSS/JS, no framework, no build step. Hash router, five views — **Matches**, **Match detail** (with pools + the AI Call panel), **Table**, **My Picks**, **Leaderboard** — in an EPL purple/magenta theme with light and dark modes.

**Wallet connection** was the hardest part to get right, and worth explaining because it's a common GenLayer footgun:

- Connection uses an **EIP-6963 wallet chooser** — every installed extension (MetaMask, OKX, Phantom, Rabby, …) announces itself and the user explicitly picks one, instead of the app guessing at `window.ethereum`. With several wallets installed, guessing signs from the wrong account.
- Before any signed transaction, the app **forces the wallet onto Bradbury (chain 4221)** — trying `wallet_switchEthereumChain`, adding the network on 4902/-32603, then re-reading `eth_chainId` to *verify* rather than trusting the promise.
- Critically, the chosen provider is passed to genlayer-js as a **top-level `provider`** on `createClient`. genlayer-js builds its own transport and ignores a viem-style `transport` key — passing it the wrong way makes it silently fall back to `window.ethereum`, which is what caused both the "wrong wallet" bug and a `Wallet is on chain 61999 but client is configured for chain 4221` error at signing. Passing `provider` top-level makes the chain check *and* the signature use the exact wallet you picked.

`web/` is a secondary Next.js + RainbowKit build of the same app for anyone who prefers that stack. Both talk to the identical contracts and Supabase project.

---

## Running it locally

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env      # fill in the vars below

# 3. Generate the fixtures (live from football-data.org)
python generate_fixtures.py

# 4. Set up Supabase — paste schema.sql into the SQL editor once

# 5. Deploy contracts (resumable; a matchday at a time keeps runs short)
node deploy.js --matchday 1
node deploy.js               # or every remaining fixture
node deploy-ai.js            # the AI Call contract (one-time)

# 6. Frontend (no build step)
cd frontend && python -m http.server 8080

# 7. Cron endpoints
cd cron && vercel deploy --prod
```

**Server env (`.env`):**

```
PRIVATE_KEY              # deploy + resolve + predict wallet (must be the AI contract admin)
AI_PREDICTOR_ADDRESS     # deployed AIPredictor address
SUPABASE_URL             # EPL Supabase project URL
SUPABASE_SERVICE_KEY     # sb_secret_… — backend/cron only, bypasses RLS
FOOTBALL_DATA_API_KEY    # fixtures + live scores (free at football-data.org)
ABLY_API_KEY             # real-time score broadcast
CRON_SECRET              # bearer token cron-job.org sends to the endpoints
```

The frontend also needs the Supabase **publishable** key (`sb_publishable_…`) in `frontend/lib/config.js` — the RLS-restricted key that's safe to ship in the browser.

---

## What works today

- ✅ **50 market contracts** live on Bradbury for matchdays 1–5 (21 Aug – 20 Sep 2026), deployed via a resumable checkpoint.
- ✅ **AI Call contract** deployed; pre-match predictions fire and store on-chain.
- ✅ **Staking works end-to-end** — connect wallet → pick a side → sign → the 2 GEN stake lands on-chain with the correct value (verified on the Bradbury explorer).
- ✅ **Wallet chooser** across MetaMask / OKX / Phantom / Rabby, with automatic Bradbury network switching.
- ✅ **My Picks & Leaderboard** — pulling your predictions and ranking predictors (client-side joins, no fragile PostgREST embeds).
- ✅ **Live Premier League table** from BBC Sport with the correct 2026/27 clubs, refreshing every ~3 hours.
- ✅ **Resolution, prediction, standings and live-score crons** deployed and scheduled.
- ✅ **Supabase mirror** with full schema + RLS.

## Known limitations / honest caveats

- **Bradbury finality is slow and occasionally stalls.** A stake can sit in `PROPOSING` for minutes to hours before it finalizes, so pools and My Picks update on a lag — and during a network stall (I hit one mid-build) nothing finalizes until validators recover. This is the testnet, not the app.
- **Only MD1–5 are deployed.** The remaining matchdays (6–38) are a rolling deployment as the season progresses.
- **AI Call badges are sparse until close to kickoff** — the cron only predicts a fixture ~1 day before it's played (or when I fire it manually).
- **Pre-season the table and leaderboard read zeros** — correct behaviour before any match is played; they fill in once results come in.
- **Resolution reads BBC (primary) + ESPN (secondary)** and only settles when they agree; if ESPN can't be rendered it falls back to BBC alone. A large markup change on the *primary* would still need the parser looked at.
- **Testnet only.** GEN here has no real value. Nothing about this is financial advice or a real-money product.

---

## MD1–5 contracts — verify on the explorer

Every match is its own contract. The 50 for matchdays 1–5 are deployed on Bradbury from the admin wallet `0x4184bc5E5444F250767E8D33A49817A9B4FB0df3`. Matchday 1's ten (open [explorer-bradbury.genlayer.com](https://explorer-bradbury.genlayer.com) → paste an address → read `get_match_info` / `get_pools`):

| Match | Contract |
|---|---|
| Arsenal v Coventry City | `0x9c7D8791659f8F4957fC1B7130eaB78755FEe4aA` |
| Hull City v Manchester United | `0x7B3d8e6d39b042AD7443188b6aDae28C9A573d28` |
| Ipswich v Sunderland | `0x457d137b5cDD904b0FdeCC6A6CeC59a2d633EDD4` |
| Nottingham Forest v Leeds United | `0x9BE6E6A8Bad0bE0905aC23A61DAffEABb553aF7E` |
| Everton v Crystal Palace | `0x3eE3f649719DED34abF6169C66BC337e67f14b96` |
| Brentford v Tottenham | `0x55a6a4F0658d37C32867Afbe6B8889d082510a18` |
| Manchester City v Bournemouth | `0xB866a785E0267Bfc0868aD74c2499D843bE3D889` |
| Brighton v Aston Villa | `0x5bcB1Db6B08E321689872407F73e676F2224C283` |
| Newcastle v Liverpool | `0xc800810E64b98d2bB4DeC798616F2482031D11A9` |
| Fulham v Chelsea | `0x66fdee331474930504cF4D126a0a7BCDf02d7dC3` |

The full 50 (MD1–5) are in `deploy_checkpoint.json`. The **AI Call** contract is `0xa9d1dfA3cC8F9B566F823D2d6e7bCaA45aAE2Be2`.

---

## Roadmap

- [x] MD1–5 (50 contracts) deployed on Bradbury
- [x] AI Call contract + auto-predict cron
- [x] BBC-sourced live league table
- [x] Resolution cron with two-phase consensus polling + retry
- [x] Live scores cron + Supabase mirror
- [x] Wallet chooser, chain-switch guard, end-to-end staking
- [x] Match list, match detail, AI Call, Table, My Picks, Leaderboard
- [x] Multi-source resolution cross-check (BBC + ESPN) + team-name normalization
- [x] Chain-verified Supabase writes (no public forgery of leaderboard rows)
- [ ] Roll out MD6→MD38 as the season runs
- [ ] Surface live scores in the UI in real time via Ably (cron already broadcasts)
- [ ] Custom domain

---

## Built with

**GenLayer** (Intelligent Contracts in Python, LLM consensus, in-contract web rendering) · **genlayer-js** · **Vercel** (frontend + serverless cron) · **Supabase** (Postgres read-mirror) · **cron-job.org** (sub-daily scheduling) · **Ably** (real-time broadcasts) · **football-data.org** (fixtures + live scores) · **BBC Sport** (resolution + league table) · **RainbowKit + wagmi** (the Next.js build) · **vanilla HTML/CSS/JS** (the canonical frontend).

---

Built by [@Afghanistan8](https://github.com/Afghanistan8) ([@Asuzu_a](https://twitter.com/Asuzu_a)) — testnet only, no real value.
