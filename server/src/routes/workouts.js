import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const wrap = (fn) => (req, res, next) =>
  fn(req, res, next).catch(next);

async function currentUser(req) {
  if (!req.session.userId) {
    return null;
  }

  const { rows } = await pool.query(
    "SELECT id, role, athlete_code FROM users WHERE id = $1",
    [req.session.userId]
  );

  return rows[0] || null;
}

// Returns an error string, or null if { name, exercises } is valid.
export function validateWorkout({ name, exercises }) {
  if (typeof name !== "string" || !name.trim() || name.length > 100) {
    return "name is required (max 100 characters)";
  }

  if (!Array.isArray(exercises) || exercises.length === 0) {
    return "at least one exercise is required";
  }

  for (const e of exercises) {
    if (typeof e?.exercise !== "string" || !e.exercise.trim()) {
      return "every exercise needs a name";
    }

    if (!Number.isInteger(e.sets) || e.sets < 1) {
      return "sets must be a whole number of at least 1";
    }

    if (typeof e.reps !== "string" || !e.reps.trim()) {
      return "every exercise needs reps";
    }
  }

  return null;
}

const cleanExercises = (exercises) =>
  exercises.map((e) => ({
    exercise: e.exercise.trim(),
    sets: e.sets,
    reps: e.reps.trim(),
  }));

// Coaches get the workouts they built; athletes get their coach's.
router.get(
  "/",
  wrap(async (req, res) => {
    const user = await currentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    const { rows } = user.role === "coach"
      ? await pool.query(
          "SELECT id, name, exercises FROM coach_workouts WHERE coach_id = $1 ORDER BY name",
          [user.id]
        )
      : await pool.query(
          `
          SELECT w.id, w.name, w.exercises
          FROM coach_workouts w
          JOIN users c
            ON c.id = w.coach_id
          AND c.role = 'coach'
          WHERE c.coach_code = $1
          ORDER BY w.name
          `,
          [user.athlete_code]
        );

    res.json(rows);
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const user = await currentUser(req);

    if (user?.role !== "coach") {
      return res.status(403).json({
        error: "only coaches can create workouts",
      });
    }

    const error = validateWorkout(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO coach_workouts (coach_id, name, exercises)
      VALUES ($1, $2, $3)
      RETURNING id, name, exercises
      `,
      [user.id, req.body.name.trim(), JSON.stringify(cleanExercises(req.body.exercises))]
    );

    res.status(201).json(rows[0]);
  })
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const user = await currentUser(req);

    if (user?.role !== "coach") {
      return res.status(403).json({
        error: "only coaches can edit workouts",
      });
    }

    const error = validateWorkout(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const { rows } = await pool.query(
      `
      UPDATE coach_workouts
      SET name = $1, exercises = $2
      WHERE id = $3
      AND coach_id = $4
      RETURNING id, name, exercises
      `,
      [req.body.name.trim(), JSON.stringify(cleanExercises(req.body.exercises)), req.params.id, user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "workout not found",
      });
    }

    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const user = await currentUser(req);

    if (user?.role !== "coach") {
      return res.status(403).json({
        error: "only coaches can delete workouts",
      });
    }

    const { rowCount } = await pool.query(
      "DELETE FROM coach_workouts WHERE id = $1 AND coach_id = $2",
      [req.params.id, user.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        error: "workout not found",
      });
    }

    res.status(204).end();
  })
);

export default router;
