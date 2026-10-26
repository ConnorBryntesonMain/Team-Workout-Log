// Test helpers: mount a router on a throwaway app with a fake session, and stub the DB pool.
import express from "express";
import { mock } from "node:test";
import { pool } from "./db.js";

export async function request(router, method, path, { body, session = {} } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    session.destroy ??= (cb) => cb();
    next();
  });
  app.use(router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const res = await fetch(`http://localhost:${server.address().port}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body && JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

// Each pool.query call returns the next result in order; extra calls get an empty result.
export function stubQuery(...results) {
  return mock.method(pool, "query", async () => results.shift() ?? { rows: [], rowCount: 0 });
}

// Same as stubQuery, for queries run on a client from pool.connect() (transactions).
export function stubClient(...results) {
  const client = {
    query: mock.fn(async () => {
      const next = results.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [], rowCount: 0 };
    }),
    release: mock.fn(),
  };
  mock.method(pool, "connect", async () => client);
  return client;
}

export const sqlOf = (fn) => fn.mock.calls.map((c) => c.arguments[0].trim());
