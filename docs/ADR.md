# Architecture Decision Records

Short records of the significant design choices in Team Workout Log: what we decided, why, and what it costs us. Each record uses the format *Context → Decision → Consequences*. To change a decision, add a new record that supersedes the old one rather than editing history.

| # | Decision | Status |
|---|----------|--------|
| 1 | Three-tier app: React client, Express API, PostgreSQL | Accepted |
| 2 | Server-side sessions with bcrypt-hashed passwords | Accepted |
| 3 | Use MySQL as the database | Rejected |
| 4 | PostgreSQL with hand-written SQL, no ORM | Accepted |
| 5 | Single `users` table with a `role` column | Accepted |
| 6 | Team membership via six-digit coach codes | Accepted |
| 7 | Client-side page switching instead of a router | Accepted |
| 8 | Hard-coded base workout until workout logging exists | Accepted (temporary) |

---

## ADR 1: Three-tier app: React client, Express API, PostgreSQL

**Date:** 2026 · **Status:** Accepted

**Context.** Athletes and coaches need to reach the same data from a browser. The team is two students in a one-semester course and knows JavaScript best.

**Decision.** Split the app into three pieces (see `docs/design_diagram.md`):

- `client/`: React 19 single-page app built with Vite, served at `localhost:5173`.
- `server/`: Node.js / Express JSON API at `localhost:3000`.
- PostgreSQL database holding all persistent data.

The client talks to the API with `fetch` and `credentials: "include"`; the API is the only piece that touches the database.

**Consequences.**
- One language (JavaScript) across client and server.
- Client and server run on different origins, so the server needs CORS (`server/src/server.js`), and the origin is hard-coded to `http://localhost:5173`. Using `127.0.0.1` breaks login.
- The API URL is hard-coded in client components. Deploying anywhere but localhost will need an environment variable or a Vite proxy.
- Three processes must be running for local development (documented in the README).


## ADR 2: Server-side sessions with bcrypt-hashed passwords

**Date:** 2026 · **Status:** Accepted

**Context.** Users log in once and should stay logged in (backlog: "so I don't have to constantly reauthenticate"). We need to store passwords safely.

**Decision.** Use `express-session` with an `httpOnly` cookie that lasts 24 hours. The session stores only `userId`. Passwords are hashed with `bcrypt` (cost factor 10) and never stored or returned in plain text. Protected routes check `req.session.userId`.

We chose sessions over JWTs because they are simpler to get right: logout just destroys the session, and no token handling is needed in the client.

**Consequences.**
- `SESSION_SECRET` must be set in `server/.env`, or login fails.
- Sessions use the default in-memory store, so restarting the server logs everyone out, and it will not work with more than one server process. Move to a Postgres-backed store (e.g. `connect-pg-simple`) before deploying.
- The cookie is not marked `secure`, which is fine for HTTP on localhost but must change for HTTPS deployment.


## ADR 3: Use MySQL as the database

**Date:** 2026-09-24 · **Status:** Rejected (replaced by PostgreSQL, see ADR 4)

**Context.** The first version of the server (commit `0e6ca43`, 2026-09-17) used MySQL through the `mysql2` driver. Getting MySQL installed and running on macOS gave the team problems, and both developers need to run the full stack locally.

**Decision.** Reject MySQL and replace it with PostgreSQL (commit `6df4eb9`):

- Swap the `mysql2` dependency for `pg`, and `mysql.createPool` for `new pg.Pool` in `server/src/db.js` (`connectionLimit: 10` becomes `max: 10`).
- Port `server/db/schema.sql`: `AUTO_INCREMENT` becomes `GENERATED ALWAYS AS IDENTITY`, and `ENUM('coach', 'athlete')` becomes `VARCHAR(20)` with a `CHECK` constraint.
- Change query placeholders in `server/src/routes/auth.js` from `?` to `$1, $2, ...`, use `RETURNING id` instead of `result.insertId`, and check Postgres error code `23505` instead of `ER_DUP_ENTRY` for duplicate emails.
- Update `.env.example` to Postgres defaults: port `3306` → `5432`, user `root` → `postgres`.

