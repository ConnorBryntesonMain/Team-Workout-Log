import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import router, { validateLog, validateWorkout } from "./workouts.js";
import { request, sqlOf, stubClient, stubQuery } from "../testApp.js";

afterEach(() => mock.restoreAll());

const coach = { rows: [{ id: 1, role: "coach", coach_code: "123456", athlete_code: null }] };
const athlete = { rows: [{ id: 2, role: "athlete", coach_code: "000000", athlete_code: "123456" }] };
const session = { userId: 1 };

describe("validateWorkout", () => {
  const ok = { name: "Leg Day", exercises: [{ exercise: "Squat", sets: 3, reps: "8" }] };

  test("accepts a valid workout", () => assert.equal(validateWorkout(ok), null));
  test("rejects a blank name", () => assert.ok(validateWorkout({ ...ok, name: " " })));
  test("rejects a name over 100 chars", () => assert.ok(validateWorkout({ ...ok, name: "x".repeat(101) })));
  test("rejects no exercises", () => assert.ok(validateWorkout({ ...ok, exercises: [] })));
  test("rejects zero sets", () => assert.ok(validateWorkout({ ...ok, exercises: [{ exercise: "Squat", sets: 0, reps: "8" }] })));
  test("rejects fractional sets", () => assert.ok(validateWorkout({ ...ok, exercises: [{ exercise: "Squat", sets: 2.5, reps: "8" }] })));
  test("rejects blank reps", () => assert.ok(validateWorkout({ ...ok, exercises: [{ exercise: "Squat", sets: 3, reps: "" }] })));
  test("rejects a null exercise", () => assert.ok(validateWorkout({ ...ok, exercises: [null] })));
});

describe("validateLog", () => {
  const set = { reps: "8", weight: 225 };
  const log = (sets) => ({ exercises: [{ exercise: "Squat", sets }] });

  test("accepts a valid log", () => assert.equal(validateLog(log([set, { reps: "6", weight: 245 }])), null));
  test("accepts bodyweight (null weight)", () => assert.equal(validateLog(log([{ reps: "30 sec", weight: null }])), null));
  test("accepts weight 0", () => assert.equal(validateLog(log([{ ...set, weight: 0 }])), null));
  test("rejects no exercises", () => assert.ok(validateLog({ exercises: [] })));
  test("rejects no sets", () => assert.ok(validateLog(log([]))));
  test("rejects sets as a number", () => assert.ok(validateLog(log(3))));
  test("rejects blank reps", () => assert.ok(validateLog(log([{ ...set, reps: "" }]))));
  test("rejects negative weight", () => assert.ok(validateLog(log([{ ...set, weight: -5 }]))));
  test("rejects weight too big for NUMERIC(6,2)", () => assert.ok(validateLog(log([{ ...set, weight: 10000 }]))));
  test("rejects non-numeric weight", () => assert.ok(validateLog(log([{ ...set, weight: "heavy" }]))));
  test("rejects a null set", () => assert.ok(validateLog(log([null]))));
});

describe("GET /", () => {
  test("401 when not logged in", async () => {
    const res = await request(router, "GET", "/");
    assert.equal(res.status, 401);
  });

  test("coach gets their own workouts", async () => {
    const query = stubQuery(coach, { rows: [{ id: 9, name: "Legs" }] });
    const res = await request(router, "GET", "/", { session });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: 9, name: "Legs" }]);
    assert.deepEqual(query.mock.calls[1].arguments[1], [1]);
  });

  test("athlete gets their coach's workouts by team code", async () => {
    const query = stubQuery(athlete, { rows: [] });
    await request(router, "GET", "/", { session });
    assert.deepEqual(query.mock.calls[1].arguments[1], ["123456"]);
  });
});

describe("POST /", () => {
  const body = { name: "  Legs ", exercises: [{ exercise: " Squat ", sets: 3, reps: " 8 " }] };

  test("403 for athletes", async () => {
    stubQuery(athlete);
    const res = await request(router, "POST", "/", { session, body });
    assert.equal(res.status, 403);
  });

  test("400 on invalid body", async () => {
    stubQuery(coach);
    const res = await request(router, "POST", "/", { session, body: { name: "", exercises: [] } });
    assert.equal(res.status, 400);
  });

  test("201 and stores trimmed values", async () => {
    const query = stubQuery(coach, { rows: [{ id: 5 }] });
    const res = await request(router, "POST", "/", { session, body });
    assert.equal(res.status, 201);
    const [, name, exercises] = query.mock.calls[1].arguments[1];
    assert.equal(name, "Legs");
    assert.deepEqual(JSON.parse(exercises), [{ exercise: "Squat", sets: 3, reps: "8" }]);
  });
});

