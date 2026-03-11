// ============================================
// db.js — All database operations
// ============================================

// ===== Profiles =====

async function getAllProfiles() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .order('name');
  if (error) throw error;
  return data; // [{ id, name }, ...]
}

// ===== Trips =====

// Log a new trip (payer + riders)
// riderIds: array of profile.id for everyone in the car INCLUDING the driver
async function addTrip(amount, note, riderIds) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not logged in');

  // 1. Insert the trip
  const { data: trip, error: tripError } = await db
    .from('trips')
    .insert({
      date:     new Date().toISOString().split('T')[0], // today YYYY-MM-DD
      paid_by:  user.id,
      amount:   Number(amount),
      note:     note || null,
    })
    .select()
    .single();

  if (tripError) throw tripError;

  // 2. Insert one trip_riders row per person in the car
  const riders = riderIds.map(rider_id => ({ trip_id: trip.id, rider_id }));

  const { error: ridersError } = await db
    .from('trip_riders')
    .insert(riders);

  if (ridersError) throw ridersError;

  return trip;
}

// Fetch all trips with their riders for a given month
// Returns trips enriched with payer name + rider list
async function getTripsForMonth(year, month) {
  // date range for the month
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to   = new Date(year, month, 0).toISOString().split('T')[0]; // last day

  const { data: trips, error } = await db
    .from('trips')
    .select(`
      id,
      date,
      amount,
      note,
      paid_by,
      profiles!trips_paid_by_fkey ( name ),
      trip_riders ( rider_id, profiles ( name ) )
    `)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });

  if (error) throw error;
  return trips;
}

// ===== Settlement calculation =====
// Takes the trips array from getTripsForMonth()
// Returns: { balances: { name: netAmount }, payments: [...] }
// Positive balance = is owed money, Negative = owes money
function calculateSettlement(trips, allProfiles) {
  // Initialise everyone at 0
  const balance = {};
  allProfiles.forEach(p => { balance[p.id] = 0; });

  trips.forEach(trip => {
    const ridersInTrip = trip.trip_riders;
    const numRiders    = ridersInTrip.length;
    if (numRiders === 0) return;

    const share = Number(trip.amount) / numRiders;

    // Payer gets credited the full amount
    balance[trip.paid_by] += Number(trip.amount);

    // Each rider owes their share
    ridersInTrip.forEach(r => {
      balance[r.rider_id] -= share;
    });
  });

  // Convert IDs to names for display
  const namedBalance = {};
  allProfiles.forEach(p => {
    namedBalance[p.name] = Math.round(balance[p.id] * 100) / 100;
  });

  // Derive the actual payments needed (who pays who)
  // Simple two-pointer approach: debtors pay creditors
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

// ===== Stats for charts screen =====
async function getStatsForMonth(year, month) {
  const trips      = await getTripsForMonth(year, month);
  const allProfiles = await getAllProfiles();

  const totalPaid  = trips.reduce((s, t) => s + Number(t.amount), 0);
  const tripCount  = trips.length;
  const avgPerTrip = tripCount > 0 ? totalPaid / tripCount : 0;

  // Per-person total paid
  const paidByPerson = {};
  allProfiles.forEach(p => { paidByPerson[p.name] = 0; });
  trips.forEach(t => {
    const name = t.profiles?.name;
    if (name) paidByPerson[name] = (paidByPerson[name] || 0) + Number(t.amount);
  });

  // Daily totals for bar chart (last 14 days of data)
  const byDate = {};
  trips.forEach(t => {
    const d = new Date(t.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    byDate[d] = (byDate[d] || 0) + Number(t.amount);
  });
  const chartData = Object.entries(byDate).slice(0, 14).reverse();

  const { namedBalance, payments } = calculateSettlement(trips, allProfiles);

  return {
    totalPaid,
    tripCount,
    avgPerTrip,
    paidByPerson,
    chartData,
    namedBalance,
    payments,
    trips,
    allProfiles,
  };
}