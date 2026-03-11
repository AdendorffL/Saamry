// ===== Screen router =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== Toast =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ===== Helper =====
function formatRand(n) {
  return 'R ' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentMonthLabel() {
  return new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

// ===== Login Screen =====
let selectedLoginUser = null;

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

  document.getElementById('password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
}

// ===== Main Screen =====
let allProfiles = [];

async function initMainScreen() {
  const profile = getCurrentProfile();

  // Greeting
  const hour = new Date().getHours();
  const time  = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  document.getElementById('greeting').innerHTML = `Good ${time}, <span>${profile.name}</span>`;
  document.getElementById('date-label').textContent = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  // Load all profiles for checkboxes
  allProfiles = await getAllProfiles();
  renderPassengerCheckboxes(profile.id);

  // Buttons
  document.getElementById('submit-btn').onclick  = handleSubmit;
  document.getElementById('charts-btn').onclick  = async () => {
    await initChartsScreen();
    showScreen('charts-screen');
  };
  document.getElementById('logout-btn').onclick  = async () => {
    await logout();
    document.getElementById('password-input').value = '';
    document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('selected'));
    selectedLoginUser = null;
    showScreen('login-screen');
  };
}

// Render passenger checkboxes — driver excluded (they always ride)
function renderPassengerCheckboxes(driverProfileId) {
  const list = document.getElementById('checkbox-list');
  list.innerHTML = '';

  allProfiles
    .filter(p => p.id !== driverProfileId)
    .forEach(profile => {
      const item  = document.createElement('label');
      item.className = 'checkbox-item';

      const cb    = document.createElement('input');
      cb.type     = 'checkbox';
      cb.value    = profile.id;
      cb.id       = `cb-${profile.id}`;
      cb.checked  = true; // default: everyone rode

      const name  = document.createElement('span');
      name.className = 'checkbox-name';
      name.textContent = profile.name;

      const dot   = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = getColorForName(profile.name);

      item.appendChild(cb);
      item.appendChild(name);
      item.appendChild(dot);
      list.appendChild(item);
    });
}

async function handleSubmit() {
  const amountInput = document.getElementById('amount-input');
  const noteInput   = document.getElementById('note-input');
  const btn         = document.getElementById('submit-btn');

  const amount = parseFloat(amountInput.value);
  if (!amount || isNaN(amount) || amount <= 0) {
    showToast('Enter a valid ticket amount');
    return;
  }

  // Collect passenger IDs from checked boxes
  const checkedPassengerIds = [...document.querySelectorAll('#checkbox-list input:checked')]
    .map(cb => cb.value);

  // Driver always included as a rider
  const driverProfileId = getCurrentProfile().id;
  const riderIds = [driverProfileId, ...checkedPassengerIds];

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    await addTrip(amount, noteInput.value.trim(), riderIds);
    amountInput.value = '';
    noteInput.value   = '';
    // Reset checkboxes to all checked
    document.querySelectorAll('#checkbox-list input').forEach(cb => cb.checked = true);
    showToast('✓ Trip saved');
  } catch (e) {
    showToast('Error saving — try again');
    console.error(e);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save Trip';
  }
}