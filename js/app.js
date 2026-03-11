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