describe("PUT /:id and DELETE /:id", () => {
  const body = { name: "Legs", exercises: [{ exercise: "Squat", sets: 3, reps: "8" }] };

  test("PUT 404 when the workout isn't the coach's", async () => {
    stubQuery(coach, { rows: [] });
    const res = await request(router, "PUT", "/7", { session, body });
    assert.equal(res.status, 404);
  });

  test("PUT saves the trimmed workout for this coach", async () => {
    const query = stubQuery(coach, { rows: [{ id: 7, ...body }] });
    const res = await request(router, "PUT", "/7", {
      session,
      body: { name: " Legs ", exercises: [{ exercise: " Squat ", sets: 3, reps: "8" }] },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { id: 7, ...body });
    const [name, exercises, id] = query.mock.calls[1].arguments[1];
    assert.equal(name, "Legs");
    assert.deepEqual(JSON.parse(exercises), body.exercises);
    assert.equal(id, "7");
  });

  test("DELETE 404 when nothing was deleted", async () => {
    stubQuery(coach, { rowCount: 0 });
    const res = await request(router, "DELETE", "/7", { session });
    assert.equal(res.status, 404);
  });

  test("DELETE 204 on success", async () => {
    stubQuery(coach, { rowCount: 1 });
    const res = await request(router, "DELETE", "/7", { session });
    assert.equal(res.status, 204);
  });
});

describe("GET /log", () => {
  test("coach gets 404 for an athlete not on their team", async () => {
    stubQuery(coach, { rows: [] });
    const res = await request(router, "GET", "/log?athleteId=99", { session });
    assert.equal(res.status, 404);
  });

  test("coach can read a team athlete's log", async () => {
    const query = stubQuery(coach, { rows: [{ id: 2 }] }, { rows: [{ id: 30 }] });
    const res = await request(router, "GET", "/log?athleteId=2", { session });
    assert.equal(res.status, 200);
    assert.deepEqual(query.mock.calls[1].arguments[1], [2, "123456"]);
    assert.deepEqual(query.mock.calls[2].arguments[1], [2]);
  });
});

describe("POST /log", () => {
  const body = {
    coachWorkoutId: 9,
    exercises: [{ exercise: "Squat", sets: [{ reps: "8", weight: 225 }, { reps: "6", weight: null }] }],
  };

  test("403 for coaches", async () => {
    stubQuery(coach);
    const res = await request(router, "POST", "/log", { session, body });
    assert.equal(res.status, 403);
  });

  test("400 without coachWorkoutId", async () => {
    stubQuery(athlete);
    const res = await request(router, "POST", "/log", { session, body: { ...body, coachWorkoutId: undefined } });
    assert.equal(res.status, 400);
  });

  test("404 when the workout isn't on the athlete's team", async () => {
    stubQuery(athlete, { rows: [] });
    const res = await request(router, "POST", "/log", { session, body });
    assert.equal(res.status, 404);
  });

  test("201 inserts one row per set inside a transaction", async () => {
    stubQuery(athlete, { rows: [{ id: 9 }] });
    const client = stubClient(undefined, { rows: [{ id: 40 }] });
    const res = await request(router, "POST", "/log", { session, body });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { id: 40 });
    const sql = sqlOf(client.query);
    assert.equal(sql[0], "BEGIN");
    assert.equal(sql.filter((s) => s.includes("INSERT INTO workout_exercises")).length, 2);
    assert.equal(sql.at(-1), "COMMIT");
    assert.deepEqual(client.query.mock.calls[3].arguments[1], [40, "Squat", 2, "6", null]);
    assert.equal(client.release.mock.callCount(), 1);
  });

  test("rolls back and releases on a DB error", async () => {
    stubQuery(athlete, { rows: [{ id: 9 }] });
    const client = stubClient(undefined, new Error("boom"));
    const res = await request(router, "POST", "/log", { session, body });
    assert.equal(res.status, 500);
    assert.equal(sqlOf(client.query).at(-1), "ROLLBACK");
    assert.equal(client.release.mock.callCount(), 1);
  });
});

describe("PUT /log/:id and DELETE /log/:id", () => {
  const body = { exercises: [{ exercise: "Squat", sets: [{ reps: "8", weight: 225 }] }] };

  test("PUT 404 and rolls back when the log isn't the athlete's", async () => {
    stubQuery(athlete);
    const client = stubClient(undefined, { rows: [] });
    const res = await request(router, "PUT", "/log/3", { session, body });
    assert.equal(res.status, 404);
    assert.equal(sqlOf(client.query).at(-1), "ROLLBACK");
    assert.equal(client.release.mock.callCount(), 1);
  });

  test("PUT replaces the sets and commits", async () => {
    stubQuery(athlete);
    const client = stubClient(undefined, { rows: [{ id: 3 }] });
    const res = await request(router, "PUT", "/log/3", { session, body });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { id: 3 });
    const sql = sqlOf(client.query);
    assert.ok(sql[2].startsWith("DELETE FROM workout_exercises"));
    assert.equal(sql.at(-1), "COMMIT");
  });

  test("DELETE 404 when the log isn't the athlete's", async () => {
    stubQuery(athlete);
    stubClient(undefined, { rowCount: 0 });
    const res = await request(router, "DELETE", "/log/3", { session });
    assert.equal(res.status, 404);
  });

  test("DELETE 204 and commits when the log is the athlete's", async () => {
    stubQuery(athlete);
    const client = stubClient(undefined, { rowCount: 1 });
    const res = await request(router, "DELETE", "/log/3", { session });
    assert.equal(res.status, 204);
    assert.equal(sqlOf(client.query).at(-1), "COMMIT");
    assert.equal(client.release.mock.callCount(), 1);
  });

  test("DELETE 403 for coaches", async () => {
    stubQuery(coach);
    const res = await request(router, "DELETE", "/log/3", { session });
    assert.equal(res.status, 403);
  });
});
