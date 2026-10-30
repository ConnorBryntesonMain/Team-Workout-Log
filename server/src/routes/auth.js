import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";

const router = Router();

const wrap = (fn) => (req, res, next) =>
  fn(req, res, next).catch(next);

const ROLES = ["coach", "athlete"];
const MIN_PASSWORD = 8;
const shortPassword = (res) =>
  res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });

// Answers are compared case- and whitespace-insensitively.
const normalizeAnswer = (answer) => answer.trim().toLowerCase();

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
    const { email, password, name, role, securityQuestion, securityAnswer } = req.body;

    if (!email || !password || !name || !role || !securityQuestion || !securityAnswer?.trim()) {
      return res.status(400).json({
        error: "email, password, name, role, securityQuestion, and securityAnswer are required",
      });
    }

    if (password.length < MIN_PASSWORD) {
      return shortPassword(res);
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        error: "role must be 'coach' or 'athlete'",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const answerHash = await bcrypt.hash(normalizeAnswer(securityAnswer), 10);

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
          athlete_code,
          security_question,
          security_answer_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, email, name, role, coach_code, athlete_code
        `,
        [
          email,
          passwordHash,
          name,
          role,
          coachCode,
          athleteCode,
          securityQuestion,
          answerHash,
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

router.post(
  "/join-team",
  wrap(async (req, res) => {
    const { coachCode } = req.body;

    if (!req.session.userId) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    const coachResult = await pool.query(
      `
      SELECT id
      FROM users
      WHERE role = 'coach'
      AND coach_code = $1
      `,
      [coachCode]
    );

    if (coachResult.rows.length === 0) {
      return res.status(404).json({
        error: "team code does not exist",
      });
    }

    await pool.query(
      `
      UPDATE users
      SET athlete_code = $1
      WHERE id = $2
      `,
      [coachCode, req.session.userId]
    );

    res.json({
      athleteCode: coachCode,
    });
  })
);

router.post(
  "/leave-team",
  wrap(async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    await pool.query(
      `
      UPDATE users
      SET athlete_code = NULL
      WHERE id = $1
      `,
      [req.session.userId]
    );

    res.json({
      success: true,
    });
  })
);

router.get(
  "/team",
  wrap(async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    const { rows } = await pool.query(
      `
      SELECT a.id, a.name, a.email
      FROM users c
      JOIN users a
        ON a.athlete_code = c.coach_code
      AND a.role = 'athlete'
      WHERE c.id = $1
      AND c.role = 'coach'
      ORDER BY a.name
      `,
      [req.session.userId]
    );

    res.json(rows);
  })
);

// Forgot-password step 1: look up the account's security question.
router.post(
  "/security-question",
  wrap(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT security_question FROM users WHERE email = $1",
      [req.body.email]
    );

    if (!rows[0]?.security_question) {
      return res.status(404).json({
        error: "no security question found for that email",
      });
    }

    res.json({
      securityQuestion: rows[0].security_question,
    });
  })
);

// Forgot-password step 2: a correct answer sets the new password.
// ponytail: no rate limiting on answer guesses; add express-rate-limit before real deployment.
router.post(
  "/reset-password",
  wrap(async (req, res) => {
    const { email, securityAnswer, newPassword } = req.body;

    if (!email || !securityAnswer || !newPassword) {
      return res.status(400).json({
        error: "email, securityAnswer, and newPassword are required",
      });
    }

    if (newPassword.length < MIN_PASSWORD) {
      return shortPassword(res);
    }

    const { rows } = await pool.query(
      "SELECT id, security_answer_hash FROM users WHERE email = $1",
      [email]
    );

    const user = rows[0];

    if (
      !user?.security_answer_hash ||
      !(await bcrypt.compare(normalizeAnswer(securityAnswer), user.security_answer_hash))
    ) {
      return res.status(401).json({
        error: "incorrect security answer",
      });
    }

    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [await bcrypt.hash(newPassword, 10), user.id]
    );

    res.json({
      success: true,
    });
  })
);

router.post(
  "/change-password",
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!req.session.userId) {
      return res.status(401).json({
        error: "not logged in",
      });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "currentPassword and newPassword are required",
      });
    }

    if (newPassword.length < MIN_PASSWORD) {
      return shortPassword(res);
    }

    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.session.userId]
    );

    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(401).json({
        error: "current password is incorrect",
      });
    }

    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [await bcrypt.hash(newPassword, 10), req.session.userId]
    );

    res.json({
      success: true,
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
        u.id,
        u.email,
        u.name,
        u.role,
        u.coach_code,
        u.athlete_code,
        u.created_at,
        c.name AS coach_name
      FROM users u
      LEFT JOIN users c
        ON u.athlete_code = c.coach_code
      AND c.role = 'coach'
      WHERE u.id = $1
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
      coachName: rows[0].coach_name,
      created_at: rows[0].created_at,
    });
  })
);

export default router;
