// ============================================
// app.js — Screen routing + UI logic
// ============================================

// ── Screen router ──────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Toast ──────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Helpers ────────────────────────────────
function formatRand(n) {
  return 'R ' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Login screen ───────────────────────────
let selectedLoginUser = null;
let isSubmitting      = false;

function initLoginScreen() {
  const container = document.getElementById('user-buttons');
  container.innerHTML = '';

  CONFIG.USERS.forEach(user => {
    const btn = document.createElement('button');
    btn.className   = 'user-btn';
    btn.textContent = user.name;
    btn.onclick = () => {
      document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedLoginUser = user;
    };
    container.appendChild(btn);
  });

  document.getElementById('password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
}

// ── Main screen ────────────────────────────
let allProfiles = [];

async function initMainScreen() {
  const profile = getCurrentProfile();
  if (!profile) { showToast('Session error — please log in again'); return; }

  const hour = new Date().getHours();
  const time  = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  document.getElementById('greeting').innerHTML = `Good ${time}, <span>${profile.name}</span>`;
  document.getElementById('date-label').textContent = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  try {
    allProfiles = await getAllProfiles();
    renderPassengerCheckboxes(profile.id);
  } catch (e) {
    console.error('Failed to load profiles:', e);
    showToast('Could not load contacts — check connection');
  }

  document.getElementById('date-input').value = new Date().toISOString().split('T')[0];
}

function renderPassengerCheckboxes(driverProfileId) {
  const list = document.getElementById('checkbox-list');
  list.innerHTML = '';

  allProfiles
    .filter(p => p.id !== driverProfileId)
    .forEach(profile => {
      const item = document.createElement('label');
      item.className = 'checkbox-item';

      const cb   = document.createElement('input');
      cb.type    = 'checkbox';
      cb.value   = profile.id;
      cb.id      = `cb-${profile.id}`;
      cb.checked = true;

      const name = document.createElement('span');
      name.className   = 'checkbox-name';
      name.textContent = profile.name;

      const dot = document.createElement('span');
      dot.className        = 'dot';
      dot.style.background = getColorForName(profile.name);

      item.appendChild(cb);
      item.appendChild(name);
      item.appendChild(dot);
      list.appendChild(item);
    });
}

async function handleSubmit() {
  if (isSubmitting) return;
  isSubmitting = true;

  const amountInput = document.getElementById('amount-input');
  const noteInput   = document.getElementById('note-input');
  const btn         = document.getElementById('submit-btn');

  const rawValue = amountInput.value.trim();
  const amount   = rawValue === '' ? null : parseFloat(rawValue);

  if (rawValue === '') {
    showToast('Enter an amount — use 0 for a free day');
    isSubmitting = false;
    return;
  }
  if (isNaN(amount)) {
    showToast('Enter a valid number');
    isSubmitting = false;
    return;
  }

  const checkedPassengerIds = [...document.querySelectorAll('#checkbox-list input:checked')]
    .map(cb => cb.value);

  const driverProfileId = getCurrentProfile().id;
  const riderIds        = [driverProfileId, ...checkedPassengerIds];

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    const dateValue = document.getElementById('date-input').value || new Date().toISOString().split('T')[0];
    await addTrip(amount, noteInput.value.trim(), riderIds, dateValue);
    amountInput.value = '';
    noteInput.value   = '';
    document.querySelectorAll('#checkbox-list input').forEach(cb => cb.checked = true);
    document.getElementById('date-input').value = new Date().toISOString().split('T')[0];
    showToast('✓ Trip saved');
  } catch (e) {
    showToast('Error saving — try again');
    console.error(e);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save Trip';
    isSubmitting    = false;
  }
}

// ── Charts screen ───────────────────────────
async function initChartsScreen() {
  try {
    const [stats, pending] = await Promise.all([
      getCurrentStats(),
      getPendingSettlement(),
    ]);

    renderPendingBanner(pending);
    renderSummaryStats(stats);
    renderSettlement(stats);
    renderBarChart(stats.chartData);
    renderTripHistory(stats.trips);
  } catch (e) {
    console.error(e);
    showToast('Error loading data');
  }
}

// ── Pending settlement banner ────────────────
let pendingSettlementId = null;

function renderPendingBanner(pending) {
  const banner = document.getElementById('pending-banner');

  if (!pending) {
    banner.style.display = 'none';
    pendingSettlementId  = null;
    return;
  }

  pendingSettlementId = pending.id;
  const confirmedCount   = pending.settlement_confirmations?.length || 0;
  const totalNeeded      = allProfiles.length || 3;
  const initiatorName    = pending.profiles?.name || 'Someone';
  const currentUserId    = getCurrentUser()?.id;
  const alreadyConfirmed = pending.settlement_confirmations?.some(c => c.user_id === currentUserId);

  // Build confirmed / waiting name lists
  const confirmedIds   = new Set((pending.settlement_confirmations || []).map(c => c.user_id));
  const confirmedNames = allProfiles.filter(p => confirmedIds.has(p.id)).map(p => p.name);
  const waitingNames   = allProfiles.filter(p => !confirmedIds.has(p.id)).map(p => p.name);

  let text = `<strong>${initiatorName}</strong> requested a money settlement. `;
  text += `<strong>${confirmedCount}/${totalNeeded}</strong> confirmed`;
  if (confirmedNames.length) text += ` (${confirmedNames.join(', ')})`;
  text += '.';
  if (waitingNames.length)   text += ` Waiting on <strong>${waitingNames.join(', ')}</strong>.`;

  document.getElementById('pending-banner-text').innerHTML = text;
  document.getElementById('pending-confirm-btn').style.display = alreadyConfirmed ? 'none' : '';
  document.getElementById('pending-cancel-btn').textContent = 'Cancel for Everyone';

  banner.style.display = 'flex';
  banner.style.flexDirection = 'column';
}

async function handleConfirmSettlement() {
  if (!pendingSettlementId) return;

  const confirmBtn = document.getElementById('pending-confirm-btn');
  confirmBtn.disabled    = true;
  confirmBtn.textContent = 'Confirming…';

  try {
    await confirmSettlement(pendingSettlementId);
    showToast('✓ Settlement complete — balances reset');
  } catch (e) {
    // completeSettlement may fail on RLS mid-way — still refresh so others
    // can see updated confirmation count and trigger their own completion
    console.error('Confirm error:', e);
    showToast('Confirmed — waiting for all trips to be stamped');
  } finally {
    // Always refresh regardless of outcome
    confirmBtn.disabled    = false;
    confirmBtn.textContent = 'Confirm';
    await initChartsScreen();
  }
}

async function handleCancelSettlement() {
  if (!pendingSettlementId) return;

  const cancelBtn = document.getElementById('pending-cancel-btn');
  cancelBtn.disabled    = true;
  cancelBtn.textContent = 'Cancelling…';

  try {
    await cancelSettlement(pendingSettlementId);
    pendingSettlementId = null; // clear immediately so banner hides even if re-fetch is slow
    document.getElementById('pending-banner').style.display = 'none';
    showToast('Settlement cancelled for everyone');
    await initChartsScreen(); // full refresh in background
  } catch (e) {
    showToast('Error cancelling');
    console.error(e);
    cancelBtn.disabled    = false;
    cancelBtn.textContent = 'Cancel for Everyone';
  }
}

// ── Summary stats ────────────────────────────
function renderSummaryStats({ totalPaid, tripCount, avgPerTrip, paidByPerson, driveCount }) {
  document.getElementById('stat-total').textContent = formatRand(totalPaid);
  document.getElementById('stat-trips').textContent = tripCount;
  document.getElementById('stat-avg').textContent   = formatRand(avgPerTrip);

  // Hide paid-by and settlement sections when there's nothing to show
  const hasTrips = tripCount > 0;
  document.getElementById('paid-section').style.display       = hasTrips ? '' : 'none';
  document.getElementById('settlement-section').style.display = hasTrips ? '' : 'none';

  // Paid by person
  const breakdown = document.getElementById('paid-breakdown');
  breakdown.innerHTML = '';
  Object.entries(paidByPerson).forEach(([name, amount]) => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';

    const dot = document.createElement('span');
    dot.className        = 'dot';
    dot.style.background = getColorForName(name);

    const nameEl = document.createElement('span');
    nameEl.textContent = name;

    const amountEl = document.createElement('span');
    amountEl.className   = 'breakdown-amount';
    amountEl.textContent = formatRand(amount);

    row.appendChild(dot);
    row.appendChild(nameEl);
    row.appendChild(amountEl);
    breakdown.appendChild(row);
  });

  // Drive counts
  const driveList = document.getElementById('drive-breakdown');
  driveList.innerHTML = '';
  const total = Object.values(driveCount).reduce((s, n) => s + n, 0);

  Object.entries(driveCount).forEach(([name, count]) => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';

    const dot = document.createElement('span');
    dot.className        = 'dot';
    dot.style.background = getColorForName(name);

    const nameEl = document.createElement('span');
    nameEl.textContent = name;

    const right = document.createElement('div');
    right.style.cssText = 'margin-left:auto;text-align:right';

    const countEl = document.createElement('span');
    countEl.className   = 'breakdown-amount';
    countEl.textContent = count + (count === 1 ? ' drive' : ' drives');

    const pctEl = document.createElement('div');
    pctEl.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:2px';
    pctEl.textContent   = total > 0 ? Math.round((count / total) * 100) + '%' : '—';

    right.appendChild(countEl);
    right.appendChild(pctEl);
    row.appendChild(dot);
    row.appendChild(nameEl);
    row.appendChild(right);
    driveList.appendChild(row);
  });
}

