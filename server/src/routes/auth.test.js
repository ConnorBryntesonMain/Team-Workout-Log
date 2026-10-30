import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import bcrypt from "bcrypt";
import router from "./auth.js";
import { pool } from "../db.js";
import { request, stubQuery } from "../testApp.js";

afterEach(() => mock.restoreAll());

const user = {
  email: "a@b.com",
  password: "password1",
  name: "Al",
  role: "athlete",
  securityQuestion: "First pet?",
  securityAnswer: "Rex",
};

describe("POST /register", () => {
  test("400 when a field is missing", async () => {
    const res = await request(router, "POST", "/register", { body: { ...user, name: "" } });
    assert.equal(res.status, 400);
  });

  test("400 without a security answer", async () => {
    const res = await request(router, "POST", "/register", { body: { ...user, securityAnswer: "  " } });
    assert.equal(res.status, 400);
  });

  test("400 for a password under 8 characters", async () => {
    const res = await request(router, "POST", "/register", { body: { ...user, password: "short" } });
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
    const [, hash, , , coachCode, , question, answerHash] = query.mock.calls[0].arguments[1];
    assert.equal(coachCode, "000000");
    assert.ok(await bcrypt.compare("password1", hash));
    assert.equal(question, "First pet?");
    assert.ok(await bcrypt.compare("rex", answerHash));
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

  test("400 with a blank email", async () => {
    const res = await request(router, "POST", "/login", { body: { email: "", password: "pw" } });
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
    stubQuery({ rows: [{ id: 4, email: user.email, password_hash: await bcrypt.hash("password1", 4) }] });
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
  const body = { currentPassword: "old", newPassword: "newpass1" };

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

  test("400 for a new password under 8 characters, and no update", async () => {
    const query = stubQuery();
    const res = await request(router, "POST", "/change-password", {
      body: { ...body, newPassword: "short" },
      session: { userId: 1 },
    });
    assert.equal(res.status, 400);
    assert.equal(query.mock.callCount(), 0);
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
    assert.ok(await bcrypt.compare("newpass1", hash));
  });
});

describe("POST /security-question", () => {
  test("returns the question for the email", async () => {
    stubQuery({ rows: [{ security_question: "First pet?" }] });
    const res = await request(router, "POST", "/security-question", { body: { email: "a@b.com" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.securityQuestion, "First pet?");
  });

  test("404 for an unknown email or an account without a question", async () => {
    stubQuery({ rows: [] }, { rows: [{ security_question: null }] });
    for (let i = 0; i < 2; i++) {
      const res = await request(router, "POST", "/security-question", { body: { email: "a@b.com" } });
      assert.equal(res.status, 404);
    }
  });
});

describe("POST /reset-password", () => {
  const body = { email: "a@b.com", securityAnswer: "  REX ", newPassword: "newpass1" };

  test("400 when a field is missing", async () => {
    const res = await request(router, "POST", "/reset-password", { body: { email: "a@b.com" } });
    assert.equal(res.status, 400);
  });

  test("400 for a new password under 8 characters, and no update", async () => {
    const query = stubQuery();
    const res = await request(router, "POST", "/reset-password", { body: { ...body, newPassword: "short" } });
    assert.equal(res.status, 400);
    assert.equal(query.mock.callCount(), 0);
  });

  test("401 on a wrong answer, and no update", async () => {
    const query = stubQuery({ rows: [{ id: 1, security_answer_hash: await bcrypt.hash("fido", 4) }] });
    const res = await request(router, "POST", "/reset-password", { body });
    assert.equal(res.status, 401);
    assert.equal(query.mock.callCount(), 1);
  });

  test("401 when the account has no security answer", async () => {
    stubQuery({ rows: [{ id: 1, security_answer_hash: null }] });
    const res = await request(router, "POST", "/reset-password", { body });
    assert.equal(res.status, 401);
  });

  test("correct answer (case/space-insensitive) stores the new password hash", async () => {
    const query = stubQuery({ rows: [{ id: 1, security_answer_hash: await bcrypt.hash("rex", 4) }] }, { rowCount: 1 });
    const res = await request(router, "POST", "/reset-password", { body });
    assert.equal(res.status, 200);
    const [hash, id] = query.mock.calls[1].arguments[1];
    assert.equal(id, 1);
    assert.ok(await bcrypt.compare("newpass1", hash));
  });
});

describe("POST /logout", () => {
  test("destroys the session and returns 204", async () => {
    const destroy = mock.fn((cb) => cb());
    const res = await request(router, "POST", "/logout", { session: { userId: 1, destroy } });
    assert.equal(res.status, 204);
    assert.equal(destroy.mock.callCount(), 1);
  });
});
