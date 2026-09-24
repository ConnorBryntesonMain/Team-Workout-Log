import { useEffect, useState } from "react";

const API_URL = "http://localhost:3000/api/auth";

export default function Profile({ onLoggedOut }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [teamError, setTeamError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/me`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "could not load profile");
        }

        setUser(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleLogout() {
    await fetch(`${API_URL}/logout`, {
      method: "POST",
      credentials: "include",
    });

    onLoggedOut();
  }

  async function handleJoinTeam() {
    setTeamError("");

    const res = await fetch(`${API_URL}/join-team`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        coachCode: teamCode,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setTeamError(data.error || "team code does not exist");
      return;
    }

    setUser({
      ...user,
      athleteCode: data.athleteCode,
    });
  }

  async function handleLeaveTeam() {
    const res = await fetch(`${API_URL}/leave-team`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      return;
    }

    setUser({
      ...user,
      athleteCode: null,
      coachName: null,
    });
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!user) {
    return <p>Loading...</p>;
  }

  return (
    <section id="center">
      <h1>Profile</h1>

      {user.role === "coach" && (
        <p
          style={{
            textAlign: "center",
            fontWeight: "bold",
            fontSize: "1.25rem",
            marginBottom: "1rem",
          }}
        >
          Coach Code: {user.coachCode}
        </p>
      )}

      {user.role === "athlete" &&
        (user.athleteCode ? (
          <div
            style={{
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            <p
              style={{
                fontWeight: "bold",
                fontSize: "1.25rem",
                margin: 0,
              }}
            >
              Team Code: {user.athleteCode}
            </p>

            {user.coachName && (
              <p
                style={{
                  marginTop: "0.5rem",
                }}
              >
                Coach Name: {user.coachName}
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            <label>
              Enter Team Code:
              <input
                type="text"
                maxLength="6"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                style={{ marginLeft: "8px" }}
              />
            </label>

            <button
              type="button"
              onClick={handleJoinTeam}
              style={{ marginLeft: "8px" }}
            >
              Join
            </button>

            {teamError && (
              <p
                role="alert"
                style={{
                  color: "red",
                  marginTop: "8px",
                }}
              >
                {teamError}
              </p>
            )}
          </div>
        ))}

      <dl>
        <dt>Name</dt>
        <dd>{user.name}</dd>

        <dt>Email</dt>
        <dd>{user.email}</dd>

        <dt>Role</dt>
        <dd>{user.role}</dd>

        <dt>Member since</dt>
        <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
      </dl>

      {user.role === "athlete" && user.athleteCode && (
  <>
    <button
      type="button"
      onClick={handleLeaveTeam}
      style={{
        display: "block",
        width: "120px",
        margin: "0 auto 10px auto",
        backgroundColor: "#dc3545",
        color: "white",
        border: "none",
        borderRadius: "4px",
        padding: "8px 16px",
        cursor: "pointer",
      }}
      >
      Leave Team
    </button>
    </>
    )}

    <button
      type="button"
      onClick={handleLogout}
      style={{
        display: "block",
        width: "120px",
        margin: "0 auto",
      }}
      >
      Log Out
    </button>

    </section>
  );
}