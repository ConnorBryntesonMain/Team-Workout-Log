CREATE TABLE IF NOT EXISTS users (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'athlete' CHECK (role IN ('coach', 'athlete')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  coach_code VARCHAR(6) NOT NULL,
  athlete_code VARCHAR(6)
);

-- Workouts a coach builds for their team; exercises is [{exercise, sets, reps}].
CREATE TABLE IF NOT EXISTS coach_workouts (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  exercises JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS coach_workouts_coach_idx ON coach_workouts (coach_id);

-- One row per logged workout session.
CREATE TABLE IF NOT EXISTS workouts (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_workout_id INT REFERENCES coach_workouts(id) ON DELETE SET NULL,
  performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS workouts_athlete_idx ON workouts (athlete_id, performed_at DESC);

-- One row per set in a logged workout: the reps the athlete did and the weight used.
CREATE TABLE IF NOT EXISTS workout_exercises (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workout_id INT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise VARCHAR(100) NOT NULL,
  set_number INT NOT NULL CHECK (set_number > 0),
  reps VARCHAR(20) NOT NULL,
  weight NUMERIC(6, 2) CHECK (weight >= 0)
);
CREATE INDEX IF NOT EXISTS workout_exercises_workout_idx ON workout_exercises (workout_id);
