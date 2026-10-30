# Testing

The server has 73 unit tests covering both API route files. They run with Node's built-in test runner (`node:test`), so there's nothing extra to install, and they don't need PostgreSQL.

## Running the tests

From `server/`:

```bash
npm test                 # run all tests
npm run test:coverage    # run all tests and print a coverage report
```

Node finds every `*.test.js` file automatically. A passing run ends with:

```
# tests 73
# pass 73
# fail 0
```

## How the tests work

Each test mounts one router (`auth.js` or `workouts.js`) on a throwaway Express app and sends it a real HTTP request with `fetch`. The helpers in `server/src/testApp.js` do the setup:

| Helper | What it does |
|--------|--------------|
| `request(router, method, path, { body, session })` | Starts the app on a random port, sends one request, and returns `{ status, body }`. `session` is a plain object the test supplies; use it to log a user in (`{ userId: 1 }`) or to check what the route wrote to it. |
| `stubQuery(...results)` | Replaces `pool.query`. Each call returns the next result in order; extra calls get `{ rows: [], rowCount: 0 }`. |
| `stubClient(...results)` | Replaces `pool.connect` with a fake client for routes that use transactions. Passing an `Error` makes that query throw. |
| `sqlOf(fn)` | Lists the SQL a stub received, for checks like "the last statement was `COMMIT`". |

`afterEach(() => mock.restoreAll())` puts the real pool back after every test.

**What these tests can't catch:** the SQL never reaches a database, so a typo in a query or a wrong join won't fail a test. Catching those would need a separate set of tests that run against a real test database.

## Test inventory

### `server/src/routes/workouts.test.js` (41 tests)

| Area | What's checked |
|------|----------------|
| `validateWorkout` (8) | Accepts a valid workout; rejects a blank name, a name over 100 characters, no exercises, zero sets, fractional sets, blank reps, and a `null` exercise. |
| `validateLog` (11) | Accepts a valid log, bodyweight (`null` weight), and weight `0`; rejects no exercises, no sets, `sets` given as a number, blank reps, negative weight, weight ≥ 10000 (too big for the `NUMERIC(6,2)` column), non-numeric weight, and a `null` set. |
| `GET /` (3) | 401 when logged out; a coach gets their own workouts; an athlete gets their coach's workouts by team code. |
| `POST /` (3) | 403 for athletes; 400 for an invalid body; 201 and the name and exercises are stored trimmed. |
| `PUT /:id`, `DELETE /:id` (4) | 404 when the workout isn't the coach's; PUT saves the trimmed name and exercises for that coach; 204 on a successful delete. |
| `GET /log` (2) | A coach gets 404 for an athlete not on their team, and can read the log of an athlete who is. |
| `POST /log` (5) | 403 for coaches; 400 without `coachWorkoutId`; 404 when the workout isn't on the athlete's team; 201 with `BEGIN`, one insert per set, and `COMMIT`; a database error rolls back and releases the connection. |
| `PUT /log/:id`, `DELETE /log/:id` (5) | PUT returns 404 and rolls back when the log isn't the athlete's; PUT deletes the old sets, inserts the new ones, and commits; DELETE returns 404 for someone else's log, 403 for coaches, and 204 with a commit for the athlete's own log. |

### `server/src/routes/auth.test.js` (32 tests)

| Area | What's checked |
|------|----------------|
| `POST /register` (7) | 400 for a missing field, a blank security answer, a password under 8 characters, and an unknown role; an athlete gets the `000000` placeholder code, a bcrypt-hashed password, the security question, a bcrypt hash of the lowercased answer, and a session; a coach gets a 6-digit code, with a retry when the first code is taken; 409 for an email that's already registered. |
| `POST /login` (5) | 400 without a password and with a blank email; 401 for an unknown email and for a wrong password; 200 and a session for the correct password, and the password hash isn't returned. |
| Team routes (7) | `join-team`, `leave-team`, `team`, and `me` each return 401 when logged out; `join-team` returns 404 for a code with no coach and saves the code for a valid one; `me` returns 401 when the session's user no longer exists. |
| `POST /change-password` (5) | 401 when logged out; 400 for a missing field; 400 and no query for a new password under 8 characters; 401 and no update for a wrong current password; a bcrypt hash of the new password is saved for the session's user. |
| `POST /security-question` (2) | Returns the question for an email; 404 for an unknown email and for an account with no question. |
| `POST /logout` (1) | Destroys the session and returns 204. |
| `POST /reset-password` (5) | 400 for a missing field; 400 and no query for a new password under 8 characters; 401 and no update for a wrong answer and for an account with no answer; a correct answer, ignoring case and spaces, saves a bcrypt hash of the new password. |

## Coverage

Generated on 2026-10-30 with `npm run test:coverage` (Node 20.20.2). The table lists the application source files only. Node's report also lists the test files themselves at 100%, which raises the "all files" total to 95.04% lines / 93.96% branches.

| File | Lines | Branches | Functions |
|------|------:|---------:|----------:|
| `src/routes/workouts.js` | 94.64% | 87.37% | 100.00% |
| `src/routes/auth.js` | 89.54% | 93.85% | 100.00% |
| `src/db.js` | 100.00% | 100.00% | 100.00% |

`src/server.js` isn't in the report because no test loads it. It only wires the routers together, starts listening, and serves `/health`; the README's verification guide covers it by hand.

### Not yet covered

| File | Lines | What's untested |
|------|-------|-----------------|
| `auth.js` | 115–117 | Register rethrowing a database error other than a duplicate email |
| `auth.js` | 208–220 | `leave-team` success |
| `auth.js` | 232–247 | `GET /team` success (a coach listing their athletes) |
| `auth.js` | 397–407 | `GET /me` success |
| `workouts.js` | 64–65 | `validateWorkout` rejecting a blank exercise name |
| `workouts.js` | 135–138 | `GET /log` returning 401 when logged out |
| `workouts.js` | 196–205 | `PUT /log/:id` returning 403 for coaches and 400 for an invalid body |
| `workouts.js` | 263–264 | `PUT /log/:id` rolling back on a database error |
| `workouts.js` | 308–309 | `DELETE /log/:id` rolling back on a database error |
| `workouts.js` | 427–436 | `PUT /:id` returning 403 for athletes and 400 for an invalid body |
| `workouts.js` | 465–468 | `DELETE /:id` returning 403 for athletes |

To refresh these numbers, run `npm run test:coverage` and copy the rows for the source files.

## Client tests

The client has 14 regression tests in `client/src/regression.test.jsx`. They use Vitest with jsdom and React Testing Library. Each test stubs `fetch`, renders one component and interacts with it the way a user would.

From `client/`:

```bash
npm test
```

| Bug fixed | Tests |
|-----------|-------|
| Network failures did nothing (10) | When `fetch` rejects, Login, Signup, Profile (join team, leave team, change password), Workouts (log load, save workout, delete workout) and Team (view log) all show "could not reach the server". Logout still logs out locally. |
| Team log race (1) | A coach opens athlete A, then athlete B, and A's response arrives last. B's log stays on screen and nothing is stuck on "Loading...". |
| Log prefill matched by name (2) | A renamed workout still prefills from its last log. A different workout with the same name doesn't. |
| Change password length (1) | The new password input has `minLength` 8, matching signup. The server now rejects passwords under 8 characters on register, change-password and reset-password. |
