// Integration tests: the real server (src/server.js) against a real PostgreSQL test database.
// Each test starts from empty tables and talks to the server over HTTP with real session cookies.
// Run with `npm run test:integration`. Uses the DB_* settings in .env, with DB_NAME + "_test".
import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import bcrypt from "bcrypt";
import pg from "pg";

const TEST_DB = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;
// The tests empty every table; never point them at a real database.
assert.match(TEST_DB, /_test$/, `refusing to run against "${TEST_DB}": the name must end in _test`);

const connection = (database) => ({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database,
});

let db;
let server;
let baseUrl;

before(async () => {
  const admin = new pg.Client(connection("postgres"));
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB]);
  if (rowCount === 0) await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  db = new pg.Client(connection(TEST_DB));
  await db.connect();
  await db.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));

  const port = await new Promise((resolve) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  baseUrl = `http://localhost:${port}`;
  server = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DB_NAME: TEST_DB, PORT: String(port), NODE_ENV: "test", SESSION_SECRET: "test-secret" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (chunk) => chunk.includes("Server listening") && resolve());
    server.once("exit", (code) => reject(new Error(`server exited with code ${code}`)));
  });
});

after(async () => {
  server?.kill();
  await db?.end();
});

beforeEach(() => db.query("TRUNCATE users, coach_workouts, workouts, workout_exercises RESTART IDENTITY CASCADE"));

// A browser stand-in: keeps the session cookie between requests.
function browser() {
  let cookie = "";
  return async function call(method, path, body) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { "content-type": "application/json", origin: "http://localhost:5173", ...(cookie && { cookie }) },
      body: body && JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie()[0];
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
}

let accounts = 0;
async function signUp(role, overrides = {}) {
  const call = browser();
  const res = await call("POST", "/api/auth/register", {
    email: `user${++accounts}@test.com`,
    password: "password1",
    name: `${role} ${accounts}`,
    role,
    securityQuestion: "First pet?",
    securityAnswer: "Rex",
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { call, user: res.body };
}

async function coachWithAthlete() {
  const coach = await signUp("coach");
  const athlete = await signUp("athlete");
  assert.equal((await athlete.call("POST", "/api/auth/join-team", { coachCode: coach.user.coachCode })).status, 200);
  return { coach, athlete };
}

const legs = { name: "  Legs  ", exercises: [{ exercise: " Squat ", sets: 2, reps: " 5 " }] };
const logBody = (coachWorkoutId, sets = [{ reps: "5", weight: 225.5 }, { reps: "5", weight: null }]) => ({
  coachWorkoutId,
  exercises: [{ exercise: "Squat", sets }],
});

describe("server wiring", () => {
  test("/health reports the database as connected", async () => {
    const res = await browser()("GET", "/health");
    assert.deepEqual(res.body, { status: "ok", db: "connected" });
  });

  test("CORS lets the client origin send cookies", async () => {
    const res = await browser()("GET", "/health");
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  });

  test("the session cookie is HttpOnly", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "c@test.com", password: "password1", name: "C", role: "coach", securityQuestion: "Q", securityAnswer: "A" }),
    });
    assert.match(res.headers.getSetCookie()[0], /HttpOnly/i);
  });
});

describe("accounts", () => {
  test("registering logs you in and stores hashed secrets", async () => {
    const { call, user } = await signUp("athlete", { securityAnswer: "  REX " });
    const me = await call("GET", "/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.email, user.email);
    assert.ok(me.body.created_at);

    const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [user.id]);
    assert.ok(await bcrypt.compare("password1", rows[0].password_hash));
    assert.ok(await bcrypt.compare("rex", rows[0].security_answer_hash));
    assert.equal(rows[0].coach_code, "000000");
  });

  test("coaches get distinct 6-digit codes", async () => {
    const codes = await Promise.all([1, 2, 3].map(async () => (await signUp("coach")).user.coachCode));
    for (const code of codes) assert.match(code, /^\d{6}$/);
    assert.equal(new Set(codes).size, 3);
  });

  test("a second account with the same email gets 409 from the unique constraint", async () => {
    await signUp("athlete", { email: "dup@test.com" });
    const res = await browser()("POST", "/api/auth/register", {
      email: "dup@test.com", password: "password1", name: "B", role: "athlete", securityQuestion: "Q", securityAnswer: "A",
    });
    assert.equal(res.status, 409);
  });

  test("logging out ends the session; logging in starts a new one", async () => {
    const { call, user } = await signUp("athlete");
    assert.equal((await call("POST", "/api/auth/logout")).status, 204);
    assert.equal((await call("GET", "/api/auth/me")).status, 401);

    assert.equal((await call("POST", "/api/auth/login", { email: user.email, password: "wrongpass" })).status, 401);
    assert.equal((await call("POST", "/api/auth/login", { email: user.email, password: "password1" })).status, 200);
    assert.equal((await call("GET", "/api/auth/me")).body.id, user.id);
  });

  test("changing your password replaces the old one", async () => {
    const { call, user } = await signUp("athlete");
    const res = await call("POST", "/api/auth/change-password", { currentPassword: "password1", newPassword: "newpass12" });
    assert.equal(res.status, 200);
    const login = browser();
    assert.equal((await login("POST", "/api/auth/login", { email: user.email, password: "password1" })).status, 401);
    assert.equal((await login("POST", "/api/auth/login", { email: user.email, password: "newpass12" })).status, 200);
  });

  test("forgot password: question, answer (any case), new password", async () => {
    const { user } = await signUp("athlete");
    const call = browser();
    const question = await call("POST", "/api/auth/security-question", { email: user.email });
    assert.equal(question.body.securityQuestion, "First pet?");

    const wrong = await call("POST", "/api/auth/reset-password", { email: user.email, securityAnswer: "Fido", newPassword: "newpass12" });
    assert.equal(wrong.status, 401);
    const right = await call("POST", "/api/auth/reset-password", { email: user.email, securityAnswer: " rEx ", newPassword: "newpass12" });
    assert.equal(right.status, 200);
    assert.equal((await call("POST", "/api/auth/login", { email: user.email, password: "newpass12" })).status, 200);
  });
});