function renderSettlement({ payments }) {
  const container = document.getElementById('settlement');
  container.innerHTML = '';

  if (payments.length === 0) {
    container.innerHTML = '<p class="empty-state">All settled up ✓</p>';
    return;
  }

  payments.forEach(p => {
    const item = document.createElement('div');
    item.className = 'settlement-item';

    const fromDot = document.createElement('span');
    fromDot.className        = 'dot';
    fromDot.style.background = getColorForName(p.from);

    const text = document.createElement('span');
    text.className = 'settlement-text';
    text.innerHTML = `<strong>${p.from}</strong> pays <strong>${p.to}</strong>`;

    const amount = document.createElement('span');
    amount.className   = 'settlement-amount';
    amount.textContent = formatRand(p.amount);

    item.appendChild(fromDot);
    item.appendChild(text);
    item.appendChild(amount);
    container.appendChild(item);
  });
}

function renderBarChart(chartData) {
  const barsEl = document.getElementById('bars');
  barsEl.innerHTML = '';

  if (!chartData.length) {
    barsEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px">No trips yet</p>';
    return;
  }

  const max = Math.max(...chartData.map(d => d[1]));
  chartData.forEach(([date, value]) => {
    const col = document.createElement('div');
    col.className = 'bar-col';

    const bar = document.createElement('div');
    bar.className    = 'bar';
    bar.style.height = (max > 0 ? (value / max) * 100 : 0) + '%';
    bar.title        = formatRand(value);

    const label = document.createElement('div');
    label.className   = 'bar-date';
    label.textContent = date;

    col.appendChild(bar);
    col.appendChild(label);
    barsEl.appendChild(col);
  });
}

