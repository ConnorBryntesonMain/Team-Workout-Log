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
    "SELECT id, role, athlete_code, coach_code FROM users WHERE id = $1",
    [req.session.userId]
  );

  return rows[0] || null;
}

// Returns an error string, or null if every { exercise, sets, reps } is valid.
function validateExercises(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return "at least one exercise is required";
  }

  for (const e of exercises) {
    if (typeof e?.exercise !== "string" || !e.exercise.trim() || e.exercise.length > 100) {
      return "every exercise needs a name (max 100 characters)";
    }

    if (!Number.isInteger(e.sets) || e.sets < 1) {
      return "sets must be a whole number of at least 1";
    }

    if (typeof e.reps !== "string" || !e.reps.trim() || e.reps.length > 20) {
      return "every exercise needs reps (max 20 characters)";
    }
  }

  return null;
}

// Returns an error string, or null if { name, exercises } is valid.
export function validateWorkout({ name, exercises }) {
  if (typeof name !== "string" || !name.trim() || name.length > 100) {
    return "name is required (max 100 characters)";
  }

  return validateExercises(exercises);
}

// Returns an error string, or null if every { exercise, sets: [{ reps, weight }] } is valid.
// weight is optional (null = bodyweight).
export function validateLog({ exercises }) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return "at least one exercise is required";
  }

  for (const e of exercises) {
    if (typeof e?.exercise !== "string" || !e.exercise.trim() || e.exercise.length > 100) {
      return "every exercise needs a name (max 100 characters)";
    }

    if (!Array.isArray(e.sets) || e.sets.length === 0) {
      return "every exercise needs at least one set";
    }

    for (const set of e.sets) {
      if (typeof set?.reps !== "string" || !set.reps.trim() || set.reps.length > 20) {
        return "every set needs reps (max 20 characters)";
      }

      // weight is NUMERIC(6, 2) in the DB
      if (set.weight != null && !(Number.isFinite(set.weight) && set.weight >= 0 && set.weight < 10000)) {
        return "weight must be a number between 0 and 9999";
      }
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

// An athlete's logged workouts, newest first; exercises is one entry per set.
// Athletes get their own; coaches pass ?athleteId= for an athlete on their team.
router.get(
  "/log",
  wrap(async (req, res) => {
    const user = await currentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    let athleteId = user.id;

    if (user.role === "coach") {
      const { rows: athlete } = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id = $1
        AND role = 'athlete'
        AND athlete_code = $2
        `,
        [parseInt(req.query.athleteId, 10) || 0, user.coach_code]
      );

      if (!athlete[0]) {
        return res.status(404).json({
          error: "athlete not found on your team",
        });
      }

      athleteId = athlete[0].id;
    }

    const { rows } = await pool.query(
      `
      SELECT
        w.id,
        w.performed_at,
        cw.name,
        json_agg(
          json_build_object('exercise', e.exercise, 'set', e.set_number, 'reps', e.reps, 'weight', e.weight)
          ORDER BY e.id
        ) AS exercises
      FROM workouts w
      LEFT JOIN coach_workouts cw
        ON cw.id = w.coach_workout_id
      JOIN workout_exercises e
        ON e.workout_id = w.id
      WHERE w.athlete_id = $1
      GROUP BY w.id, cw.name
      ORDER BY w.performed_at DESC
      `,
      [athleteId]
    );

    res.json(rows);
  })
);

// An athlete logs one of their coach's workouts with the reps and weight of each set.
router.post(
  "/log",
  wrap(async (req, res) => {
    const user = await currentUser(req);

    if (user?.role !== "athlete") {
      return res.status(403).json({
        error: "only athletes can log workouts",
      });
    }

    const error = Number.isInteger(req.body.coachWorkoutId)
      ? validateLog(req.body)
      : "coachWorkoutId is required";

    if (error) {
      return res.status(400).json({ error });
    }

    const { rows: coachWorkout } = await pool.query(
      `
      SELECT w.id
      FROM coach_workouts w
      JOIN users c
        ON c.id = w.coach_id
      WHERE w.id = $1
      AND c.coach_code = $2
      `,
      [req.body.coachWorkoutId, user.athlete_code]
    );

    if (!coachWorkout[0]) {
      return res.status(404).json({
        error: "workout not found on your team",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `
        INSERT INTO workouts (athlete_id, coach_workout_id)
        VALUES ($1, $2)
        RETURNING id
        `,
        [user.id, coachWorkout[0].id]
      );

      for (const e of req.body.exercises) {
        for (const [i, set] of e.sets.entries()) {
          await client.query(
            `
            INSERT INTO workout_exercises (workout_id, exercise, set_number, reps, weight)
            VALUES ($1, $2, $3, $4, $5)
            `,
            [rows[0].id, e.exercise.trim(), i + 1, set.reps.trim(), set.weight ?? null]
          );
        }
      }

      await client.query("COMMIT");
      res.status(201).json({ id: rows[0].id });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