**Consequences.**
- PostgreSQL installs cleanly on macOS (Homebrew or Postgres.app), Windows, and Ubuntu/WSL, so setup is the same for everyone (see README).
- `RETURNING` lets an insert return the new row in one query.
- Any MySQL databases created before the switch cannot be reused; they must be recreated from `schema.sql`.
- Postgres needs a password for TCP logins, which adds a setup step on Linux/WSL (documented in README step 2).

## ADR 4: PostgreSQL with hand-written SQL, no ORM

**Date:** 2026 · **Status:** Accepted

**Context.** The data is relational (coaches have athletes; athletes will have workouts). The schema is small.

**Decision.** Use PostgreSQL through the `pg` connection pool (`server/src/db.js`). Queries are written as parameterized SQL (`$1`, `$2`, ...) directly in route handlers. The schema lives in `server/db/schema.sql` and demo data in `server/db/seed.sql`; both are loaded by hand with `psql`.

**Consequences.**
- No ORM to learn, and the SQL is visible where it runs.
- Parameterized queries prevent SQL injection; string-built queries must never be added.
- There are no migrations. `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so schema changes on existing databases need manual `ALTER TABLE` commands (see README troubleshooting). Adopt a migration tool once the schema changes more often.


## ADR 5: Single `users` table with a `role` column

**Date:** 2026 · **Status:** Accepted

**Context.** There are two kinds of users, coaches and athletes. They share login, name, and email, and differ only in a few fields and in what pages they see.

**Decision.** Store both in one `users` table with `role IN ('coach', 'athlete')` enforced by a `CHECK` constraint. The client shows or hides pages based on `user.role` (athletes get **Workouts**, coaches get **Team**).

**Consequences.**
- One login and sign-up flow for both roles.
- Some columns only apply to one role (`coach_code` for coaches, `athlete_code` for athletes), so athletes carry a placeholder `coach_code` of `'000000'` to satisfy `NOT NULL`.
- Hiding pages in the client is not authorization. Any role-specific API route must also check the role on the server.
- A user cannot be both a coach and an athlete.


## ADR 6: Team membership via six-digit coach codes

**Date:** 2026 · **Status:** Accepted

**Context.** Athletes need an easy way to join a coach's team without the coach entering each athlete by hand.

**Decision.** Each coach gets a random, unique six-digit `coach_code` at sign-up. An athlete joins a team by entering that code, which is stored in their `athlete_code` column; leaving sets it back to `NULL`. A coach's team is the list of users whose `athlete_code` matches their `coach_code`. There is no separate `teams` table.

**Consequences.**
- Very simple: no invitations and no extra table.
- An athlete can be on only one team at a time, and a coach has exactly one team.
- The code acts as a shared secret: anyone with it can join. There is no approval step and no way to rotate the code.
- Uniqueness is checked in code before insert, not by a database `UNIQUE` constraint, so two simultaneous coach sign-ups could in theory get the same code.
- If multiple teams per coach or athlete are needed, introduce `teams` and `team_members` tables.


## ADR 7: Client-side page switching instead of a router

**Date:** 2026 · **Status:** Accepted

**Context.** The app has a handful of screens: Login, Sign Up, Profile, Workouts, and Team.

**Decision.** `client/src/App.jsx` keeps the current page in React state (`useState`) and renders the matching component. No routing library is installed.

**Consequences.**
- No extra dependency, and the navigation logic is in one file.
- Pages have no URLs: the back button, bookmarks, and page refresh do not keep your place, and a refresh returns to the login screen because the logged-in user is held only in React state.
- Add `react-router` when pages need their own URLs.


## ADR 8: Hard-coded base workout until workout logging exists

**Date:** 2026 · **Status:** Accepted (temporary)

**Context.** Workout templates and logging are not built yet (backlog: *In Progress*), but coaches and athletes need something to see on the Workouts and Team pages.

**Decision.** Define one `BASE_WORKOUT` array in `client/src/Workouts.jsx` and show it to every athlete, and to coaches when they view any athlete. Nothing about workouts is stored in the database.

**Consequences.**
- The pages work end to end for demos while the data model is designed.
- Every athlete sees the same workout, and nothing is saved.
- This record will be superseded when workout tables are added to `schema.sql` and served by the API.

