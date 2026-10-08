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

-- One row per logged workout session.
CREATE TABLE IF NOT EXISTS workouts (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS workouts_athlete_idx ON workouts (athlete_id, performed_at DESC);

-- Exercises in a logged workout; mirrors a BASE_WORKOUT row plus the weight used.
CREATE TABLE IF NOT EXISTS workout_exercises (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workout_id INT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise VARCHAR(100) NOT NULL,
  sets INT NOT NULL CHECK (sets > 0),
  reps VARCHAR(20) NOT NULL,
  weight NUMERIC(6, 2) CHECK (weight >= 0)
);
CREATE INDEX IF NOT EXISTS workout_exercises_workout_idx ON workout_exercises (workout_id);
