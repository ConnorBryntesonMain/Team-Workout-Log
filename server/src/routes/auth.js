import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const ROLES = ["coach", "athlete"];

router.post(
  "/register",
  wrap(async (req, res) => {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: "email, password, name, and role are required" });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "role must be 'coach' or 'athlete'" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id",
        [email, passwordHash, name, role]
      );
      req.session.userId = rows[0].id;
      res.status(201).json({ id: rows[0].id, email, name, role });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "email already registered" });
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
      return res.status(400).json({ error: "email and password are required" });
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "invalid email or password" });
    }

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  })
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.get(
  "/me",
  wrap(async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "not logged in" });
    const { rows } = await pool.query("SELECT id, email, name, role FROM users WHERE id = $1", [
      req.session.userId,
    ]);
    if (!rows[0]) return res.status(401).json({ error: "not logged in" });
    res.json(rows[0]);
  })
);

export default router;
