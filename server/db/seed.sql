-- Demo accounts. Both passwords are: password123
-- Security question for both: "What was the name of your first pet?" Answer: fluffy
-- The athlete is on the coach's team (athlete_code = coach's coach_code).
-- Safe to re-run: existing demo accounts get their security question and team restored.
INSERT INTO users (email, password_hash, name, role, coach_code, athlete_code, security_question, security_answer_hash) VALUES
  ('coach@demo.com', '$2b$10$shhR6Or08RLWUVyULqG0VOI12BCQwEg3e4AyNeVdK1MOSdyed573q', 'Demo Coach', 'coach', '123456', NULL,
   'What was the name of your first pet?', '$2b$10$EWbduCXI6uTlg8g3GDmk7uhmlG3WApL4rMTtbfdxqXhhgaPYnVDQe'),
  ('athlete@demo.com', '$2b$10$shhR6Or08RLWUVyULqG0VOI12BCQwEg3e4AyNeVdK1MOSdyed573q', 'Demo Athlete', 'athlete', '000000', '123456',
   'What was the name of your first pet?', '$2b$10$EWbduCXI6uTlg8g3GDmk7uhmlG3WApL4rMTtbfdxqXhhgaPYnVDQe')
ON CONFLICT (email) DO UPDATE SET
  athlete_code = EXCLUDED.athlete_code,
  security_question = EXCLUDED.security_question,
  security_answer_hash = EXCLUDED.security_answer_hash;

-- A starter workout so the athlete has something to log. Skipped if the coach already has it.
INSERT INTO coach_workouts (coach_id, name, exercises)
SELECT id, 'Full Body A', '[
  {"exercise": "Back Squat", "sets": 3, "reps": "5"},
  {"exercise": "Bench Press", "sets": 3, "reps": "5"},
  {"exercise": "Pull-ups", "sets": 3, "reps": "8-10"}
]'::jsonb
FROM users
WHERE email = 'coach@demo.com'
AND NOT EXISTS (
  SELECT 1 FROM coach_workouts w JOIN users c ON c.id = w.coach_id
  WHERE c.email = 'coach@demo.com' AND w.name = 'Full Body A'
);
