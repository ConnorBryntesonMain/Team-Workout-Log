import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";

const router = Router();

const wrap = (fn) => (req, res, next) =>
  fn(req, res, next).catch(next);

const ROLES = ["coach", "athlete"];

async function generateUniqueCoachCode() {
  while (true) {
    const code = String(
      Math.floor(100000 + Math.random() * 900000)
    );

    const { rows } = await pool.query(
      "SELECT id FROM users WHERE coach_code = $1",
      [code]
    );

    if (rows.length === 0) {
      return code;
    }
  }
}

router.post(
  "/register",
  wrap(async (req, res) => {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({
        error: "email, password, name, and role are required",
      });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        error: "role must be 'coach' or 'athlete'",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let coachCode;
    let athleteCode = null;

    if (role === "coach") {
      coachCode = await generateUniqueCoachCode();
    } else {
      // Required because coach_code is NOT NULL in your schema
      coachCode = "000000";
    }

    try {
      const { rows } = await pool.query(
        `
        INSERT INTO users (
          email,
          password_hash,
          name,
          role,
          coach_code,
          athlete_code
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, name, role, coach_code, athlete_code
        `,
        [
          email,
          passwordHash,
          name,
          role,
          coachCode,
          athleteCode,
        ]
      );

      const user = rows[0];

      req.session.userId = user.id;

      res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        coachCode: user.coach_code,
        athleteCode: user.athlete_code,
      });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: "email already registered",
        });
      }

      throw err;
    }
  })
);

router.post(
  "/login",
  wrap(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "email and password are required",
      });
    }

    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: "invalid email or password",
      });
    }

    req.session.userId = user.id;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      coachCode: user.coach_code,
      athleteCode: user.athlete_code,
    });
  })
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.get(
  "/me",
  wrap(async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        email,
        name,
        role,
        coach_code,
        athlete_code,
      created_at FROM users
      WHERE id = $1
      `,
      [req.session.userId]
    );

    if (!rows[0]) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    res.json({
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].name,
      role: rows[0].role,
      coachCode: rows[0].coach_code,
      athleteCode: rows[0].athlete_code,
      created_at: rows[0].created_at,
    });
  })
);

export default router;