function renderTripHistory(trips) {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (!trips.length) {
    list.innerHTML = '<p class="empty-state">No trips logged yet</p>';
    return;
  }

  trips.forEach(trip => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const left      = document.createElement('div');
    const amount    = document.createElement('div');
    amount.className   = 'history-amount';
    amount.textContent = formatRand(trip.amount);

    const payer     = document.createElement('div');
    payer.className = 'history-payer';
    const payerName = trip.profiles?.name || 'Unknown';
    payer.innerHTML = `<span class="dot" style="background:${getColorForName(payerName)}"></span> ${payerName} paid`;

    const riderRow = document.createElement('div');
    riderRow.className = 'rider-row';
    trip.trip_riders.forEach(r => {
      const name = r.profiles?.name || '';
      const chip = document.createElement('span');
      chip.className         = 'rider-chip';
      chip.style.borderColor = getColorForName(name);
      chip.textContent       = name;
      riderRow.appendChild(chip);
    });

    left.appendChild(amount);
    left.appendChild(payer);
    left.appendChild(riderRow);

    const right = document.createElement('div');
    right.className = 'history-meta';

    const date = document.createElement('div');
    date.className   = 'history-date';
    date.textContent = new Date(trip.date + 'T00:00:00').toLocaleDateString('en-ZA', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
    right.appendChild(date);

    if (trip.note) {
      const note = document.createElement('div');
      note.className   = 'history-note';
      note.textContent = trip.note;
      right.appendChild(note);
    }

    item.appendChild(left);
    item.appendChild(right);
    list.appendChild(item);
  });
}

