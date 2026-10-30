```mermaid
flowchart LR
    Client["React client<br/>Browser UI"] -->|Request| API["Node/Express API<br/>Business logic"]
    API -.->|Response| Client

    API -->|Request| DB[("PostgreSQL database<br/>Persistent storage")]
    DB -.->|Response| API

    Client -->|Session cookie| API
    API -->|Checks password hash<br/>bcrypt| DB
```

---



## Authentication

Session-cookie auth (`express-session`). Passwords and security answers are bcrypt-hashed; the session only stores `userId`.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (React)
    participant API as Express API
    participant S as Session store
    participant DB as PostgreSQL

    Note over B,DB: Register / Login
    B->>API: POST /api/auth/register or /login {email, password, ...}
    API->>DB: SELECT / INSERT users (bcrypt hash or compare)
    alt bad credentials / missing fields
        API-->>B: 400 / 401 / 409
    else ok
        API->>S: req.session.userId = user.id
        API-->>B: 200/201 user JSON + Set-Cookie connect.sid (httpOnly, 24h)
    end

    Note over B,DB: Any later request
    B->>API: GET /api/... (cookie sent, credentials: include)
    API->>S: look up session → userId
    alt no userId
        API-->>B: 401 not logged in
    else userId
        API->>DB: SELECT id, role, coach_code, athlete_code
        API-->>B: data scoped to that user (see Authorization)
    end

    Note over B,DB: Logout
    B->>API: POST /api/auth/logout
    API->>S: session.destroy()
    API-->>B: 204
```

### Password reset (no session needed)

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as Express API
    participant DB as PostgreSQL
    B->>API: POST /security-question {email}
    API->>DB: SELECT security_question
    API-->>B: question (404 if none)
    B->>API: POST /reset-password {email, answer, newPassword}
    API->>DB: bcrypt.compare(lowercased trimmed answer, security_answer_hash)
    alt wrong answer
        API-->>B: 401
    else correct
        API->>DB: UPDATE password_hash
        API-->>B: 200 success
    end
```

## Authorization

Every protected route loads the user from `req.session.userId`, then checks **role** and **team membership** (an athlete's `athlete_code` equals their coach's `coach_code`).

```mermaid
flowchart TD
    R[Request] --> S{session.userId?}
    S -- no --> U401[401 not logged in<br/>403 on role-gated write routes]
    S -- yes --> L[Load user: role, coach_code, athlete_code]
    L --> Role{role}

    Role -- coach --> C1[GET /workouts → own coach_workouts]
    Role -- coach --> C2[POST/PUT/DELETE /workouts → only rows WHERE coach_id = me]
    Role -- coach --> C3[GET /workouts/log?athleteId → only if athlete.athlete_code = my coach_code, else 404]
    Role -- coach --> C4[GET /auth/team → athletes with athlete_code = my coach_code]

    Role -- athlete --> A1[GET /workouts → coach_workouts of coach whose coach_code = my athlete_code]
    Role -- athlete --> A2[POST /workouts/log → only a workout from my coach]
    Role -- athlete --> A3[PUT/DELETE /workouts/log/:id → only rows WHERE athlete_id = me, else 404]
    Role -- athlete --> A4[POST /auth/join-team / leave-team → sets my athlete_code]

    Role -- wrong role for route --> F403[403 only coaches/athletes can ...]
```

| Route | Not logged in | Coach | Athlete |
|---|---|---|---|
| `GET /api/auth/me` | 401 | self | self + coach name |
| `GET /api/auth/team` | 401 | own team | empty list |
| `POST /api/auth/join-team`, `leave-team` | 401 | allowed (no role check) | allowed |
| `GET /api/workouts` | 401 | own templates | coach's templates |
| `POST/PUT/DELETE /api/workouts` | 403 | own templates only | 403 |
| `GET /api/workouts/log` | 401 | team athlete via `?athleteId` | own logs |
| `POST /api/workouts/log`, `PUT/DELETE /log/:id` | 403 | 403 | own logs only |
