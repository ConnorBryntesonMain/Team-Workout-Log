-- Demo accounts. Both passwords are: password123
-- Safe to re-run: existing emails are skipped.
INSERT INTO users (email, password_hash, name, role, coach_code, athlete_code) VALUES
  ('coach@demo.com', '$2b$10$shhR6Or08RLWUVyULqG0VOI12BCQwEg3e4AyNeVdK1MOSdyed573q', 'Demo Coach', 'coach', '123456', NULL),
  ('athlete@demo.com', '$2b$10$shhR6Or08RLWUVyULqG0VOI12BCQwEg3e4AyNeVdK1MOSdyed573q', 'Demo Athlete', 'athlete', '000000', NULL)
ON CONFLICT (email) DO NOTHING;
