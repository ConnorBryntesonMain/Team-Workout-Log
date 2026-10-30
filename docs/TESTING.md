# Testing

There are three suites:

- **Server unit tests (73):** each API route, with the database stubbed. Covered in the sections below.
- **Server integration tests (27):** the real server against a real PostgreSQL test database. See [Integration tests](#integration-tests).
- **Client unit tests (85):** each React component, with `fetch` stubbed. See [Client tests](#client-tests).

The server unit tests run with Node's built-in test runner (`node:test`), so there's nothing extra to install, and they don't need PostgreSQL.

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

**What these tests can't catch:** the SQL never reaches a database, so a typo in a query or a wrong join won't fail a test. The [integration tests](#integration-tests) cover that.

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

## Integration tests

`server/integration/api.js` (27 tests) starts the real server (`src/server.js`) as a child process, pointed at a PostgreSQL database named `<DB_NAME>_test`. It then drives the API over HTTP the way the browser does, keeping each user's session cookie between requests. That checks the real SQL, constraints, cascades, sessions and CORS, none of which the unit tests reach.

From `server/` (PostgreSQL must be running and `server/.env` filled in):

```bash
npm run test:integration
```

- The test database is created on the first run, and `db/schema.sql` is applied on every run.
- Every test starts from empty tables (`TRUNCATE ... RESTART IDENTITY CASCADE`).
- The suite refuses to run unless the database name ends in `_test`, so it can't wipe your dev data. Set `TEST_DB_NAME` to use a different test database.
- The file isn't named `*.test.js`, so `npm test` doesn't pick it up and the unit tests still run without a database.

| Area | What's checked |
|------|----------------|
| Server wiring (3) | `/health` reports the database as connected; CORS allows `http://localhost:5173` with credentials; the session cookie is `HttpOnly`. |
| Accounts (6) | Registering starts a session and stores bcrypt hashes of the password and the lowercased answer; coaches get distinct 6-digit codes; a duplicate email gets 409 from the `UNIQUE` constraint; logout ends the session and login starts a new one; change-password and forgot-password both replace the old password. |
| Teams (4) | Joining shows the coach on the athlete's `/me` and the athlete on the coach's `/team`; an unknown code changes nothing; leaving removes the athlete from the team and hides its workouts; a coach only sees their own athletes. |
| Coach workouts (4) | Created trimmed, listed by name, and visible only to the coach's team; edits are saved; another coach gets 404 on edit and delete; athletes get 403 on create. |
| Workout logs (10) | Sets come back in order with bodyweight as `null`; the largest `NUMERIC(6,2)` weight (9999.99) is stored exactly; newest log first; editing replaces all sets; deleting removes the sets; other athletes get 404; an athlete can't log another team's workout; only the athlete's own coach can read the log; deleting a coach workout keeps the logs, unlinked (`ON DELETE SET NULL`); deleting an account cascades to its logs. |

## Client tests

The client has 85 tests. They use Vitest with jsdom and React Testing Library. Each test stubs `fetch` with the helpers in `client/src/testUtils.js`, renders a component, and interacts with it the way a user would. The Excel library (`write-excel-file/browser`) is mocked, so no file gets written.

From `client/`:

```bash
npm test
```

| Helper | What it does |
|--------|--------------|
| `stubFetch(routes)` | Replaces `fetch`. Each request gets the reply for the first URL fragment it contains. List specific fragments first, e.g. `"/workouts/log"` before `"/workouts"`. A value can be a function of `(url, options)`. An unmatched URL rejects, like an unreachable server. |
| `reply(body, status)` | A fake `Response` whose `ok` is true below 400. |
| `sentBody(fetch, fragment, method)` | The parsed JSON body of the first matching request. |

### `Workouts.test.jsx` (30 tests)

| Area | What's checked |
|------|----------------|
| Loading (4) | "Loading...", the server's error, different empty states for coaches and athletes, and the exercise table. |
| Role gating (2) | Coaches get New/Edit/Delete and no logging; athletes get logging and My Log and no editing. |
| Coach (6) | New Workout POSTs and adds the workout to the list; Edit PUTs to the workout's id and replaces it; Add Exercise and Remove (disabled on the last row); a rejected save keeps the form; Cancel; Delete only after `confirm`. |
| Athlete logging (7) | With no history, prefills the coach's sets and reps; otherwise prefills from the most recent log of that workout; an exercise missing from the last log falls back to the coach's plan; saving sends blank weight as `null` and other weights as numbers, then reloads the log; a rejected save keeps the form; Add Set copies the last set; Cancel. |
| My Log (6) | Each entry with its date, or "Deleted workout"; an empty log disables Download; Edit groups sets by exercise and saves with PUT; Delete, and a failed delete; Download writes `my-workout-log.xlsx`. |
| `downloadLog` (4) | Strips the characters Excel forbids in sheet names, with "Athlete" as the fallback; cuts names to 28 characters; numbers duplicates, ignoring case; writes a bold, frozen header and one row per set, with "Bodyweight" and "Deleted workout". |
| `LogTable` (1) | Names the exercise only on its first set; shows "Bodyweight" when there's no weight. |

### `auth.test.jsx` (15 tests)

| Area | What's checked |
|------|----------------|
| Login (4) | POSTs the credentials with cookies and passes the user to `onLoggedIn`; the server's error; the generic fallback error; the links to Sign Up and Forgot password. |
| Signup (5) | Sends all six fields, defaulting to athlete and the first question; sends the chosen role and question; the server's error; `minLength` 8 on the password; the link back to Log In. |
| ForgotPassword (6) | Step 1 shows the question and locks the email field; step 2 resets the password and confirms; an unknown email; a wrong answer keeps the form; `minLength` 8 on the new password; the link back to Log In. |

### `Profile.test.jsx` (12 tests)

Loading and the details shown; the load error; a coach sees their code; an athlete on a team sees the team code and coach name; joining a team, and an unknown code; leaving a team, and a failed leave; change password success, wrong current password, and Cancel; log out.

### `Team.test.jsx` (9 tests)

Loading, the load error, and the empty team; View shows the athlete's log and Hide closes it; an athlete with no logs; "Deleted workout"; a load error keeps the list; Download Team Log writes one sheet per athlete, and stops if any athlete's fetch fails.

### `App.test.jsx` (5 tests)

Switching between Log In, Sign Up and Reset Password; an athlete gets no Team tab; a coach can switch between all three pages, with `aria-current` on the active tab; logging out returns to Log In.

### `regression.test.jsx` (14 tests)

Tests for bugs fixed on 2026-10-30. Each one failed before its fix.

| Bug fixed | Tests |
|-----------|-------|
| Network failures did nothing (10) | When `fetch` rejects, Login, Signup, Profile (join team, leave team, change password), Workouts (log load, save workout, delete workout) and Team (view log) all show "could not reach the server". Logout still logs out locally. |
| Team log race (1) | A coach opens athlete A, then athlete B, and A's response arrives last. B's log stays on screen and nothing is stuck on "Loading...". |
| Log prefill matched by name (2) | A renamed workout still prefills from its last log. A different workout with the same name doesn't. |
| Change password length (1) | The new password input has `minLength` 8, matching signup. The server also rejects passwords under 8 characters on register, change-password and reset-password. |