// ── Settle Up action sheet ──────────────────
function openSettleModal()  { document.getElementById('settle-modal').classList.add('open'); }
function closeSettleModal() { document.getElementById('settle-modal').classList.remove('open'); }

async function handleSettleMoney() {
  closeSettleModal();
  try {
    await initiateSettlement();
    showToast('Settlement initiated — waiting for others');
    await initChartsScreen();
  } catch (e) {
    showToast(e.message || 'Error initiating settlement');
    console.error(e);
  }
}

async function handleResetDrives() {
  closeSettleModal();
  try {
    await resetDrives();
    showToast('✓ Drives reset to zero');
    await initChartsScreen();
  } catch (e) {
    showToast('Error resetting drives');
    console.error(e);
  }
}

// ── History Modal ────────────────────────────
function openHistoryModal()  { document.getElementById('history-modal').classList.add('open'); loadHistoryModal(); }
function closeHistoryModal() { document.getElementById('history-modal').classList.remove('open'); }

async function loadHistoryModal() {
  const body = document.getElementById('history-modal-body');
  body.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    const history = await getSettlementHistory();
    if (!history.length) {
      body.innerHTML = '<p class="empty-state">No settlements yet</p>';
      return;
    }
    body.innerHTML = '';
    history.forEach(period => body.appendChild(buildSettlementCard(period)));
  } catch (e) {
    console.error(e);
    body.innerHTML = '<p class="empty-state">Error loading history</p>';
  }
}

function buildSettlementCard({ label, totalPaid, tripCount, driveCount, payments }) {
  const card = document.createElement('div');
  card.className = 'month-card';

  // Header
  const header = document.createElement('div');
  header.className = 'month-card-header';

  const titleWrap   = document.createElement('div');
  const title       = document.createElement('div');
  title.className   = 'month-card-title';
  title.textContent = label;

  const badge       = document.createElement('span');
  badge.className   = 'month-trips-badge';
  badge.textContent = tripCount + (tripCount === 1 ? ' trip' : ' trips');
  badge.style.cssText = 'margin-top:4px;display:inline-block';

  titleWrap.appendChild(title);
  titleWrap.appendChild(badge);

  const total       = document.createElement('div');
  total.className   = 'month-card-total';
  total.textContent = formatRand(totalPaid);

  header.appendChild(titleWrap);
  header.appendChild(total);

  // Body
  const body = document.createElement('div');
  body.className = 'month-card-body';

  // Drives
  const drivesSection = document.createElement('div');
  const drivesLabel   = document.createElement('div');
  drivesLabel.className   = 'month-section-label';
  drivesLabel.textContent = 'Drives (at settlement)';
  drivesSection.appendChild(drivesLabel);

  const totalDrives = Object.values(driveCount).reduce((s, n) => s + n, 0);
  Object.entries(driveCount).forEach(([name, count]) => {
    const row = document.createElement('div');
    row.className = 'month-drive-row';

    const dot = document.createElement('span');
    dot.className        = 'dot';
    dot.style.background = getColorForName(name);

    const nameEl    = document.createElement('span');
    nameEl.textContent = name;

    const countEl   = document.createElement('span');
    countEl.className   = 'drive-count';
    countEl.textContent = count + (count === 1 ? ' drive' : ' drives');

    const pctEl     = document.createElement('span');
    pctEl.className   = 'drive-pct';
    pctEl.textContent = totalDrives > 0 ? Math.round((count / totalDrives) * 100) + '%' : '—';

    row.appendChild(dot);
    row.appendChild(nameEl);
    row.appendChild(countEl);
    row.appendChild(pctEl);
    drivesSection.appendChild(row);
  });
  body.appendChild(drivesSection);

  const hr = document.createElement('hr');
  hr.className = 'month-divider';
  body.appendChild(hr);

  // Settlement
  const settlementSection = document.createElement('div');
  const settlementLabel   = document.createElement('div');
  settlementLabel.className   = 'month-section-label';
  settlementLabel.textContent = 'What was settled';
  settlementSection.appendChild(settlementLabel);

  if (payments.length === 0) {
    const none = document.createElement('div');
    none.style.cssText = 'font-size:13px;color:var(--text-muted)';
    none.textContent   = 'Everyone was even ✓';
    settlementSection.appendChild(none);
  } else {
    payments.forEach(p => {
      const row = document.createElement('div');
      row.className = 'month-settlement-row';

      const dot = document.createElement('span');
      dot.className         = 'dot';
      dot.style.background  = getColorForName(p.from);
      dot.style.marginRight = '6px';

      const text = document.createElement('span');
      text.style.flex = '1';
      text.innerHTML  = `<strong style="color:var(--text)">${p.from}</strong> → <strong style="color:var(--text)">${p.to}</strong>`;

      const amt = document.createElement('span');
      amt.className   = 'month-settlement-amount';
      amt.textContent = formatRand(p.amount);

      row.appendChild(dot);
      row.appendChild(text);
      row.appendChild(amt);
      settlementSection.appendChild(row);
    });
  }

  body.appendChild(settlementSection);
  card.appendChild(header);
  card.appendChild(body);
  return card;
}

