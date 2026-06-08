/* WC '26 Predict — main entrypoint */

import { showToast, attachAsyncSubmit } from './lib/ui.js';
import {
  subscribe as subscribeWallet,
  getState as getWalletState,
  connect as connectWallet,
  disconnect as disconnectWallet,
  switchToStudionet,
  trySilentReconnect,
  hasMetaMask,
  shortAddress,
} from './lib/wallet.js';
import {
  sb,
  getUsername,
  createUser,
  usernameExists,
  getMatches,
  getMatch,
  getMyPredictions,
  getLeaderboard,
} from './lib/supabase.js';
import {
  readPools,
  computeExpectedPayout,
  submitPrediction,
  claim,
  refund,
  toWei,
  fromWei,
  formatGen,
} from './lib/contract.js';
import { MIN_STAKE_GEN } from './lib/config.js';
import { flagImg } from './lib/flags.js';

// ─────────────────────────────────────────────────────────── THEME

const root = document.documentElement;
function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  localStorage.setItem('wc-theme', theme);
}
(function initTheme() {
  const saved = localStorage.getItem('wc-theme');
  if (saved) applyTheme(saved);
  else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) applyTheme('light');
})();
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = root.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ─────────────────────────────────────────────────────────── WALLET UI

const walletBtn = document.getElementById('wallet-button');
const walletLabel = walletBtn.querySelector('.wallet-label');
let currentUsername = null;

subscribeWallet(async (state) => {
  if (!state.address) {
    walletBtn.dataset.state = 'disconnected';
    walletLabel.textContent = 'Connect wallet';
    currentUsername = null;
    return;
  }
  if (!state.isStudionet) {
    walletBtn.dataset.state = 'connected';
    walletLabel.textContent = 'Wrong network';
    walletBtn.title = 'Click to switch to Bradbury';
    return;
  }
  walletBtn.dataset.state = 'connected';
  walletBtn.title = '';
  currentUsername = await getUsername(state.address);
  if (currentUsername) {
    walletLabel.textContent = currentUsername;
  } else {
    walletLabel.textContent = shortAddress(state.address);
    document.getElementById('username-modal').hidden = false;
  }
  render();
});

walletBtn.addEventListener('click', async () => {
  const state = getWalletState();
  if (!state.address) {
    if (!hasMetaMask()) { showToast('No wallet detected. Install OKX or MetaMask.', 'error'); return; }
    try { await connectWallet(); showToast('Wallet connected'); }
    catch (err) { showToast(err.message || 'Connect rejected', 'error'); }
    return;
  }
  if (!state.isStudionet) {
    try { await switchToStudionet(); showToast('Switched to Bradbury'); }
    catch (err) { showToast('Network switch declined', 'error'); }
    return;
  }
  const ok = confirm(`Disconnect ${currentUsername || shortAddress(state.address)}?`);
  if (ok) { disconnectWallet(); showToast('Disconnected'); }
});

// ─────────────────────────────────────────────────────────── USERNAME MODAL

const usernameForm = document.getElementById('username-form');
const usernameInput = document.getElementById('username-input');
const usernameError = document.getElementById('username-error');

attachAsyncSubmit(usernameForm, async () => {
  const value = usernameInput.value.trim();
  usernameError.hidden = true;
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
    usernameError.textContent = '3–20 characters, letters/numbers/underscore only.';
    usernameError.hidden = false; return;
  }
  const taken = await usernameExists(value);
  if (taken) { usernameError.textContent = 'That username is taken.'; usernameError.hidden = false; return; }
  const state = getWalletState();
  if (!state.address) { usernameError.textContent = 'Wallet not connected.'; usernameError.hidden = false; return; }
  await createUser(state.address, value);
  currentUsername = value;
  walletLabel.textContent = value;
  document.getElementById('username-modal').hidden = true;
  showToast(`Welcome, ${value}`);
  render();
});

// ─────────────────────────────────────────────────────────── ROUTER

