# Team Workout Tracker
 
CS 415/515-002 — Software Design & Development
 
A web app that helps athletes track weight training and practice, and lets coaches see how an athlete's training compares to their max-lift expectations.
 
## The Problem
 
Athletes need an easy way to log weight training and practice, and see their own progress over time. Coaches need visibility into what their athletes are doing during the week, without relying on manual check-ins.
 
## Team
 
- Connor Brynteson — cjbrynteson@crimson.ua.edu
- Jaxson Zuccala — jdzuccala@crimson.ua.edu
## Tech Stack
 
- **Frontend:** React
- **Backend:** Node.js / Express
- **Database:** PostgreSQL
- **Authentication:** Session cookies (`express-session`) with bcrypt-hashed passwords

## Running Locally

The app has three pieces, and all three must be running:

| Piece | Folder | URL |
|-------|--------|-----|
| PostgreSQL database | — | `localhost:5432` |
| Express API server | `server/` | http://localhost:3000 |
| React frontend (Vite) | `client/` | http://localhost:5173 |

### 1. Prerequisites

- **Node.js 20.19+ or 22.12+** (Vite requires one of these). Check with `node -v`. Download from https://nodejs.org.
- **PostgreSQL 14 or newer.** Check with `psql --version`.
  - **macOS:** `brew install postgresql@16 && brew services start postgresql@16`, or install [Postgres.app](https://postgresapp.com).
  - **Windows:** use the installer from https://www.postgresql.org/download/windows/. Remember the password you set for the `postgres` user.
  - **Ubuntu / WSL:** `sudo apt install postgresql && sudo service postgresql start`

### 2. Create the database

The server does **not** create tables on its own; this step is required.

Make sure the `postgres` user has a password (the server logs in over TCP, which needs one). On Linux/WSL:

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
```

(On macOS with Homebrew, the superuser is usually your macOS username with no password; use that name for `DB_USER` in step 3 and drop `-U postgres` below. On Windows, use the password you chose in the installer.)

Then, from the repository root, create the database and load the schema:

```bash
createdb -h localhost -U postgres team_workout_log
psql -h localhost -U postgres -d team_workout_log -f server/db/schema.sql
```

You should see several `CREATE TABLE` and `CREATE INDEX` lines (tables: `users`, `coach_workouts`, `workouts`, `workout_exercises`).

Load the demo accounts (safe to run more than once):

```bash
psql -h localhost -U postgres -d team_workout_log -f server/db/seed.sql
```

You should see `INSERT 0 2` (or `INSERT 0 0` if they already exist). This creates:

| Email | Password | Role | Coach code |
|-------|----------|------|------------|
| `coach@demo.com` | `password123` | coach | `123456` |
| `athlete@demo.com` | `password123` | athlete | — |

**Already had a database from an earlier version?** Re-running `schema.sql` is safe and creates any missing tables (such as the workout tables), but it never changes an existing table. If `users` predates coach codes, either add the new columns:

```bash
psql -h localhost -U postgres -d team_workout_log -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_code VARCHAR(6) NOT NULL DEFAULT '000000', ADD COLUMN IF NOT EXISTS athlete_code VARCHAR(6);"
```

or start fresh (this deletes all accounts) and then re-run the schema and seed commands above:

```bash
psql -h localhost -U postgres -d team_workout_log -c "DROP TABLE users;"
```

### 3. Configure and start the server

```bash
cd server
cp .env.example .env
```

Open `server/.env` and fill in `DB_PASSWORD` (and `DB_USER` if it isn't `postgres`). Any string works for `SESSION_SECRET`, but it must not be empty. The file looks like this:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=team_workout_log
SESSION_SECRET=change-me
```

| Variable | What it is |
|----------|------------|
| `PORT` | Port the API server listens on. Keep `3000`; the frontend expects it. |
| `DB_HOST` / `DB_PORT` | Where PostgreSQL is running. |
| `DB_USER` / `DB_PASSWORD` | PostgreSQL login from step 2. |
| `DB_NAME` | Database created in step 2 (`team_workout_log`). |
| `SESSION_SECRET` | Signs login cookies. Any non-empty string for local use. |

`.env` is git-ignored; never commit it. `.env.example` holds no real secrets.

Install dependencies and start the server:

```bash
npm install
npm start
```

You should see `Server listening on port 3000`. In another terminal, confirm it can reach the database:

```bash
curl http://localhost:3000/health
# {"status":"ok","db":"connected"}
```

You can also open http://localhost:3000/health in a browser.

### 4. Start the frontend

In a **new terminal** (leave the server running), from the repository root:

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`: the server only accepts requests from `http://localhost:5173`, so the other address makes login fail.

### 5. Verification guide (for the TA)

With the database, server, and frontend running as above:

| # | Do this | Expected result |
|---|---------|-----------------|
| 1 | `curl http://localhost:3000/health` | `{"status":"ok","db":"connected"}` |
| 2 | Open http://localhost:5173 and log in as `coach@demo.com` / `password123` | The **Profile** page shows Coach Code `123456`, Demo Coach, the email, role `coach`, and a member-since date. |
| 3 | Click **Workouts** in the nav bar | "You haven't built any workouts yet." and a **New Workout** button. |
| 4 | Click **New Workout**, name it `Leg Day`, add `Squat` / 3 sets / `8` reps, click **Save Workout** | The **Leg Day** table appears with **Edit** and **Delete** buttons. |
| 5 | Click **Edit**, change reps to `10`, click **Save Workout** | The table shows 10 reps. |
| 6 | Click **Team** in the nav bar | "No athletes yet" appears (the demo athlete hasn't joined). |
| 7 | Click **Profile**, then **Log Out** | You return to the login page. |
| 8 | Log in as `athlete@demo.com` / `password123` | The Profile page shows role `athlete`, an **Enter Team Code** box, and no **Team** tab. |
| 9 | Click **Workouts** | "Your coach hasn't posted any workouts yet." and an empty **My Log**. |
| 10 | Click **Profile**, enter `999999` and click **Join** | The error "team code does not exist" appears. |
| 11 | Enter `123456` and click **Join** | The page shows Team Code `123456`, Coach Name: Demo Coach, and a **Leave Team** button. |
| 12 | Click **Workouts**, then **Log This Workout** under Leg Day | A form with one row per set, reps prefilled with `10`. |
| 13 | Enter weights (e.g. `225`), leave one blank, click **Save Log** | **My Log** shows Leg Day with today's date; the blank weight shows "Bodyweight". |
| 14 | Log out, log in as `coach@demo.com`, click **Team** | Demo Athlete is listed with their email. |
| 15 | Click **View Workout** next to Demo Athlete | The athlete's logged Leg Day opens under that row; the button changes to **Hide Workout**. |
| 16 | Log out, log in as `athlete@demo.com`, click **Leave Team** | The Enter Team Code box returns. |
| 17 | Log out, try `athlete@demo.com` with a wrong password | The error "invalid email or password" appears. |
| 18 | Click **Sign Up**, create a new account, pick a role | You land on that new account's Profile page. |
| 19 | Log out, try signing up again with the same email | The error "email already registered" appears. |

### Running tests

From `server/`:

```bash
node --test src/
```

This runs the workout validation checks in `server/src/routes/workouts.test.js` (no database needed).

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/health` returns `password authentication failed` | `DB_USER` / `DB_PASSWORD` in `server/.env` don't match Postgres. Redo the password step in step 2. |
| `/health` returns `database "team_workout_log" does not exist` | Run the `createdb` command in step 2. |
| `/health` returns `ECONNREFUSED` | Postgres isn't running. Start it (`brew services start postgresql@16`, `sudo service postgresql start`, or the Windows *Services* app). |
| Server shows `column "coach_code" does not exist` | Your database predates the coach-code change. Run the `ALTER TABLE` command in step 2. |
| Workouts page shows `internal server error` and the server shows `relation "coach_workouts" does not exist` (or `workouts`) | Your database predates the workout tables. Re-run the `psql ... -f server/db/schema.sql` command in step 2. |
| Sign-up fails with `relation "users" does not exist` | The schema wasn't loaded. Run the `psql ... -f server/db/schema.sql` command in step 2. |
| Login/sign-up returns `internal server error` and the server terminal shows `secret option required for sessions` | `server/.env` is missing or `SESSION_SECRET` is empty. Redo step 3, then restart the server. |
| `EADDRINUSE: address already in use :::3000` | Something else is using port 3000. Stop it, or set `PORT` in `.env`. The frontend expects port 3000, so stopping the other program is simpler. |
| Login/sign-up shows a network error in the browser | Make sure the server terminal is still running and you opened `http://localhost:5173`, not `127.0.0.1`. |
| A page shows `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` | The server is running old code without that route. Stop it (Ctrl+C) and start it again. `npm run dev` in `server/` restarts on file changes, but can miss some edits on WSL. |
| `npm run dev` errors about the Node version | Upgrade Node to 20.19+ or 22.12+. |

## Features (MVP)
 
- Login page for users. **(done)**
- Team code access, so athletes can join a coach's team. **(done: join, leave, and a coach Team page listing athletes)**
- Exercise templates, and athletes selecting workouts from templates. **(done: coaches create, edit, and delete workouts; athletes on the team see them)**
- Log of workouts. **(done: athletes log reps and weight per set and see their history under My Log)**
- Athlete-assigned workouts. *(every workout a coach builds is shared with the whole team; no per-athlete assignment yet)*
- Coach access to an athlete's workout log. **(done: Team page → View Workout shows the athlete's logged workouts)**
## Possible Later Features
 
- Custom exercise creation (coach and athlete).
- Max rep records, and updating max rep records.
- Spreadsheet export.
- Previous weight numbers shown from the last workout.
