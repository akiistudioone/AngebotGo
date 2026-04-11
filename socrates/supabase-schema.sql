-- ============================================================
-- SOCRATES — SUPABASE DATENBANKSCHEMA
-- Ausführen in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ---- PROFILES ----
CREATE TABLE IF NOT EXISTS profiles (
  id                UUID REFERENCES auth.users PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  name              TEXT,
  onboarding_done   BOOLEAN DEFAULT FALSE,
  streak_count      INTEGER DEFAULT 0,
  last_session_date DATE,
  orb_energy        NUMERIC DEFAULT 1.0,  -- 0.0 bis 1.0
  total_sessions    INTEGER DEFAULT 0,
  insights_unlocked INTEGER DEFAULT 0,
  reflection_time   TEXT DEFAULT 'abend', -- 'morgen' | 'mittag' | 'abend'
  motivation        TEXT                  -- Onboarding-Antwort
);

-- ---- SESSIONS ----
CREATE TABLE IF NOT EXISTS sessions (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  date               DATE DEFAULT CURRENT_DATE,
  state_answer       TEXT,           -- Wie geht es dir heute?
  topic_answer       TEXT,           -- Was beschäftigt dich?
  shadow_answer      TEXT,           -- Was ist der Schatten?
  intention_answer   TEXT,           -- Was möchtest du erkennen?
  dialogue_log       JSONB,          -- Vollständiges Gespräch als Array
  aha_moment         TEXT,           -- Erkannter Durchbruch
  closing_insight    TEXT,           -- Abschluss-Erkenntnis
  exercise_tomorrow  TEXT,           -- Übung für morgen
  completed          BOOLEAN DEFAULT FALSE,
  duration_seconds   INTEGER
);

-- ---- PATTERNS ----
CREATE TABLE IF NOT EXISTS patterns (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  detected_at  TIMESTAMPTZ DEFAULT NOW(),
  pattern_type TEXT,          -- z.B. "Vermeidung", "Perfektionismus"
  description  TEXT,
  session_ids  UUID[],        -- Welche Sessions belegen das Muster
  times_seen   INTEGER DEFAULT 1,
  acknowledged BOOLEAN DEFAULT FALSE
);

-- ---- INSIGHTS ----
CREATE TABLE IF NOT EXISTS insights (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES sessions(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  content          TEXT,              -- Die Erkenntnis in eigenen Worten
  form_recognized  TEXT,             -- Welche "Form" erkannt wurde
  is_starred       BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- Sessions RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Patterns RLS
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own patterns"
  ON patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own patterns"
  ON patterns FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role kann patterns schreiben (für insights-engine Function)
CREATE POLICY "Service can insert patterns"
  ON patterns FOR INSERT
  WITH CHECK (true);  -- Nur mit SUPABASE_SERVICE_KEY möglich

-- Insights RLS
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own insights"
  ON insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights"
  ON insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insights"
  ON insights FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own insights"
  ON insights FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS sessions_user_id_date_idx ON sessions(user_id, date);
CREATE INDEX IF NOT EXISTS sessions_user_completed_idx ON sessions(user_id, completed);
CREATE INDEX IF NOT EXISTS insights_user_id_idx ON insights(user_id);
CREATE INDEX IF NOT EXISTS insights_starred_idx ON insights(user_id, is_starred);
CREATE INDEX IF NOT EXISTS patterns_user_id_idx ON patterns(user_id);

-- ============================================================
-- TRIGGER: Profile bei neuem Auth-User anlegen
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
