// ============================================
// auth.js — Login / logout / session + profile
// ============================================

const { createClient } = supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let currentUser    = null;
let currentProfile = null;

// Called on app boot — restores existing session
async function initAuth() {
  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (data.session) {
      currentUser = data.session.user;
      await _loadProfile();
      return currentUser;
    }
    return null;
  } catch (e) {
    console.error('Session restore failed:', e);
    return null; // treat as logged out, let user log in manually
  }
}

async function login(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  await _loadProfile(); // throws if profile missing — caught by login handler
  return currentUser;
}

async function logout() {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
  } catch (e) {
    console.error('Sign out error:', e);
    // Still clear local state so the UI resets even if the server call failed
  } finally {
    currentUser    = null;
    currentProfile = null;
  }
}

async function _loadProfile() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) throw new Error('Could not load your profile. Contact your admin.');
  if (!data)  throw new Error('No profile found for this account.');
  currentProfile = data;
}

function getCurrentUser()    { return currentUser; }
function getCurrentProfile() { return currentProfile; }

function getColorForName(name) {
  if (!CONFIG?.USERS?.length) return '#888';
  const u = CONFIG.USERS.find(u => u.name === name);
  return u?.color || '#888';
}