describe("teams", () => {
  test("joining links athlete and coach in both directions", async () => {
    const { coach, athlete } = await coachWithAthlete();
    const me = await athlete.call("GET", "/api/auth/me");
    assert.equal(me.body.athleteCode, coach.user.coachCode);
    assert.equal(me.body.coachName, coach.user.name);

    const team = await coach.call("GET", "/api/auth/team");
    assert.deepEqual(team.body, [{ id: athlete.user.id, name: athlete.user.name, email: athlete.user.email }]);
  });

  test("an unknown code is rejected and nothing changes", async () => {
    const athlete = await signUp("athlete");
    assert.equal((await athlete.call("POST", "/api/auth/join-team", { coachCode: "999999" })).status, 404);
    assert.equal((await athlete.call("GET", "/api/auth/me")).body.athleteCode, null);
  });

  test("leaving removes the athlete from the team and hides its workouts", async () => {
    const { coach, athlete } = await coachWithAthlete();
    await coach.call("POST", "/api/workouts", legs);
    assert.equal((await athlete.call("GET", "/api/workouts")).body.length, 1);

    await athlete.call("POST", "/api/auth/leave-team");
    assert.deepEqual((await coach.call("GET", "/api/auth/team")).body, []);
    assert.deepEqual((await athlete.call("GET", "/api/workouts")).body, []);
    assert.equal((await athlete.call("GET", "/api/auth/me")).body.coachName, null);
  });

  test("a coach only sees their own athletes", async () => {
    await coachWithAthlete();
    const other = await signUp("coach");
    assert.deepEqual((await other.call("GET", "/api/auth/team")).body, []);
  });
});

describe("coach workouts", () => {
  test("created trimmed, listed by name, and shared with the team only", async () => {
    const { coach, athlete } = await coachWithAthlete();
    const created = await coach.call("POST", "/api/workouts", legs);
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.exercises, [{ exercise: "Squat", sets: 2, reps: "5" }]);
    await coach.call("POST", "/api/workouts", { ...legs, name: "Arms" });

    const names = (res) => res.body.map((w) => w.name);
    assert.deepEqual(names(await coach.call("GET", "/api/workouts")), ["Arms", "Legs"]);
    assert.deepEqual(names(await athlete.call("GET", "/api/workouts")), ["Arms", "Legs"]);
    const outsider = await signUp("athlete");
    assert.deepEqual((await outsider.call("GET", "/api/workouts")).body, []);
  });

  test("edits are saved", async () => {
    const coach = await signUp("coach");
    const { body: w } = await coach.call("POST", "/api/workouts", legs);
    const res = await coach.call("PUT", `/api/workouts/${w.id}`, { ...legs, name: "Leg Day" });
    assert.equal(res.status, 200);
    assert.deepEqual((await coach.call("GET", "/api/workouts")).body.map((x) => x.name), ["Leg Day"]);
  });

  test("another coach can't edit or delete it", async () => {
    const coach = await signUp("coach");
    const { body: w } = await coach.call("POST", "/api/workouts", legs);
    const other = await signUp("coach");
    assert.equal((await other.call("PUT", `/api/workouts/${w.id}`, { ...legs, name: "Hijacked" })).status, 404);
    assert.equal((await other.call("DELETE", `/api/workouts/${w.id}`)).status, 404);
    assert.deepEqual((await coach.call("GET", "/api/workouts")).body.map((x) => x.name), ["Legs"]);
  });

  test("athletes can't create workouts", async () => {
    const athlete = await signUp("athlete");
    assert.equal((await athlete.call("POST", "/api/workouts", legs)).status, 403);
  });
});

