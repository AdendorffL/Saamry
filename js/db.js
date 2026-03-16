// ============================================
// db.js — All database operations
// ============================================

// ── Profiles ───────────────────────────────

async function getAllProfiles() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

// ── App state ───────────────────────────────

async function getAppState(key) {
  try {
    const { data, error } = await db
      .from('app_state')
      .select('value')
      .eq('key', key)
      .single();
    if (error) return null;
    return data?.value || null;
  } catch { return null; }
}

async function setAppState(key, value) {
  const { error } = await db
    .from('app_state')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

// ── Trips ───────────────────────────────────

async function addTrip(amount, note, riderIds, date) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not logged in');

  const { data: trip, error: tripError } = await db
    .from('trips')
    .insert({
      date:    date || new Date().toISOString().split('T')[0],
      paid_by: user.id,
      amount:  amount === null ? 0 : Number(amount),
      note:    note || null,
    })
    .select()
    .single();

  if (tripError) throw tripError;

  const riders = riderIds.map(rider_id => ({ trip_id: trip.id, rider_id }));
  const { error: ridersError } = await db.from('trip_riders').insert(riders);
  if (ridersError) throw ridersError;

  return trip;
}

// Fetch all unsettled trips (settlement_id IS NULL)
async function getUnsettledTrips() {
  const { data, error } = await db
    .from('trips')
    .select(`
      id, date, amount, note, paid_by, settlement_id,
      profiles!trips_paid_by_fkey ( name ),
      trip_riders ( rider_id, profiles ( name ) )
    `)
    .is('settlement_id', null)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

// Fetch trips belonging to a completed settlement period
async function getTripsForSettlement(settlementId) {
  const { data, error } = await db
    .from('trips')
    .select(`
      id, date, amount, note, paid_by,
      profiles!trips_paid_by_fkey ( name ),
      trip_riders ( rider_id, profiles ( name ) )
    `)
    .eq('settlement_id', settlementId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

// ── Settlement calculation ──────────────────

function calculateSettlement(trips, allProfiles) {
  const balance = {};
  allProfiles.forEach(p => { balance[p.id] = 0; });

  trips.forEach(trip => {
    const ridersInTrip = trip.trip_riders;
    const numRiders    = ridersInTrip.length;
    if (numRiders === 0) return;
    const share = Number(trip.amount) / numRiders;
    balance[trip.paid_by] += Number(trip.amount);
    ridersInTrip.forEach(r => { balance[r.rider_id] -= share; });
  });

  const namedBalance = {};
  allProfiles.forEach(p => {
    namedBalance[p.name] = Math.round(balance[p.id] * 100) / 100;
  });

  const payments = [];
  const debtors   = allProfiles.filter(p => balance[p.id] < -0.01)
                               .map(p => ({ name: p.name, amount: -balance[p.id] }));
  const creditors = allProfiles.filter(p => balance[p.id] > 0.01)
                               .map(p => ({ name: p.name, amount: balance[p.id] }));

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    payments.push({
      from:   debtors[i].name,
      to:     creditors[j].name,
      amount: Math.round(pay * 100) / 100,
    });
    debtors[i].amount   -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount   < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return { namedBalance, payments };
}

// ── Drive counts ────────────────────────────

// Get drives_reset_at from app_state, then count trips after that date
async function getDriveCountsSinceReset(allProfiles) {
  const resetAt = await getAppState('drives_reset_at');

  // Drives count ALL trips since last reset — independent of settlement status
  let query = db
    .from('trips')
    .select('paid_by, created_at, profiles!trips_paid_by_fkey ( name )');

  if (resetAt) query = query.gt('created_at', resetAt);

  const { data, error } = await query;
  if (error) throw error;

  const driveCount = {};
  allProfiles.forEach(p => { driveCount[p.name] = 0; });
  data.forEach(t => {
    const name = t.profiles?.name;
    if (name) driveCount[name] = (driveCount[name] || 0) + 1;
  });

  return driveCount;
}

// ── Current period stats (charts screen) ────

async function getCurrentStats() {
  // Ensure this user's trips are stamped for any completed settlement
  await stampOwnTripsForCompletedSettlements();

  const [trips, allProfiles] = await Promise.all([
    getUnsettledTrips(),
    getAllProfiles(),
  ]);

  const totalPaid  = trips.reduce((s, t) => s + Number(t.amount), 0);
  const tripCount  = trips.length;
  const avgPerTrip = tripCount > 0 ? totalPaid / tripCount : 0;

  const paidByPerson = {};
  allProfiles.forEach(p => { paidByPerson[p.name] = 0; });
  trips.forEach(t => {
    const name = t.profiles?.name;
    if (name) paidByPerson[name] = (paidByPerson[name] || 0) + Number(t.amount);
  });

  const driveCount = await getDriveCountsSinceReset(allProfiles);

  // Daily totals for bar chart
  const byDate = {};
  trips.forEach(t => {
    const d = new Date(t.date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    byDate[d] = (byDate[d] || 0) + Number(t.amount);
  });
  const chartData = Object.entries(byDate).slice(0, 14).reverse();

  const { namedBalance, payments } = calculateSettlement(trips, allProfiles);

  return { totalPaid, tripCount, avgPerTrip, paidByPerson, driveCount, chartData, namedBalance, payments, trips, allProfiles };
}

// ── Pending settlement ──────────────────────

async function getPendingSettlement() {
  const { data, error } = await db
    .from('settlements')
    .select(`
      id, initiated_by, initiated_at,
      profiles!settlements_initiated_by_fkey ( name ),
      settlement_confirmations ( user_id )
    `)
    .eq('is_complete', false)
    .eq('is_cancelled', false)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function initiateSettlement() {
  const user = getCurrentUser();
  if (!user) throw new Error('Not logged in');

  // Check none pending already
  const existing = await getPendingSettlement();
  if (existing) throw new Error('A settlement is already pending');

  const { data, error } = await db
    .from('settlements')
    .insert({ initiated_by: user.id, is_cancelled: false })
    .select()
    .single();
  if (error) throw error;

  // Auto-confirm for the initiator
  await confirmSettlement(data.id);
  return data;
}

async function confirmSettlement(settlementId) {
  const user = getCurrentUser();
  const { error } = await db
    .from('settlement_confirmations')
    .insert({ settlement_id: settlementId, user_id: user.id });
  if (error && !error.message.includes('duplicate')) throw error;

  // Check if all profiles have confirmed
  const allProfiles = await getAllProfiles();
  const { data: confirmations, error: fetchError } = await db
    .from('settlement_confirmations')
    .select('user_id')
    .eq('settlement_id', settlementId);

  if (fetchError) throw fetchError;
  if (!confirmations) throw new Error('Could not fetch confirmations');

  if (confirmations.length >= allProfiles.length) {
    await completeSettlement(settlementId, allProfiles);
  }
}

async function completeSettlement(settlementId, allProfiles) {
  // 1. Capture drive snapshot — skip if already exists (idempotent)
  const { data: existingSnap } = await db
    .from('settlement_drive_snapshot')
    .select('profile_id')
    .eq('settlement_id', settlementId)
    .limit(1);

  if (!existingSnap || existingSnap.length === 0) {
    const driveCount = await getDriveCountsSinceReset(allProfiles);
    const snapshots  = allProfiles.map(p => ({
      settlement_id: settlementId,
      profile_id:    p.id,
      drive_count:   driveCount[p.name] || 0,
    }));
    const { error: snapError } = await db
      .from('settlement_drive_snapshot')
      .insert(snapshots);
    if (snapError) throw snapError;
  }

  // 2. Mark settlement complete — any logged-in user can do this
  //    No-op if already marked complete by a previous confirmer
  const { error: completeError } = await db
    .from('settlements')
    .update({ is_complete: true, settled_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('is_complete', false);
  if (completeError) throw completeError;

  // 3. Each user stamps only THEIR OWN unsettled trips (respects RLS)
  const user = getCurrentUser();
  const { error: stampError } = await db
    .from('trips')
    .update({ settlement_id: settlementId })
    .is('settlement_id', null)
    .eq('paid_by', user.id);
  if (stampError) throw stampError;

  // 4. Pause to let Supabase propagate before re-fetch
  await new Promise(r => setTimeout(r, 500));
}

// Stamp current user's own un-stamped trips for any completed settlement
// Called on charts screen load — handles the case where the user confirmed
// but their trips weren't stamped yet (RLS only allows own-trip updates)
async function stampOwnTripsForCompletedSettlements() {
  const user = getCurrentUser();
  if (!user) return;

  // Find completed settlements with their settled_at timestamp
  const { data: completed, error } = await db
    .from('settlements')
    .select('id, settled_at')
    .eq('is_complete', true)
    .eq('is_cancelled', false)
    .order('settled_at', { ascending: false });

  if (error || !completed?.length) return;

  const latest = completed[0];

  // Only stamp trips created BEFORE the settlement completed
  // This prevents new trips (added after settlement) from being swallowed
  const { error: stampError } = await db
    .from('trips')
    .update({ settlement_id: latest.id })
    .is('settlement_id', null)
    .eq('paid_by', user.id)
    .lt('created_at', latest.settled_at);

  if (stampError) console.warn('Stamp own trips error:', stampError);
}

async function cancelSettlement(settlementId) {
  // Mark as cancelled via update (avoids RLS DELETE permission issues)
  // is_complete stays false, is_cancelled = true hides it from pending query
  const { error } = await db
    .from('settlements')
    .update({ is_cancelled: true })
    .eq('id', settlementId);
  if (error) throw error;
}

// ── Reset drives ────────────────────────────

async function resetDrives() {
  await setAppState('drives_reset_at', new Date().toISOString());
}

// ── History (completed settlements) ─────────

async function getSettlementHistory() {
  const { data: settlements, error } = await db
    .from('settlements')
    .select(`
      id, initiated_at, settled_at,
      settlement_drive_snapshot ( profile_id, drive_count, profiles ( name ) )
    `)
    .eq('is_complete', true)
    .order('settled_at', { ascending: false });

  if (error) throw error;
  if (!settlements.length) return [];

  const allProfiles = await getAllProfiles();
  const history     = [];

  for (const s of settlements) {
    const trips    = await getTripsForSettlement(s.id);
    const totalPaid = trips.reduce((sum, t) => sum + Number(t.amount), 0);
    const tripCount = trips.length;

    // Drive counts from snapshot
    const driveCount = {};
    allProfiles.forEach(p => { driveCount[p.name] = 0; });
    s.settlement_drive_snapshot.forEach(snap => {
      const name = snap.profiles?.name;
      if (name) driveCount[name] = snap.drive_count;
    });

    const { payments } = calculateSettlement(trips, allProfiles);

    const from = new Date(s.initiated_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const to   = new Date(s.settled_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const label = `${from} – ${to}`;

    history.push({ id: s.id, label, totalPaid, tripCount, driveCount, payments });
  }

  return history;
}