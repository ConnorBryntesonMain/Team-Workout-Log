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

You should see `CREATE TABLE`.

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

### 5. Try it out

1. Click **Sign Up**, fill in the form, and create an account (pick *coach* or *athlete*).
2. You land on your **Profile** page, which shows your account details.
3. Use the **Workouts** tab to see the base workout.
4. Click **Log Out**, then log back in with the same email and password.

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/health` returns `password authentication failed` | `DB_USER` / `DB_PASSWORD` in `server/.env` don't match Postgres. Redo the password step in step 2. |
| `/health` returns `database "team_workout_log" does not exist` | Run the `createdb` command in step 2. |
| `/health` returns `ECONNREFUSED` | Postgres isn't running. Start it (`brew services start postgresql@16`, `sudo service postgresql start`, or the Windows *Services* app). |
| Sign-up fails with `relation "users" does not exist` | The schema wasn't loaded. Run the `psql ... -f server/db/schema.sql` command in step 2. |
| Login/sign-up returns `internal server error` and the server terminal shows `secret option required for sessions` | `server/.env` is missing or `SESSION_SECRET` is empty. Redo step 3, then restart the server. |
| `EADDRINUSE: address already in use :::3000` | Something else is using port 3000. Stop it, or set `PORT` in `.env`. The frontend expects port 3000, so stopping the other program is simpler. |
| Login/sign-up shows a network error in the browser | Make sure the server terminal is still running and you opened `http://localhost:5173`, not `127.0.0.1`. |
| `npm run dev` errors about the Node version | Upgrade Node to 20.19+ or 22.12+. |

## Features (MVP)
 
- Team code access, so athletes can join a coach's team.
- Exercise templates, and athletes selecting workouts from templates.
- Login page for users.
- Log of workouts.
- Athlete-assigned workouts.
- Coach access to an athlete's workout log.
## Possible Later Features
 
- Custom exercise creation (coach and athlete).
- Max rep records, and updating max rep records.
- Spreadsheet export.
- Previous weight numbers shown from the last workout.