describe("workout logs", () => {
  async function loggedWorkout() {
    const pair = await coachWithAthlete();
    const { body: workout } = await pair.coach.call("POST", "/api/workouts", legs);
    const res = await pair.athlete.call("POST", "/api/workouts/log", logBody(workout.id));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return { ...pair, workout, logId: res.body.id };
  }

  test("a log comes back with its sets in order and bodyweight as null", async () => {
    const { athlete, workout, logId } = await loggedWorkout();
    const { body: log } = await athlete.call("GET", "/api/workouts/log");
    assert.equal(log.length, 1);
    assert.equal(log[0].id, logId);
    assert.equal(log[0].name, "Legs");
    assert.equal(log[0].coach_workout_id, workout.id);
    assert.deepEqual(log[0].exercises, [
      { exercise: "Squat", set: 1, reps: "5", weight: 225.5 },
      { exercise: "Squat", set: 2, reps: "5", weight: null },
    ]);
  });

  test("the heaviest weight NUMERIC(6,2) allows is stored exactly", async () => {
    const { coach, athlete } = await coachWithAthlete();
    const { body: w } = await coach.call("POST", "/api/workouts", legs);
    const res = await athlete.call("POST", "/api/workouts/log", logBody(w.id, [{ reps: "1", weight: 9999.99 }]));
    assert.equal(res.status, 201);
    assert.equal((await athlete.call("GET", "/api/workouts/log")).body[0].exercises[0].weight, 9999.99);
  });

  test("logs are listed newest first", async () => {
    const { athlete, workout, logId } = await loggedWorkout();
    const { body: second } = await athlete.call("POST", "/api/workouts/log", logBody(workout.id));
    await db.query("UPDATE workouts SET performed_at = now() - interval '1 day' WHERE id = $1", [second.id]);
    assert.deepEqual((await athlete.call("GET", "/api/workouts/log")).body.map((l) => l.id), [logId, second.id]);
  });

  test("editing a log replaces all of its sets", async () => {
    const { athlete, workout, logId } = await loggedWorkout();
    const res = await athlete.call("PUT", `/api/workouts/log/${logId}`, logBody(workout.id, [{ reps: "3", weight: 245 }]));
    assert.equal(res.status, 200);
    assert.deepEqual((await athlete.call("GET", "/api/workouts/log")).body[0].exercises, [
      { exercise: "Squat", set: 1, reps: "3", weight: 245 },
    ]);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM workout_exercises WHERE workout_id = $1", [logId]);
    assert.equal(rows[0].n, 1);
  });

  test("deleting a log deletes its sets", async () => {
    const { athlete, logId } = await loggedWorkout();
    assert.equal((await athlete.call("DELETE", `/api/workouts/log/${logId}`)).status, 204);
    assert.deepEqual((await athlete.call("GET", "/api/workouts/log")).body, []);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM workout_exercises");
    assert.equal(rows[0].n, 0);
  });

  test("another athlete can't edit or delete it", async () => {
    const { workout, logId } = await loggedWorkout();
    const other = await signUp("athlete");
    assert.equal((await other.call("PUT", `/api/workouts/log/${logId}`, logBody(workout.id))).status, 404);
    assert.equal((await other.call("DELETE", `/api/workouts/log/${logId}`)).status, 404);
  });

  test("an athlete can't log a workout from a team they aren't on", async () => {
    const { workout } = await loggedWorkout();
    const outsider = await signUp("athlete");
    assert.equal((await outsider.call("POST", "/api/workouts/log", logBody(workout.id))).status, 404);
  });

  test("the coach can read their athlete's log; other coaches can't", async () => {
    const { coach, athlete, logId } = await loggedWorkout();
    const res = await coach.call("GET", `/api/workouts/log?athleteId=${athlete.user.id}`);
    assert.deepEqual(res.body.map((l) => l.id), [logId]);
    const other = await signUp("coach");
    assert.equal((await other.call("GET", `/api/workouts/log?athleteId=${athlete.user.id}`)).status, 404);
  });

  test("deleting a coach workout keeps athletes' logs, unlinked", async () => {
    const { coach, athlete, workout } = await loggedWorkout();
    assert.equal((await coach.call("DELETE", `/api/workouts/${workout.id}`)).status, 204);
    const [entry] = (await athlete.call("GET", "/api/workouts/log")).body;
    assert.equal(entry.name, null);
    assert.equal(entry.coach_workout_id, null);
    assert.equal(entry.exercises.length, 2);
  });

  test("deleting an account removes its logs", async () => {
    const { athlete } = await loggedWorkout();
    await db.query("DELETE FROM users WHERE id = $1", [athlete.user.id]);
    const { rows } = await db.query("SELECT (SELECT count(*) FROM workouts)::int AS w, (SELECT count(*) FROM workout_exercises)::int AS e");
    assert.deepEqual(rows[0], { w: 0, e: 0 });
  });
});