// ── Boot — all wiring happens ONCE ──────────
window.addEventListener('DOMContentLoaded', async () => {

  initLoginScreen();

  // Login
  document.getElementById('login-btn').onclick = async () => {
    const password = document.getElementById('password-input').value;
    const errorEl  = document.getElementById('login-error');
    errorEl.textContent = '';
    if (!selectedLoginUser) { errorEl.textContent = 'Select your name first.'; return; }
    if (!password)           { errorEl.textContent = 'Enter your password.'; return; }
    try {
      await login(selectedLoginUser.email, password);
      await initMainScreen();
      showScreen('main-screen');
    } catch (e) {
      errorEl.textContent = 'Wrong password. Try again.';
    }
  };

  // Submit — clone to strip any stacked listeners
  const oldBtn   = document.getElementById('submit-btn');
  const freshBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(freshBtn, oldBtn);
  freshBtn.onclick = handleSubmit;

  // Charts
  document.getElementById('charts-btn').onclick = async () => {
    try {
      await initChartsScreen();
      showScreen('charts-screen');
    } catch (e) {
      console.error('Charts load error:', e);
      showToast('Could not load charts — check connection');
    }
  };

  // Back
  document.getElementById('back-btn').onclick = () => showScreen('main-screen');

  // Pending settlement banner
  document.getElementById('pending-confirm-btn').onclick = handleConfirmSettlement;
  document.getElementById('pending-cancel-btn').onclick  = handleCancelSettlement;

  // Settle Up action sheet
  document.getElementById('settle-btn').onclick        = openSettleModal;
  document.getElementById('settle-close-btn').onclick  = closeSettleModal;
  document.getElementById('settle-money-btn').onclick  = handleSettleMoney;
  document.getElementById('reset-drives-btn').onclick  = handleResetDrives;
  document.getElementById('settle-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('settle-modal')) closeSettleModal();
  });

  // History modal
  document.getElementById('history-btn').onclick       = openHistoryModal;
  document.getElementById('history-close-btn').onclick = closeHistoryModal;
  document.getElementById('history-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('history-modal')) closeHistoryModal();
  });

  // Logout
  document.getElementById('logout-btn').onclick = async () => {
    try {
      await logout();
    } catch (e) {
      console.error('Logout error:', e);
      // Continue anyway — local state is cleared in auth.js finally block
    }
    document.getElementById('password-input').value = '';
    document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('selected'));
    selectedLoginUser = null;
    showScreen('login-screen');
  };

  // Boot
  try {
    const user = await initAuth();
    if (user) {
      await initMainScreen();
      showScreen('main-screen');
    } else {
      showScreen('login-screen');
    }
  } catch (e) {
    console.error('Boot error:', e);
    showScreen('login-screen');
    // Show error after a tick so the screen is visible first
    setTimeout(() => showToast('Connection error — please log in'), 300);
  }

});