const { createClient } = supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null; // row from profiles table

// Called on app boot - restores existing session
async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    await _loadProfile();
    return currentUser;
  }
  return null;
}

async function login(email, password) {
  const { data, error } = await db.auth.signinWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  await _loadProfile();
  return currentUser;
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

// Fetch the profiles row for the logged-in user
async function _loadProfile() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error) throw error;
  currentProfile = data;
}

function getCurrentUser() { return currentUser; }
function getCurrentProfile() { return currentProfile; }

// Helper: get the CONFIG.USERS entry (for color only)
function getColorForName(name) {
  const u = CONFIG.USERS.find(u => u.name === name);
  return u ? u.color : '#888';
}