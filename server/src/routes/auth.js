import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post(
  "/register",
  wrap(async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const [result] = await pool.query(
        "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
        [email, passwordHash, name]
      );
      req.session.userId = result.insertId;
      res.status(201).json({ id: result.insertId, email, name });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
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

    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "invalid email or password" });
    }

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, name: user.name });
  })
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.get(
  "/me",
  wrap(async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "not logged in" });
    const [rows] = await pool.query("SELECT id, email, name FROM users WHERE id = ?", [
      req.session.userId,
    ]);
    if (!rows[0]) return res.status(401).json({ error: "not logged in" });
    res.json(rows[0]);
  })
);

export default router;
