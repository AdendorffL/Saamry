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

function currentMonthLabel() {
  return new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

// ── Login screen ───────────────────────────
let selectedLoginUser = null;
let isSubmitting      = false; // submission lock — prevents double inserts

function initLoginScreen() {
  const container = document.getElementById('user-buttons');
  container.innerHTML = '';

  CONFIG.USERS.forEach(user => {
    const btn = document.createElement('button');
    btn.className = 'user-btn';
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

// Only updates dynamic content — never registers buttons
async function initMainScreen() {
  const profile = getCurrentProfile();

  const hour = new Date().getHours();
  const time  = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  document.getElementById('greeting').innerHTML = `Good ${time}, <span>${profile.name}</span>`;
  document.getElementById('date-label').textContent = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  allProfiles = await getAllProfiles();
  renderPassengerCheckboxes(profile.id);
}

// Render passenger checkboxes — driver excluded (they always ride)
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
  // Lock — if already running, ignore any duplicate calls entirely
  if (isSubmitting) return;
  isSubmitting = true;

  const amountInput = document.getElementById('amount-input');
  const noteInput   = document.getElementById('note-input');
  const btn         = document.getElementById('submit-btn');

  // Allow 0 for free parking days — only reject if field is completely empty
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
    await addTrip(amount, noteInput.value.trim(), riderIds);
    amountInput.value = '';
    noteInput.value   = '';
    document.querySelectorAll('#checkbox-list input').forEach(cb => cb.checked = true);
    showToast('✓ Trip saved');
  } catch (e) {
    showToast('Error saving — try again');
    console.error(e);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save Trip';
    isSubmitting    = false; // always release the lock
  }
}

// ── Charts screen ───────────────────────────
async function initChartsScreen() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;

  document.getElementById('charts-month').textContent = currentMonthLabel();

  try {
    const stats = await getStatsForMonth(year, month);
    renderSummaryStats(stats);
    renderSettlement(stats);
    renderBarChart(stats.chartData);
    renderTripHistory(stats.trips);
  } catch (e) {
    console.error(e);
    showToast('Error loading data');
  }
}

function renderSummaryStats({ totalPaid, tripCount, avgPerTrip, paidByPerson, driveCount }) {
  document.getElementById('stat-total').textContent = formatRand(totalPaid);
  document.getElementById('stat-trips').textContent = tripCount;
  document.getElementById('stat-avg').textContent   = formatRand(avgPerTrip);

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
    pctEl.style.cssText  = 'font-size:11px;color:var(--text-muted);margin-top:2px';
    pctEl.textContent    = total > 0 ? Math.round((count / total) * 100) + '% of trips' : '—';

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
    barsEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px">No trips this month</p>';
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
    list.innerHTML = '<p class="empty-state">No trips logged this month</p>';
    return;
  }

  trips.forEach(trip => {
    const item = document.createElement('div');
    item.className = 'history-item';

    // Left — amount, payer, riders
    const left = document.createElement('div');

    const amount = document.createElement('div');
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

    // Right — date, note
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

// ── Boot — all button wiring happens ONCE here ──
window.addEventListener('DOMContentLoaded', async () => {

  initLoginScreen();

  // Login button — wired once
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

  // Submit button — strip any existing listeners by replacing the node, then wire once
  const oldBtn  = document.getElementById('submit-btn');
  const freshBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(freshBtn, oldBtn);
  freshBtn.onclick = handleSubmit;

  // Charts button — wired once
  document.getElementById('charts-btn').onclick = async () => {
    await initChartsScreen();
    showScreen('charts-screen');
  };

  // Back button — wired once
  document.getElementById('back-btn').onclick = () => showScreen('main-screen');

  // Logout button — wired once
  document.getElementById('logout-btn').onclick = async () => {
    await logout();
    document.getElementById('password-input').value = '';
    document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('selected'));
    selectedLoginUser = null;
    showScreen('login-screen');
  };

  // Restore session or show login
  const user = await initAuth();
  if (user) {
    await initMainScreen();
    showScreen('main-screen');
  } else {
    showScreen('login-screen');
  }

});