const routes = ['home', 'match', 'me', 'leaderboard'];
function parseRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home', params: {} };
  if (parts[0] === 'match' && parts[1]) return { name: 'match', params: { id: parts[1] } };
  if (parts[0] === 'me') return { name: 'me', params: {} };
  if (parts[0] === 'leaderboard') return { name: 'leaderboard', params: {} };
  return { name: 'home', params: {} };
}
function render() {
  const route = parseRoute();
  routes.forEach((name) => {
    const el = document.getElementById('page-' + name);
    if (el) el.hidden = name !== route.name;
  });
  document.querySelectorAll('[data-route]').forEach((el) => {
    if (el.tagName === 'A') el.classList.toggle('is-active', el.dataset.route === route.name);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (route.name === 'home') renderHome();
  if (route.name === 'match') renderMatchDetail(route.params.id);
  if (route.name === 'me') renderMyPicks();
  if (route.name === 'leaderboard') renderLeaderboard();
}
window.addEventListener('hashchange', render);

// ─────────────────────────────────────────────────────────── HOME

let cachedMatches = null;
let currentFilter = 'upcoming';

async function loadMatches() {
  try { cachedMatches = await getMatches(); }
  catch (e) { console.error(e); cachedMatches = []; showToast("Couldn't load matches", 'error'); }
  return cachedMatches;
}

function filterMatches(matches, filter) {
  const now = Math.floor(Date.now() / 1000);
  if (filter === 'today') {
    const s = new Date(); s.setHours(0,0,0,0);
    const e = new Date(); e.setHours(23,59,59,999);
    return matches.filter(m => m.kickoff_ts >= s.getTime()/1000 && m.kickoff_ts <= e.getTime()/1000);
  }
  if (filter === 'upcoming') return matches.filter(m => m.kickoff_ts > now && m.status === 'scheduled');
  if (filter === 'live') return matches.filter(m => m.status === 'live');
  if (filter === 'finished') return matches.filter(m => m.status === 'finished' || m.status === 'resolved');
  return matches;
}

async function renderHome() {
  if (!cachedMatches) await loadMatches();
  const matches = cachedMatches || [];
  document.getElementById('stat-matches').textContent = matches.length || '—';
  // Get total predictions from supabase
  try {
    const { count, error } = await sb.from('predictions').select('*', { count: 'exact', head: true });
    if (!error) document.getElementById('stat-predictions').textContent = count || '0';
  } catch {}
  document.getElementById('stat-volume').textContent = '0';
  const filtered = filterMatches(matches, currentFilter);
  const list = document.getElementById('match-list');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No matches to show for "${currentFilter}".</div>`;
    return;
  }
  list.innerHTML = filtered.map(matchCardHtml).join('');
}

function matchCardHtml(m) {
  const date = new Date(m.kickoff_ts * 1000);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const stageLabel = m.group_letter ? `Group ${m.group_letter}` : (m.stage || 'WC 26');
  const homeScore = m.live_score_home ?? '—';
  const awayScore = m.live_score_away ?? '—';
  return `
    <a href="#/match/${m.match_id}" class="match-card" data-status="${m.status}">
      <div class="match-meta">
        <span class="match-stage">${stageLabel}</span>
        <span class="match-time">${dateLabel} · ${timeLabel}</span>
      </div>
      <div class="match-teams">
        <div class="match-team">${flagImg(m.home, 40, 'team-flag')}<span class="team-name">${m.home}</span><span class="team-score">${m.status === 'scheduled' ? '—' : homeScore}</span></div>
        <div class="match-team">${flagImg(m.away, 40, 'team-flag')}<span class="team-name">${m.away}</span><span class="team-score">${m.status === 'scheduled' ? '—' : awayScore}</span></div>
      </div>
    </a>
  `;
}

document.getElementById('filter-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-tab');
  if (!btn) return;
  document.querySelectorAll('#filter-tabs .filter-tab').forEach((t) => t.classList.remove('is-active'));
  btn.classList.add('is-active');
  currentFilter = btn.dataset.filter;
  renderHome();
});

// ─────────────────────────────────────────────────────────── MATCH DETAIL

let currentMatch = null;
let currentPools = { home: 0n, draw: 0n, away: 0n, total: 0n };
let currentPick = null;
let myPrediction = null;

async function readMyPredictionFromSupabase(matchId, userAddress) {
  if (!userAddress) return null;
  try {
    const { data, error } = await sb
      .from('predictions')
      .select('*')
      .eq('match_id', matchId)
      .ilike('user_address', userAddress)
      .maybeSingle();
    if (error) {
      console.warn('readMyPredictionFromSupabase error:', error.message);
      return null;
    }
    if (!data) return null;
    return {
      pick: data.pick,
      stake: BigInt(data.stake_wei),
      claimed: Boolean(data.claimed),
      refunded: Boolean(data.refunded),
      tx_hash: data.tx_hash,
    };
  } catch (e) {
    console.warn('readMyPredictionFromSupabase exception:', e.message);
    return null;
  }
}

async function renderMatchDetail(matchId) {
  const el = document.getElementById('match-detail');
  el.innerHTML = '<div class="empty-state">Loading match…</div>';

  try {
    currentMatch = await getMatch(matchId);
    if (!currentMatch) {
      el.innerHTML = '<div class="empty-state">Match not found.</div>';
      return;
    }
  } catch (e) {
    el.innerHTML = '<div class="empty-state">Couldn\'t load match.</div>';
    return;
  }

  // Read on-chain pools (this works)
  try {
    currentPools = await readPools(currentMatch.contract_address);
  } catch (e) {
    console.warn('pool read failed:', e.message);
    currentPools = { home: 0n, draw: 0n, away: 0n, total: 0n };
  }

  // Read my prediction from Supabase (not from contract — contract read fails)
  const state = getWalletState();
  myPrediction = null;
  if (state.address) {
    myPrediction = await readMyPredictionFromSupabase(matchId, state.address);
  }

  el.innerHTML = matchDetailHtml(currentMatch, currentPools, myPrediction, state);
  attachMatchDetailEvents();
}

function matchDetailHtml(m, pools, mine, state) {
  const date = new Date(m.kickoff_ts * 1000);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const stageLabel = m.group_letter ? `Group ${m.group_letter}` : (m.stage || '');

  const total = Number(pools.total) || 0;
  const isResolved = m.status === 'resolved' || m.status === 'finished';
  const isRefunding = m.status === 'refunding' || m.status === 'postponed';
  const canPredict = m.status === 'scheduled' && !mine;
  const liveScore = (m.status === 'live' || m.status === 'finished' || m.status === 'resolved')
    ? `<span class="live-score-display">${m.live_score_home ?? 0} <span class="live-score-sep">·</span> ${m.live_score_away ?? 0}</span>`
    : '';
  const statusBadge = m.status === 'live'
    ? `<span class="status-badge is-live">LIVE${m.live_minute ? ` · ${m.live_minute}` : ''}</span>`
    : isResolved
      ? `<span class="status-badge is-resolved">FT · ${m.result?.toUpperCase()}</span>`
      : isRefunding
        ? `<span class="status-badge is-warning">REFUNDING</span>`
        : `<span class="status-badge">${dateLabel} · ${timeLabel}</span>`;

  return `
    <div class="match-detail">
      <div class="match-detail-header">
        <p class="eyebrow">${stageLabel}</p>
        <div class="match-detail-teams">
          <div class="match-detail-team">
            ${flagImg(m.home, 160, 'match-detail-flag')}
            <h2 class="match-detail-team-name">${m.home}</h2>
          </div>
          ${liveScore || '<span class="match-detail-vs">vs</span>'}
          <div class="match-detail-team">
            ${flagImg(m.away, 160, 'match-detail-flag')}
            <h2 class="match-detail-team-name">${m.away}</h2>
          </div>
        </div>
        <div class="match-detail-meta">${statusBadge}</div>
      </div>

      ${mine ? renderMyPredictionPanel(mine, m) : ''}

      ${canPredict ? renderPredictForm(m, pools, state) : ''}

      ${!canPredict && !mine ? `
        <div class="empty-state" style="margin-top: var(--sp-8);">
          ${m.status === 'live' ? 'Predictions are closed — match is live.' :
            isResolved ? 'Predictions are closed — match has ended.' :
            isRefunding ? 'This match is being refunded.' :
            'Predictions are not currently open.'}
        </div>
      ` : ''}

      <div class="pools-display">
        <p class="eyebrow" style="margin-bottom: var(--sp-3);">Current pools</p>
        <div class="pools-bars">
          ${poolBar('Home', m.home, pools.home, total)}
          ${poolBar('Draw', null, pools.draw, total)}
          ${poolBar('Away', m.away, pools.away, total)}
        </div>
        <p class="pools-total">Total staked: <strong>${formatGen(pools.total)} GEN</strong></p>
      </div>
    </div>
  `;
}

function poolBar(label, team, value, total) {
  const pctNum = total === 0 ? 0 : Number(value) * 100 / total;
  return `
    <div class="pool-bar">
      <div class="pool-bar-header">
        <span class="pool-bar-label">${label}${team ? ` · ${team}` : ''}</span>
        <span class="pool-bar-value">${formatGen(value)} GEN</span>
      </div>
      <div class="pool-bar-track"><div class="pool-bar-fill" style="width: ${pctNum}%"></div></div>
      <span class="pool-bar-pct">${total === 0 ? '—' : pctNum.toFixed(1) + '%'}</span>
    </div>
  `;
}

function renderMyPredictionPanel(mine, m) {
  const isResolved = m.status === 'resolved' || m.status === 'finished';
  const isRefunding = m.status === 'refunding' || m.status === 'postponed';
  const won = isResolved && m.result === mine.pick;
  const lost = isResolved && m.result && m.result !== mine.pick;

  let actionBtn = '';
  if (isResolved && won && !mine.claimed) {
    actionBtn = `<button class="primary-button" id="claim-btn">Claim winnings</button>`;
  } else if (isRefunding && !mine.refunded) {
    actionBtn = `<button class="secondary-button" id="refund-btn">Claim refund</button>`;
  } else if (mine.claimed || mine.refunded) {
    actionBtn = `<span class="status-badge is-claimed">${mine.claimed ? 'Claimed' : 'Refunded'}</span>`;
  }

  return `
    <div class="my-prediction-panel">
      <p class="eyebrow">Your pick</p>
      <div class="my-prediction-content">
        <div>
          <div class="my-prediction-pick">${mine.pick.toUpperCase()}</div>
          <div class="my-prediction-stake">${formatGen(mine.stake)} GEN staked</div>
        </div>
        <div>
          ${won ? '<div class="pick-status pick-won">✓ Won</div>' : ''}
          ${lost ? '<div class="pick-status pick-lost">Lost</div>' : ''}
          ${!isResolved && !isRefunding ? '<div class="pick-status pick-pending">Pending</div>' : ''}
          ${actionBtn}
        </div>
      </div>
    </div>
  `;
}

function renderPredictForm(m, pools, state) {
  const connected = Boolean(state.address);
  const onCorrectNet = state.isStudionet;
  return `
    <div class="predict-form">
      <p class="eyebrow">Make your pick</p>
      <div class="pick-buttons">
        <button class="pick-button" data-pick="home">
          ${flagImg(m.home, 40, 'pick-flag')}
          <span class="pick-button-label">${m.home}</span>
          <span class="pick-button-meta">Home</span>
        </button>
        <button class="pick-button" data-pick="draw">
          <span class="pick-draw-icon">⚖</span>
          <span class="pick-button-label">Draw</span>
          <span class="pick-button-meta">—</span>
        </button>
        <button class="pick-button" data-pick="away">
          ${flagImg(m.away, 40, 'pick-flag')}
          <span class="pick-button-label">${m.away}</span>
          <span class="pick-button-meta">Away</span>
        </button>
      </div>

      <div class="stake-row">
        <label class="stake-input-wrap">
          <span class="stake-label">Stake</span>
          <input type="number" id="stake-input" min="${MIN_STAKE_GEN}" step="0.1" placeholder="${MIN_STAKE_GEN}" inputmode="decimal">
          <span class="stake-suffix">GEN</span>
        </label>
        <div class="payout-display">
          <span class="payout-label">Expected payout</span>
          <span class="payout-value" id="expected-payout">— GEN</span>
        </div>
      </div>

      <button class="primary-button" id="submit-prediction-btn" disabled>
        ${!connected ? 'Connect wallet to predict' : !onCorrectNet ? 'Switch to Bradbury' : 'Pick a side'}
      </button>

      <p class="predict-disclaimer">
        Minimum ${MIN_STAKE_GEN} GEN. Pool splits among winning predictors when the match resolves.
      </p>
    </div>
  `;
}

function attachMatchDetailEvents() {
  const pickBtns = document.querySelectorAll('.pick-button');
  const stakeInput = document.getElementById('stake-input');
  const submitBtn = document.getElementById('submit-prediction-btn');
  const payoutEl = document.getElementById('expected-payout');

  pickBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      pickBtns.forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      currentPick = btn.dataset.pick;
      updatePayout();
      updateSubmitState();
    });
  });

  stakeInput?.addEventListener('input', () => {
    updatePayout();
    updateSubmitState();
  });

  function updatePayout() {
    if (!currentPick || !stakeInput?.value) { payoutEl.textContent = '— GEN'; return; }
    const stake = parseFloat(stakeInput.value);
    if (!isFinite(stake) || stake < MIN_STAKE_GEN) { payoutEl.textContent = '— GEN'; return; }
    const stakeWei = toWei(stake);
    const pickPool = currentPools[currentPick];
    const expected = computeExpectedPayout(stakeWei, pickPool, currentPools.total);
    payoutEl.textContent = `~${formatGen(expected, 2)} GEN`;
  }

  function updateSubmitState() {
    const state = getWalletState();
    if (!state.address) { submitBtn.disabled = true; submitBtn.textContent = 'Connect wallet to predict'; return; }
    if (!state.isStudionet) { submitBtn.disabled = true; submitBtn.textContent = 'Switch to Bradbury'; return; }
    if (!currentPick) { submitBtn.disabled = true; submitBtn.textContent = 'Pick a side'; return; }
    const stake = parseFloat(stakeInput?.value || 0);
    if (!isFinite(stake) || stake < MIN_STAKE_GEN) { submitBtn.disabled = true; submitBtn.textContent = `Min ${MIN_STAKE_GEN} GEN`; return; }
    submitBtn.disabled = false;
    submitBtn.textContent = `Predict ${currentPick.toUpperCase()} · ${stake} GEN`;
  }

  submitBtn?.addEventListener('click', async () => {
    if (submitBtn.disabled) return;
    const state = getWalletState();
    const stake = parseFloat(stakeInput.value);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Confirming in wallet…';
    try {
      const { txHash } = await submitPrediction(currentMatch.contract_address, currentPick, stake);
      submitBtn.textContent = 'Submitting…';

      // Mirror to Supabase — properly check for error
      const insertResult = await sb.from('predictions').insert({
        match_id: currentMatch.match_id,
        user_address: state.address,
        pick: currentPick,
        stake_wei: toWei(stake).toString(),
        tx_hash: txHash,
        contract_address: currentMatch.contract_address,
      });
      if (insertResult.error) {
        console.error('Supabase insert error:', insertResult.error);
        showToast(`Prediction succeeded on-chain but mirror failed: ${insertResult.error.message}`, 'error');
      } else {
        showToast(`Prediction submitted: ${currentPick.toUpperCase()} · ${stake} GEN`);
      }

      await renderMatchDetail(currentMatch.match_id);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Prediction failed', 'error');
      submitBtn.disabled = false;
      updateSubmitState();
    }
  });

  document.getElementById('claim-btn')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Claiming…';
    try {
      const { txHash } = await claim(currentMatch.contract_address);
      await sb.from('predictions').update({ claimed: true, claim_tx_hash: txHash }).eq('match_id', currentMatch.match_id).ilike('user_address', getWalletState().address);
      showToast('Winnings claimed! 🎉');
      await renderMatchDetail(currentMatch.match_id);
    } catch (err) { showToast(err.message || 'Claim failed', 'error'); e.target.disabled = false; e.target.textContent = 'Claim winnings'; }
  });

  document.getElementById('refund-btn')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Refunding…';
    try {
      const { txHash } = await refund(currentMatch.contract_address);
      await sb.from('predictions').update({ refunded: true, refund_tx_hash: txHash }).eq('match_id', currentMatch.match_id).ilike('user_address', getWalletState().address);
      showToast('Refund claimed');
      await renderMatchDetail(currentMatch.match_id);
    } catch (err) { showToast(err.message || 'Refund failed', 'error'); e.target.disabled = false; e.target.textContent = 'Claim refund'; }
  });
}

// ─────────────────────────────────────────────────────────── MY PICKS

async function renderMyPicks() {
  const el = document.getElementById('my-predictions');
  const state = getWalletState();
  if (!state.address) {
    el.innerHTML = '<div class="empty-state"><p>Connect your wallet to see your predictions.</p></div>';
    return;
  }

  el.innerHTML = '<div class="empty-state">Loading your picks…</div>';

  try {
    const { data, error } = await sb
      .from('predictions')
      .select('*, matches(home, away, kickoff_ts, status, result, group_letter, stage)')
      .ilike('user_address', state.address)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error(error);
      el.innerHTML = `<div class="empty-state">Couldn't load picks: ${error.message}</div>`;
      return;
    }
    if (!data || data.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <p>You haven't made any predictions yet.</p>
          <p style="margin-top: var(--sp-3);"><a href="#/" class="link-accent">Browse matches →</a></p>
        </div>`;
      return;
    }

    // Calculate stats
    let totalStaked = 0n;
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;
    let claimedCount = 0;
    data.forEach((p) => {
      totalStaked += BigInt(p.stake_wei);
      const m = p.matches;
      const isResolved = m?.status === 'resolved' || m?.status === 'finished';
      if (isResolved && m.result === p.pick) wonCount++;
      else if (isResolved && m.result && m.result !== p.pick) lostCount++;
      else pendingCount++;
      if (p.claimed) claimedCount++;
    });

    el.innerHTML = `
      <div class="my-picks-stats">
        <div class="my-picks-stat">
          <div class="my-picks-stat-value">${data.length}</div>
          <div class="my-picks-stat-label">Total picks</div>
        </div>
        <div class="my-picks-stat">
          <div class="my-picks-stat-value">${formatGen(totalStaked)}</div>
          <div class="my-picks-stat-label">GEN staked</div>
        </div>
        <div class="my-picks-stat">
          <div class="my-picks-stat-value pick-won">${wonCount}</div>
          <div class="my-picks-stat-label">Won</div>
        </div>
        <div class="my-picks-stat">
          <div class="my-picks-stat-value pick-lost">${lostCount}</div>
          <div class="my-picks-stat-label">Lost</div>
        </div>
        <div class="my-picks-stat">
          <div class="my-picks-stat-value">${pendingCount}</div>
          <div class="my-picks-stat-label">Pending</div>
        </div>
      </div>

      <div class="my-picks-list">
        ${data.map(myPickCardHtml).join('')}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="empty-state">Couldn't load picks: ${e.message}</div>`;
  }
}

function myPickCardHtml(p) {
  const m = p.matches || {};
  const date = new Date((m.kickoff_ts || 0) * 1000);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const stageLabel = m.group_letter ? `Group ${m.group_letter}` : (m.stage || 'WC 26');
  const isResolved = m.status === 'resolved' || m.status === 'finished';
  const won = isResolved && m.result === p.pick;
  const lost = isResolved && m.result && m.result !== p.pick;

  let statusBadge;
  if (won) statusBadge = '<span class="pick-status pick-won">✓ Won</span>';
  else if (lost) statusBadge = '<span class="pick-status pick-lost">Lost</span>';
  else statusBadge = '<span class="pick-status pick-pending">Pending</span>';

  const pickedTeam = p.pick === 'home' ? m.home : p.pick === 'away' ? m.away : 'Draw';

  return `
    <a href="#/match/${p.match_id}" class="my-pick-card">
      <div class="my-pick-card-header">
        <span class="my-pick-stage">${stageLabel}</span>
        <span class="my-pick-date">${dateLabel}</span>
      </div>
      <div class="my-pick-teams">
        ${flagImg(m.home, 40, 'my-pick-flag')}<span>${m.home || '?'}</span>
        <span class="my-pick-vs">vs</span>
        ${flagImg(m.away, 40, 'my-pick-flag')}<span>${m.away || '?'}</span>
      </div>
      <div class="my-pick-detail">
        <div>
          <div class="my-pick-label">Your pick</div>
          <div class="my-pick-value">${pickedTeam}</div>
        </div>
        <div>
          <div class="my-pick-label">Stake</div>
          <div class="my-pick-value">${formatGen(BigInt(p.stake_wei))} GEN</div>
        </div>
        <div>${statusBadge}</div>
      </div>
    </a>
  `;
}

// ─────────────────────────────────────────────────────────── LEADERBOARD

async function renderLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  el.innerHTML = '<div class="empty-state">Loading leaderboard…</div>';

  try {
    // Pull predictions with match info (one query)
    const { data: preds, error: pErr } = await sb
      .from('predictions')
      .select('user_address, pick, stake_wei, matches(status, result)');

    if (pErr) {
      console.error(pErr);
      el.innerHTML = `<div class="empty-state">Couldn't load leaderboard: ${pErr.message}</div>`;
      return;
    }

    if (!preds || preds.length === 0) {
      el.innerHTML = `<div class="empty-state">No predictions yet. Be the first to predict!</div>`;
      return;
    }

    // Pull all users (separate query — join client-side)
    const { data: users } = await sb.from('users').select('user_address, username');
    const usernameByAddr = {};
    (users || []).forEach((u) => { usernameByAddr[(u.user_address || '').toLowerCase()] = u.username; });

    // Aggregate by user
    const byUser = {};
    preds.forEach((p) => {
      const addr = (p.user_address || '').toLowerCase();
      if (!byUser[addr]) {
        byUser[addr] = {
          address: addr,
          username: usernameByAddr[addr] || null,
          total: 0,
          won: 0,
          lost: 0,
          pending: 0,
          stakedWei: 0n,
          wonStakeWei: 0n,
        };
      }
      const u = byUser[addr];
      u.total++;
      const stake = BigInt(p.stake_wei || 0);
      u.stakedWei += stake;
      const m = p.matches;
      const isResolved = m?.status === 'resolved' || m?.status === 'finished';
      if (isResolved && m.result === p.pick) { u.won++; u.wonStakeWei += stake; }
      else if (isResolved && m.result && m.result !== p.pick) u.lost++;
      else u.pending++;
    });

    const rows = Object.values(byUser)
      .sort((a, b) => {
        if (b.won !== a.won) return b.won - a.won;
        if (b.wonStakeWei !== a.wonStakeWei) return b.wonStakeWei > a.wonStakeWei ? 1 : -1;
        return b.total - a.total;
      })
      .slice(0, 50);

    el.innerHTML = `
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th class="num">Picks</th>
            <th class="num">Won</th>
            <th class="num">Lost</th>
            <th class="num">Staked</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td class="rank">${i + 1}</td>
              <td class="player">
                <span class="player-name">${r.username || (r.address.slice(0, 6) + '…' + r.address.slice(-4))}</span>
              </td>
              <td class="num">${r.total}</td>
              <td class="num pick-won">${r.won}</td>
              <td class="num pick-lost">${r.lost}</td>
              <td class="num mono">${formatGen(r.stakedWei)} GEN</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="empty-state">Couldn't load leaderboard: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────── BOOT

window.addEventListener('DOMContentLoaded', async () => {
  render();
  await trySilentReconnect();
});

window.showToast = showToast;
