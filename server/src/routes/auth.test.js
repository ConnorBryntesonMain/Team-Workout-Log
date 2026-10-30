import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import bcrypt from "bcrypt";
import router from "./auth.js";
import { pool } from "../db.js";
import { request, stubQuery } from "../testApp.js";

afterEach(() => mock.restoreAll());

const user = { email: "a@b.com", password: "pw", name: "Al", role: "athlete" };

describe("POST /register", () => {
  test("400 when a field is missing", async () => {
    const res = await request(router, "POST", "/register", { body: { ...user, name: "" } });
    assert.equal(res.status, 400);
  });

  test("400 on an unknown role", async () => {
    const res = await request(router, "POST", "/register", { body: { ...user, role: "admin" } });
    assert.equal(res.status, 400);
  });

  test("athlete gets placeholder coach code, password is hashed, session set", async () => {
    const query = stubQuery({ rows: [{ id: 4, email: user.email, name: "Al", role: "athlete", coach_code: "000000" }] });
    const session = {};
    const res = await request(router, "POST", "/register", { body: user, session });
    assert.equal(res.status, 201);
    assert.equal(session.userId, 4);
    const [, hash, , , coachCode] = query.mock.calls[0].arguments[1];
    assert.equal(coachCode, "000000");
    assert.ok(await bcrypt.compare("pw", hash));
  });

  test("coach gets a unique 6-digit code, retrying on collision", async () => {
    const query = stubQuery({ rows: [{ id: 1 }] }, { rows: [] }, { rows: [{ id: 5 }] });
    const res = await request(router, "POST", "/register", { body: { ...user, role: "coach" } });
    assert.equal(res.status, 201);
    assert.equal(query.mock.callCount(), 3);
    assert.match(query.mock.calls[2].arguments[1][4], /^\d{6}$/);
  });

  test("409 when the email is taken", async () => {
    mock.method(pool, "query", async () => {
      throw Object.assign(new Error("dup"), { code: "23505" });
    });
    const res = await request(router, "POST", "/register", { body: user });
    assert.equal(res.status, 409);
  });
});

describe("POST /login", () => {
  test("400 without credentials", async () => {
    const res = await request(router, "POST", "/login", { body: { email: "a@b.com" } });
    assert.equal(res.status, 400);
  });

  test("401 for an unknown email", async () => {
    stubQuery({ rows: [] });
    const res = await request(router, "POST", "/login", { body: user });
    assert.equal(res.status, 401);
  });

  test("401 for a wrong password", async () => {
    stubQuery({ rows: [{ id: 4, password_hash: await bcrypt.hash("other", 4) }] });
    const res = await request(router, "POST", "/login", { body: user });
    assert.equal(res.status, 401);
  });

  test("200 and session set for a correct password", async () => {
    stubQuery({ rows: [{ id: 4, email: user.email, password_hash: await bcrypt.hash("pw", 4) }] });
    const session = {};
    const res = await request(router, "POST", "/login", { body: user, session });
    assert.equal(res.status, 200);
    assert.equal(session.userId, 4);
    assert.equal(res.body.password_hash, undefined);
  });
});

describe("team routes", () => {
  const session = { userId: 4 };

  for (const [method, path] of [["POST", "/join-team"], ["POST", "/leave-team"], ["GET", "/team"], ["GET", "/me"]]) {
    test(`${method} ${path} 401 when not logged in`, async () => {
      const res = await request(router, method, path);
      assert.equal(res.status, 401);
    });
  }

  test("join-team 404 for a code with no coach", async () => {
    const query = stubQuery({ rows: [] });
    const res = await request(router, "POST", "/join-team", { session, body: { coachCode: "999999" } });
    assert.equal(res.status, 404);
    assert.equal(query.mock.callCount(), 1);
  });

  test("join-team sets the athlete's code", async () => {
    const query = stubQuery({ rows: [{ id: 1 }] });
    const res = await request(router, "POST", "/join-team", { session, body: { coachCode: "123456" } });
    assert.equal(res.status, 200);
    assert.deepEqual(query.mock.calls[1].arguments[1], ["123456", 4]);
  });

  test("me 401 when the session's user no longer exists", async () => {
    stubQuery({ rows: [] });
    const res = await request(router, "GET", "/me", { session });
    assert.equal(res.status, 401);
  });
});

describe("POST /change-password", () => {
  const body = { currentPassword: "old", newPassword: "new" };

  test("401 when not logged in", async () => {
    const res = await request(router, "POST", "/change-password", { body });
    assert.equal(res.status, 401);
  });

  test("400 when a field is missing", async () => {
    const res = await request(router, "POST", "/change-password", {
      body: { currentPassword: "old" },
      session: { userId: 1 },
    });
    assert.equal(res.status, 400);
  });

  test("401 when the current password is wrong", async () => {
    const query = stubQuery({ rows: [{ password_hash: await bcrypt.hash("other", 4) }] });
    const res = await request(router, "POST", "/change-password", { body, session: { userId: 1 } });
    assert.equal(res.status, 401);
    assert.equal(query.mock.callCount(), 1);
  });

  test("stores a hash of the new password", async () => {
    const query = stubQuery({ rows: [{ password_hash: await bcrypt.hash("old", 4) }] }, { rowCount: 1 });
    const res = await request(router, "POST", "/change-password", { body, session: { userId: 1 } });
    assert.equal(res.status, 200);
    const [hash, id] = query.mock.calls[1].arguments[1];
    assert.equal(id, 1);
    assert.ok(await bcrypt.compare("new", hash));
  });
});
