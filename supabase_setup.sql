-- ============================================
-- Saamry — Supabase setup
-- Run this entire file once in the SQL Editor
-- on a fresh project.
-- ============================================


-- ── Core tables ─────────────────────────────

CREATE TABLE profiles (
  id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE settlements (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  initiated_by UUID REFERENCES profiles(id),
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at   TIMESTAMPTZ,
  is_complete  BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE
);

CREATE TABLE trips (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date          DATE NOT NULL,
  paid_by       UUID NOT NULL REFERENCES profiles(id),
  amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  note          TEXT,
  settlement_id UUID REFERENCES settlements(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trip_riders (
  trip_id  UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES profiles(id),
  PRIMARY KEY (trip_id, rider_id)
);

CREATE TABLE settlement_confirmations (
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id),
  confirmed_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (settlement_id, user_id)
);

CREATE TABLE settlement_drive_snapshot (
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL REFERENCES profiles(id),
  drive_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (settlement_id, profile_id)
);

CREATE TABLE app_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);


-- ── Row Level Security ───────────────────────

ALTER TABLE profiles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_riders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements                ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_confirmations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_drive_snapshot  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_state                  ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: read all"
  ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);

-- trips
CREATE POLICY "trips: read all"
  ON trips FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "trips: insert own"
  ON trips FOR INSERT WITH CHECK (auth.uid() = paid_by);

CREATE POLICY "trips: update settlement"
  ON trips FOR UPDATE USING (auth.uid() IS NOT NULL);

-- trip_riders
CREATE POLICY "trip_riders: read all"
  ON trip_riders FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "trip_riders: insert"
  ON trip_riders FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- settlements
CREATE POLICY "settlements: read all"
  ON settlements FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "settlements: insert"
  ON settlements FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "settlements: update"
  ON settlements FOR UPDATE USING (auth.uid() IS NOT NULL);

-- settlement_confirmations
CREATE POLICY "confirmations: read all"
  ON settlement_confirmations FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "confirmations: insert"
  ON settlement_confirmations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "confirmations: delete"
  ON settlement_confirmations FOR DELETE USING (auth.uid() IS NOT NULL);

-- settlement_drive_snapshot
CREATE POLICY "drive_snapshot: read all"
  ON settlement_drive_snapshot FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "drive_snapshot: insert"
  ON settlement_drive_snapshot FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- app_state
CREATE POLICY "app_state: read all"
  ON app_state FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "app_state: insert"
  ON app_state FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "app_state: update"
  ON app_state FOR UPDATE USING (auth.uid() IS NOT NULL);